import React, { useCallback, useEffect, useRef } from "react";
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

/** White covers the last part of the clip. It does not add time after the video. */
const FADE_LEAD_SEC = 0.9;

interface Props {
  /** Auth hydration. It must not hold or stretch the intro. */
  ready?: boolean;
  /** Called once the white fade has covered the clip and the boot screen can unmount. */
  onFinish: () => void;
}

/**
 * Launch splash. The zoom plays at its encoded rate with no seek, pause, or
 * time-stretch. A white fade overlaps the ending, then the app is shown.
 */
export default function BootScreen({ onFinish }: Props) {
  const white = useRef(new Animated.Value(0)).current;
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const nativeRef = useRef<Video>(null);
  const onFinishRef = useRef(onFinish);
  const fadeStarted = useRef(false);
  const finished = useRef(false);
  onFinishRef.current = onFinish;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinishRef.current();
  }, []);

  const startWhiteFade = useCallback((durationMs: number) => {
    if (fadeStarted.current) return;
    fadeStarted.current = true;
    Animated.timing(white, {
      toValue: 1,
      duration: Math.max(220, Math.round(durationMs)),
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished: done }) => {
      if (done) finish();
    });
  }, [finish, white]);

  useEffect(() => {
    let cancelled = false;
    try {
      const asset = Asset.fromModule(SPLASH_MODULE);
      const uri = asset.localUri ?? asset.uri;
      if (!cancelled && uri && videoElRef.current && !videoElRef.current.src) {
        videoElRef.current.src = uri;
      }
      if (!uri) {
        asset.downloadAsync().then(() => {
          const next = asset.localUri ?? asset.uri;
          const el = videoElRef.current;
          if (!cancelled && next && el && !el.src) el.src = next;
        }).catch(() => {
          if (!cancelled) finish();
        });
      }
    } catch (e) {
      console.log("[BootScreen] asset load failed", e);
      if (!cancelled) finish();
    }
    const failSafe = setTimeout(() => {
      if (!cancelled) finish();
    }, 7000);
    return () => {
      cancelled = true;
      clearTimeout(failSafe);
    };
  }, [finish]);

  const playWeb = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (!el) return;
    if (!el.src) {
      try {
        const asset = Asset.fromModule(SPLASH_MODULE);
        const uri = asset.localUri ?? asset.uri;
        if (uri) el.src = uri;
      } catch {
        /* resolved in the mount effect */
      }
    }
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.loop = false;
    el.playbackRate = 1;
    const play = el.play();
    if (play && typeof play.catch === "function") play.catch(() => finish());
  }, [finish]);

  const onWebTimeUpdate = useCallback(() => {
    const el = videoElRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const remain = el.duration - el.currentTime;
    if (remain <= FADE_LEAD_SEC) startWhiteFade(remain * 1000);
  }, [startWhiteFade]);

  const onWebEnded = useCallback(() => {
    if (!fadeStarted.current) startWhiteFade(240);
  }, [startWhiteFade]);

  const onNativeStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const duration = status.durationMillis ?? 0;
    const position = status.positionMillis ?? 0;
    if (duration > 0 && duration - position <= FADE_LEAD_SEC * 1000) {
      startWhiteFade(duration - position);
    }
    if (status.didJustFinish && !fadeStarted.current) startWhiteFade(240);
  }, [startWhiteFade]);

  const webVideo =
    Platform.OS === "web"
      ? React.createElement("video", {
          ref: playWeb,
          muted: true,
          autoPlay: true,
          playsInline: true,
          preload: "auto",
          "webkit-playsinline": "true",
          disablePictureInPicture: true,
          controls: false,
          onEnded: onWebEnded,
          onTimeUpdate: onWebTimeUpdate,
          onError: () => finish(),
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            backgroundColor: "transparent",
          },
        })
      : null;

  return (
    <View pointerEvents="none" style={styles.fill} accessibilityLabel="Loading">
      <View style={styles.videoHost}>
        <Image
          source={POSTER}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={0}
        />
        {Platform.OS === "web" ? (
          webVideo
        ) : (
          <Video
            ref={nativeRef}
            source={SPLASH_MODULE}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
            isMuted
            rate={1}
            progressUpdateIntervalMillis={80}
            onPlaybackStatusUpdate={onNativeStatus}
            onError={() => finish()}
          />
        )}
      </View>
      <Animated.View pointerEvents="none" style={[styles.white, { opacity: white }]} />
    </View>
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
    backgroundColor: "#101014",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  videoHost: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#101014",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  white: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#ffffff",
  },
});
