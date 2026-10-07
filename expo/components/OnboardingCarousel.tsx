import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { safeImageSource } from "@/lib/safeImageSource";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ArrowRight,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import type { Audience } from "@/contexts/OnboardingContext";
import { GlassNavButton, OnboardingDots, OnboardingEmblem, OnboardingNextButton } from "@/components/onboardingChrome";


interface Slide {
  title: string;
  body: string;
  bg: number;
}

// Backgrounds move sequentially from a wide city overview down to a single
// front door — mirroring the copy's arc from "your brand everywhere" to
// "complete control" of every last detail.
const SLIDES: Slide[] = [
  {
    title: "Your Brand,\nYour App",
    body: "Add your website, documents, and photos. We'll build a branded starting point that fits your style.",
    bg: require("@/assets/images/onboard-bg-brand.jpg"),
  },
  {
    title: "Private\nClient Codes",
    body: "Share a unique 6-character code with your clients. They enter it once and unlock an app tailored exclusively to you.",
    bg: require("@/assets/images/onboard-bg-codes.jpg"),
  },
  {
    title: "Beautiful\nListings",
    body: "Showcase properties with rich imagery, market insights, saved favorites, and a curated editorial feel.",
    bg: require("@/assets/images/onboard-bg-listings.jpg"),
  },
  {
    title: "Stay\nConnected",
    body: "Built-in messaging, document sharing, appointment booking, and push notifications keep everyone in sync.",
    bg: require("@/assets/images/onboard-bg-connected.jpg"),
  },
  {
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
    title: "Welcome\nInside",
    body: "This app belongs to your realtor. You're not on a public search portal — you're on a private line to the person handling your move.",
    bg: require("@/assets/images/onboard-bg-brand.jpg"),
  },
  {
    title: "Your Code,\nYour Agent",
    body: "The code you entered connected you directly to your realtor. Everything you see here has been set up specifically for you.",
    bg: require("@/assets/images/onboard-bg-codes.jpg"),
  },
  {
    title: "Homes Worth\nSeeing",
    body: "Browse hand-picked listings with full galleries and market insight. Save the ones you love — your realtor sees every favorite.",
    bg: require("@/assets/images/onboard-bg-listings.jpg"),
  },
  {
    title: "Book A\nShowing",
    body: "Request a viewing, message your realtor, and open paperwork in their secure signing portal.",
    bg: require("@/assets/images/onboard-bg-connected.jpg"),
  },
  {
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
  const insets = useSafeAreaInsets();
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

      <Animated.View
        pointerEvents="box-none"
        style={[styles.content, { opacity, transform: [{ translateY }] }]}
      >
        {slides.map((slide, i) => (
          <AnimatedImage
            key={i}
            pointerEvents="none"
            source={safeImageSource(slide.bg) ?? undefined}
            style={[
              StyleSheet.absoluteFill,
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

        <View style={[styles.topNavRow, { top: Math.max(insets.top, 52) }]} pointerEvents="box-none">
          <GlassNavButton
            label="Back"
            icon={<ArrowLeft size={16} color={brand.ivory} strokeWidth={1.75} />}
            onPress={goBack}
            accessibilityLabel="Back to previous walkthrough step"
            hidden={currentIndex === 0}
          />
          <OnboardingEmblem />
          <GlassNavButton
            label="Skip"
            icon={<ArrowRight size={16} color={brand.ivory} strokeWidth={1.75} />}
            iconAfter
            onPress={finish}
            accessibilityLabel="Skip walkthrough"
          />
        </View>

        <View style={styles.slideArea} pointerEvents="box-none">
          <Animated.FlatList
            ref={flatListRef}
            data={slides}
            keyExtractor={(_, i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            onScrollEndDrag={handleScroll}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
            scrollEventThrottle={16}
            bounces={false}
            getItemLayout={getItemLayout}
            onScrollToIndexFailed={onScrollToIndexFailed}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: pageWidthSafe, paddingTop: Math.max(insets.top, 52) + 92 }]}>
                <Text style={styles.slideTitle}>{item.title}</Text>
                <Text style={styles.slideBody}>{item.body}</Text>
              </View>
            )}
          />
        </View>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 18 }]} pointerEvents="box-none">
          <OnboardingDots count={slides.length} index={currentIndex} />
          <OnboardingNextButton
            onPress={goNext}
            accessibilityLabel={currentIndex === slides.length - 1 ? "Get started" : "Next"}
            label={currentIndex === slides.length - 1 ? "GET STARTED" : "NEXT"}
            icon={<ArrowRight size={18} color={dark.bg} strokeWidth={2} />}
          />
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
  },
  content: {
    flex: 1,
  },
  topNavRow: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slideArea: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  slide: {
    alignItems: "center",
    paddingHorizontal: 36,
  },
  slideTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -0.6,
    textAlign: "center",
    marginBottom: 16,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },
  slideBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.92)",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 320,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  bottomBar: {
    paddingHorizontal: 24,
    gap: 22,
    zIndex: 20,
    elevation: 20,
  },
});
