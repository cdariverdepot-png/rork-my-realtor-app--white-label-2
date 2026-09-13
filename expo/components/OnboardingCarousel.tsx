import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import {
  ArrowRight,
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

const { width: SCREEN_W } = Dimensions.get("window");

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
    body: "Every realtor gets their own fully branded experience. Custom colors, logos, monograms — it all adapts to you.",
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
    title: "Complete\nControl",
    body: "The content editor and admin dashboard put every detail in your hands — from hero images to client rosters.",
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
    body: "Request a viewing, message your realtor, and sign paperwork without leaving the app. No phone tag, no lost email threads.",
    bg: require("@/assets/images/onboard-bg-connected.jpg"),
  },
  {
    icon: <MessageSquareHeart size={36} color={brand.goldLight} strokeWidth={1.4} />,
    title: "Nothing\nSlips",
    body: "Documents, appointments, and updates all live in one place — with a notification the moment something needs you.",
    bg: require("@/assets/images/onboard-bg-control.jpg"),
  },
];

interface Props {
  audience: Audience;
  onFinish: () => void;
}

/**
 * Animating opacity directly on the image keeps each background a single
 * compositing layer. Wrapping it in an extra Animated.View forces iOS to
 * flatten the stack into an offscreen buffer, which visibly softens the photo.
 */
const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function OnboardingCarousel({ audience, onFinish }: Props) {
  const slides: Slide[] = audience === "client" ? CLIENT_SLIDES : SLIDES;
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const flatListRef = useRef<FlatList<Slide>>(null);
  const isSkipping = useRef<boolean>(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const bgFade = Animated.divide(scrollX, SCREEN_W);

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

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      if (idx !== currentIndex) setCurrentIndex(idx);
    },
    [currentIndex],
  );

  const finish = useCallback(() => {
    if (isSkipping.current) return;
    isSkipping.current = true;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.timing(entrance, {
      toValue: 0,
      duration: 520,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => onFinish());
  }, [entrance, onFinish]);

  const goNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      finish();
    }
  }, [currentIndex, slides.length, finish]);

  const opacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View
      style={[styles.root, { opacity: entrance }]}
    >
      {/* Fallback base color so the crossfade never shows a gap */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark.bg }]} />

      {/* Cross-fading photographic backgrounds, one per slide */}
      {slides.map((slide, i) => (
        <AnimatedImage
          key={i}
          pointerEvents="none"
          source={slide.bg}
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

      {/* Skip button — top right */}
      <Pressable
        onPress={finish}
        hitSlop={12}
        style={styles.skipBtn}
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      {/* Slides */}
      <Animated.View style={[styles.slideArea, { opacity, transform: [{ translateY }] }]}>
        <Animated.FlatList
          ref={flatListRef}
          data={slides}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          bounces={false}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <View style={styles.iconRing}>
                {item.icon}
              </View>
              <Text style={styles.slideTitle}>{item.title}</Text>
              <Text style={styles.slideBody}>{item.body}</Text>
            </View>
          )}
        />
      </Animated.View>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Next / Get Started */}
        <Pressable
          onPress={goNext}
          style={({ pressed }) => [
            styles.nextBtn,
            pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.nextText}>
            {currentIndex === slides.length - 1 ? "GET STARTED" : "NEXT"}
          </Text>
          <ArrowRight size={16} color={dark.bg} strokeWidth={2.2} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: dark.bg,
    zIndex: 9998,
  },
  skipBtn: {
    position: "absolute",
    top: 60,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.18)",
  },
  skipText: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.85)",
    fontSize: 13,
    letterSpacing: 1.4,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  slideArea: {
    flex: 1,
    justifyContent: "center",
  },
  slide: {
    width: SCREEN_W,
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
    paddingHorizontal: 28,
    paddingBottom: 44,
    gap: 24,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(244,239,230,0.18)",
  },
  dotActive: {
    backgroundColor: brand.goldLight,
    width: 24,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: brand.ivory,
    paddingVertical: 18,
    borderRadius: 14,
  },
  nextText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 12,
    letterSpacing: 3,
  },
});
