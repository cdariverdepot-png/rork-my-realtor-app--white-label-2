import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import { Image } from "expo-image";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";

const SPLASH_MODULE = require("@/assets/splash-loading.mp4");
const POSTER = require("@/assets/splash-loading-poster.jpg");

// Play the supplied animation through its ending before fading.
const SPLASH_END_SEC = Number.POSITIVE_INFINITY;

interface Props {
  /** True once auth has hydrated — curtain may fade after the video holds. */
  ready?: boolean;
  /** Called once the curtain has fully faded out and the boot screen can unmount. */
  onFinish: () => void;
}

/**
 * Full-viewport launch splash using the branded loading animation video.
 * Plays the full animation at its encoded speed, then fades when the app is ready.
 * Black/#0a0a0a curtain prevents any peek of underlying UI.
 */
export default function BootScreen({ ready = true, onFinish }: Props) {
  const curtain = useRef(new Animated.Value(1)).current;
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoDone, setVideoDone] = useState(false);
  const fading = useRef(false);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const nativeRef = useRef<Video>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(SPLASH_MODULE);
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (!cancelled && uri) setVideoUri(uri);
      } catch (e) {
        console.log("[BootScreen] asset load failed", e);
        if (!cancelled) setVideoDone(true);
      }
    })();
    const failSafe = setTimeout(() => {
      if (!cancelled) setVideoDone(true);
    }, 12000);
    return () => {
      cancelled = true;
      clearTimeout(failSafe);
    };
  }, []);

  const beginFade = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    Animated.timing(curtain, {
      toValue: 0,
      duration: 550,
      easing: Easing.bezier(0.42, 0, 0.58, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinishRef.current();
    });
  }, [curtain]);

  useEffect(() => {
    if (videoDone && ready) beginFade();
  }, [videoDone, ready, beginFade]);

  const finishVideo = useCallback(() => {
    setVideoDone(true);
  }, []);

  const holdLastFrameWeb = useCallback(() => {
    const el = videoElRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    finishVideo();
  }, [finishVideo]);

  const onWebTimeUpdate = useCallback(() => {
    const el = videoElRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const cutAt = Math.min(el.duration, SPLASH_END_SEC);
    if (el.currentTime >= cutAt) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      finishVideo();
    }
  }, [finishVideo]);

  const onNativeStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const duration = status.durationMillis ?? 0;
    const position = status.positionMillis ?? 0;
    if (duration > 0 && position >= Math.min(duration, SPLASH_END_SEC * 1000)) {
      void nativeRef.current?.pauseAsync().catch(() => {});
      finishVideo();
      return;
    }
    if (status.didJustFinish) {
      void nativeRef.current?.pauseAsync().catch(() => {});
      finishVideo();
    }
  }, [finishVideo]);

  useEffect(() => {
    if (Platform.OS !== "web" || !videoUri) return;
    const el = videoElRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.loop = false;
    const play = el.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => setVideoDone(true));
    }
  }, [videoUri]);

  const webVideo =
    Platform.OS === "web"
      ? React.createElement("video", {
          ref: (node: HTMLVideoElement | null) => {
            videoElRef.current = node;
          },
          src: videoUri ?? undefined,
          muted: true,
          autoPlay: true,
          playsInline: true,
          preload: "auto",
          "webkit-playsinline": "true",
          disablePictureInPicture: true,
          controls: false,
          onEnded: holdLastFrameWeb,
          onTimeUpdate: onWebTimeUpdate,
          onError: () => setVideoDone(true),
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            backgroundColor: "#0a0a0a",
          },
        })
      : null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.fill, { opacity: curtain }]}
      accessibilityLabel="Loading"
    >
      <View style={styles.videoHost}>
        {/* Poster underneath so last-frame / load gap never shows UI */}
        <Image
          source={POSTER}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
        {Platform.OS === "web" ? (
          webVideo
        ) : videoUri ? (
          <Video
            ref={nativeRef}
            source={{ uri: videoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping={false}
            isMuted
            onPlaybackStatusUpdate={onNativeStatus}
            onError={() => setVideoDone(true)}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    ...(Platform.OS === "web"
      ? {
          position: "fixed" as unknown as "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%" as unknown as number,
          height: "100dvh" as unknown as number,
          minHeight: "100dvh" as unknown as number,
        }
      : {}),
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  videoHost: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0a0a0a",
    overflow: "hidden",
  },
});

