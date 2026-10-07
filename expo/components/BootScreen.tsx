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
import { dark } from "@/constants/colors";

const SPLASH_MODULE = require("@/assets/splash-loading.mp4");
const POSTER = require("@/assets/splash-loading-poster.jpg");

/** Short dissolve into the app's own night background. Overlaps the ending only. */
const FADE_LEAD_SEC = 0.35;

interface Props {
  /** Auth hydration. It must not hold or stretch the intro. */
  ready?: boolean;
  /** Called once the splash has dissolved and the boot screen can unmount. */
  onFinish: () => void;
}

/**
 * Launch splash. The zoom plays at its encoded rate. Nothing seeks, pauses,
 * or changes playback speed. The last third of a second dissolves into the
 * same near-black the app is already painted with.
 */
export default function BootScreen({ onFinish }: Props) {
  const curtain = useRef(new Animated.Value(1)).current;
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const nativeRef = useRef<Video>(null);
  const onFinishRef = useRef(onFinish);
  const fadeStarted = useRef(false);
  const finished = useRef(false);
  const fadeMs = useRef(FADE_LEAD_SEC * 1000);
  const [fading, setFading] = useState(false);
  onFinishRef.current = onFinish;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinishRef.current();
  }, []);

  const startFade = useCallback((durationMs: number) => {
    if (fadeStarted.current) return;
    fadeStarted.current = true;
    fadeMs.current = durationMs;
    setFading(true);
  }, []);

  useEffect(() => {
    if (!fading) return;
    const anim = Animated.timing(curtain, {
      toValue: 0,
      duration: Math.max(180, Math.round(fadeMs.current)),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished: done }) => {
      if (done) finish();
    });
    return () => anim.stop();
  }, [curtain, fading, finish]);

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
    const play = el.play();
    if (play && typeof play.catch === "function") play.catch(() => finish());
  }, [finish]);

  const onWebTimeUpdate = useCallback(() => {
    const el = videoElRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const remain = el.duration - el.currentTime;
    if (remain <= FADE_LEAD_SEC) startFade(remain * 1000);
  }, [startFade]);

  const onWebEnded = useCallback(() => {
    if (!fadeStarted.current) startFade(200);
  }, [startFade]);

  const onNativeStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const duration = status.durationMillis ?? 0;
    const position = status.positionMillis ?? 0;
    if (duration > 0 && duration - position <= FADE_LEAD_SEC * 1000) {
      startFade(duration - position);
    }
    if (status.didJustFinish && !fadeStarted.current) startFade(200);
  }, [startFade]);

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
    <Animated.View pointerEvents="none" style={[styles.fill, fading ? { opacity: curtain } : null]} accessibilityLabel="Loading">
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
            progressUpdateIntervalMillis={200}
            onPlaybackStatusUpdate={onNativeStatus}
            onError={() => finish()}
          />
        )}
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
    backgroundColor: dark.bg,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  videoHost: {
    ...StyleSheet.absoluteFill,
    backgroundColor: dark.bg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
