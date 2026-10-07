import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { safeImageSource } from "@/lib/safeImageSource";
import * as Haptics from "expo-haptics";
import {
  Building2,
  CalendarDays,
  Heart,
  Key,
  Home,
  MessageSquareHeart,
  Palette,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import type { Audience } from "@/contexts/OnboardingContext";


interface Slide {
  icon: React.ReactNode;
  title: string;
  body: string;
  bg: number;
}

// Backgrounds move sequentially from a wide city overview down to a single
// front door — mirroring the copy's arc from "your brand everywhere" to
// "complete control" of every last detail.
const SLIDES: Slide[] = [
  {
    icon: <Building2 size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Your Brand,\nYour App",
    body: "Add your website, documents, and photos. We'll build a branded starting point that fits your style.",
    bg: require("@/assets/images/onboard-bg-brand.jpg"),
  },
  {
    icon: <Key size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Private\nClient Codes",
    body: "Share a unique 6-character code with your clients. They enter it once and unlock an app tailored exclusively to you.",
    bg: require("@/assets/images/onboard-bg-codes.jpg"),
  },
  {
    icon: <Home size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Beautiful\nListings",
    body: "Showcase properties with rich imagery, market insights, saved favorites, and a curated editorial feel.",
    bg: require("@/assets/images/onboard-bg-listings.jpg"),
  },
  {
    icon: <MessageSquareHeart size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Stay\nConnected",
    body: "Built-in messaging, document sharing, appointment booking, and push notifications keep everyone in sync.",
    bg: require("@/assets/images/onboard-bg-connected.jpg"),
  },
  {
    icon: <Palette size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Your App,\nReady to Use",
    body: "We'll ask about anything we can't confirm. Finish setup to see your dashboard, then edit or switch layouts whenever you like.",
    bg: require("@/assets/images/onboard-bg-control.jpg"),
  },
];

// The client tour walks the same five backgrounds in the same order, so the
// visual arc is identical — only the copy changes, told from the buyer's side
// of the same relationship.
const CLIENT_SLIDES: Slide[] = [
  {
    icon: <Building2 size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Welcome\nInside",
    body: "This app belongs to your realtor. You're not on a public search portal — you're on a private line to the person handling your move.",
    bg: require("@/assets/images/onboard-bg-brand.jpg"),
  },
  {
    icon: <Key size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Your Code,\nYour Agent",
    body: "The code you entered connected you directly to your realtor. Everything you see here has been set up specifically for you.",
    bg: require("@/assets/images/onboard-bg-codes.jpg"),
  },
  {
    icon: <Heart size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Homes Worth\nSeeing",
    body: "Browse hand-picked listings with full galleries and market insight. Save the ones you love — your realtor sees every favorite.",
    bg: require("@/assets/images/onboard-bg-listings.jpg"),
  },
  {
    icon: <CalendarDays size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Book A\nShowing",
    body: "Request a viewing, message your realtor, and open paperwork in their secure signing portal.",
    bg: require("@/assets/images/onboard-bg-connected.jpg"),
  },
  {
    icon: <MessageSquareHeart size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Nothing\nSlips",
    body: "Documents, appointments, and updates live in one place. Next, add your contact preference and moving plans to open your app.",
    bg: require("@/assets/images/onboard-bg-control.jpg"),
  },
];

interface Props {
  audience: Audience;
  onFinish: () => void;
}

/** Pure step helper — Next from page i (0-based). null means Finish. */
export function nextWalkthroughIndex(current: number, total: number): number | null {
  if (total <= 0) return null;
  if (current < 0) return 0;
  if (current >= total - 1) return null;
  return current + 1;
}

/**
 * Animating opacity directly on the image keeps each background a single
 * compositing layer. Wrapping it in an extra Animated.View forces iOS to
 * flatten the stack into an offscreen buffer, which visibly softens the photo.
 */
const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function OnboardingCarousel({ audience, onFinish }: Props) {
  const slides: Slide[] = audience === "client" ? CLIENT_SLIDES : SLIDES;
  // Live window width — module-level Dimensions.get("window") is stale on Expo
  // web (SSR / first paint) and made slide width ≠ FlatList viewport, so the
  // first Next (0→1) looked like a no-op while later swipe/back still moved.
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState<number>(windowWidth);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const flatListRef = useRef<FlatList<Slide>>(null);
  const indexRef = useRef<number>(0);
  const isSkipping = useRef<boolean>(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const pageWidthSafe = pageWidth > 0 ? pageWidth : windowWidth > 0 ? windowWidth : 1;
  const bgFade = Animated.divide(scrollX, pageWidthSafe);

  useEffect(() => {
    if (windowWidth > 0) setPageWidth(windowWidth);
  }, [windowWidth]);

  // Entrance animation. This runs while the boot curtain is still covering the
  // screen, so the carousel is already fully opaque by the time the logo
  // dissolves — the two sequences read as one continuous motion.
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const syncIndex = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, idx));
    indexRef.current = clamped;
    setCurrentIndex((prev) => (prev === clamped ? prev : clamped));
  }, [slides.length]);

  const dragStartedOnLast = useRef(false);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const w = pageWidthSafe;
      const idx = Math.round(e.nativeEvent.contentOffset.x / w);
      if (idx !== indexRef.current) syncIndex(idx);
    },
    [pageWidthSafe, syncIndex],
  );

  const finish = useCallback(() => {
    if (isSkipping.current) return;
    isSkipping.current = true;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Tell the host immediately so it can route to /client-profile and raise an
    // opaque gate before this overlay unmounts. Fading the *content* only —
    // never the root — so the Eliza Vance home underneath cannot flash through.
    onFinish();
    Animated.timing(entrance, {
      toValue: 0,
      duration: 420,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [entrance, onFinish]);

  const scrollToPage = useCallback(
    (index: number, animated = true) => {
      const offset = index * pageWidthSafe;
      // scrollToOffset is reliable on web; scrollToIndex often no-ops on the
      // first advance before cells are measured (exactly the 0→1 failure).
      const list = flatListRef.current;
      if (!list) return;
      if (typeof list.scrollToOffset === "function") {
        list.scrollToOffset({ offset, animated });
      } else {
        list.scrollToIndex({ index, animated });
      }
    },
    [pageWidthSafe],
  );

  const goNext = useCallback(() => {
    const next = nextWalkthroughIndex(indexRef.current, slides.length);
    if (next == null) {
      finish();
      return;
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    // Optimistic index so repeated Next works even if momentum end is quiet on web.
    // Critical for page 0→1: do not wait on scrollToIndex measurement.
    syncIndex(next);
    scrollToPage(next, true);
  }, [slides.length, finish, syncIndex, scrollToPage]);

  const onSwipeEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const vx = e.nativeEvent.velocity?.x ?? 0;
      if (dragStartedOnLast.current && vx < -0.15) {
        finish();
        return;
      }
      handleScroll(e);
    },
    [finish, handleScroll],
  );

  const goBack = useCallback(() => {
    const prev = indexRef.current - 1;
    if (prev < 0) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    syncIndex(prev);
    scrollToPage(prev, true);
  }, [syncIndex, scrollToPage]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => subscription.remove();
  }, [goBack]);

  const getItemLayout = useCallback(
    (_: ArrayLike<Slide> | null | undefined, index: number) => ({
      length: pageWidthSafe,
      offset: pageWidthSafe * index,
      index,
    }),
    [pageWidthSafe],
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      requestAnimationFrame(() => scrollToPage(info.index, false));
    },
    [scrollToPage],
  );

  const opacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - pageWidth) > 0.5) {
          setPageWidth(w);
          requestAnimationFrame(() => {
            flatListRef.current?.scrollToOffset({
              offset: indexRef.current * w,
              animated: false,
            });
          });
        }
      }}
    >
      {/* Solid curtain — never animated away, so home/demo cannot flash under exit. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark.bg }]} pointerEvents="none" />

      <Animated.View pointerEvents="none" style={[styles.bgLayer, { opacity }]}>
        {slides.map((slide, i) => (
          <AnimatedImage
            key={i}
            pointerEvents="none"
            source={safeImageSource(slide.bg) ?? undefined}
            style={[
              styles.bg,
              {
                opacity: bgFade.interpolate({
                  inputRange: [i - 1, i, i + 1],
                  outputRange: [0, 1, 0],
                  extrapolate: "clamp",
                }),
              },
            ]}
            contentFit="cover"
            contentPosition="center"
            transition={0}
            allowDownscaling={false}
            cachePolicy="memory-disk"
            priority="high"
          />
        ))}
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[styles.content, { opacity, transform: [{ translateY }] }]}
      >
        <View style={styles.slideArea} pointerEvents="box-none">
          <Animated.FlatList
            ref={flatListRef}
            data={slides}
            keyExtractor={(_, i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={() => {
              dragStartedOnLast.current = indexRef.current >= slides.length - 1;
            }}
            onMomentumScrollEnd={handleScroll}
            onScrollEndDrag={onSwipeEnd}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
              useNativeDriver: false,
              listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const w = pageWidthSafe;
                if (!(w > 0)) return;
                const idx = Math.max(0, Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / w)));
                if (idx !== indexRef.current) syncIndex(idx);
              },
            })}
            scrollEventThrottle={16}
            bounces
            getItemLayout={getItemLayout}
            onScrollToIndexFailed={onScrollToIndexFailed}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: pageWidthSafe }]}>
                <View style={styles.iconRing}>
                  {item.icon}
                </View>
                <Text style={styles.slideTitle}>{item.title}</Text>
                <Text style={styles.slideBody}>{item.body}</Text>
              </View>
            )}
          />
        </View>

        <View style={styles.bottomBar} pointerEvents="box-none">
          <View style={styles.dotsRow}>
            {slides.map((_, i) => {
              const active = i === currentIndex;
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    if (active && i === slides.length - 1) {
                      finish();
                      return;
                    }
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    syncIndex(i);
                    scrollToPage(i, true);
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={active && i === slides.length - 1 ? "Get started" : `Page ${i + 1}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.dot, active && styles.dotActive]}
                >
                  <BlurView pointerEvents="none" intensity={36} tint="light" style={StyleSheet.absoluteFill} />
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, active ? styles.dotFillOn : styles.dotFill]} />
                  <View pointerEvents="none" style={styles.dotRim} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}


const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: dark.bg,
    zIndex: 9998,
    overflow: "visible",
    ...(Platform.OS === "web"
      ? {
          position: "fixed" as unknown as "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%" as unknown as number,
        }
      : {}),
  },
  // Photos hang past the overlay so the sign-in door cannot show in the
  // strip under the screen. The footer stays in the overlay.
  bgLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: -240,
  },
  bg: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  content: {
    flex: 1,
  },
  slideArea: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 40,
    paddingBottom: 20,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
    backgroundColor: "rgba(210,163,67,0.06)",
  },
  slideTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: 18,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  slideBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.9)",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  bottomBar: {
    alignItems: "center",
    paddingBottom: 28,
    zIndex: 20,
    elevation: 20,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  dotActive: {
    width: 36,
    borderRadius: 6,
    borderColor: "rgba(255,255,255,0.62)",
  },
  dotFill: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  dotFillOn: {
    backgroundColor: "rgba(255,255,255,0.32)",
  },
  dotRim: {
    position: "absolute",
    top: 0,
    left: 2,
    right: 2,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
});
