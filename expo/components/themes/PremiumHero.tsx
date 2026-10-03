import React, { useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpRight, MessageCircle, Phone } from "lucide-react-native";
import Pressable from "../TactilePressable";
import FullPortrait from "../FullPortrait";
import { usePortraitDimensions } from "@/hooks/usePortraitDimensions";
import { useReducedMotion } from "@/hooks/useThemeMotion";
import { LIVE_THEME_MATERIALS } from "@/constants/liveThemeDesigns";
import type { ReferenceHomeProps } from "./ReferenceHome";
import { SERIF } from "./shared";

/** Seven compositions, one canonical content source. Motion never writes layout or profile state. */
export default function PremiumHero(p: ReferenceHomeProps & { width: number }) {
  const b = p.brand,
    r = b.realtor,
    id = b.layoutId ?? "private-collection",
    m = LIVE_THEME_MATERIALS[id];
  const [expanded, setExpanded] = useState(false),
    photo = usePortraitDimensions(b.portraitUrl, p.portraitSource);
  const motion = useReducedMotion(),
    light = id === "coastal-personal",
    w = p.width,
    pad = w < 360 ? 20 : 28,
    cw = Math.min(w - pad * 2, 1080);
  const title = r.heroMessage.trim() || r.tagline.trim() || r.name,
    wide = w >= 680,
    landscape = photo.ratio >= 1.2,
    split = wide && !landscape;
  const sy = p.scrollY,
    moving = motion.ready && !motion.reduced && !!sy;
  const scenicY = moving
    ? sy!.interpolate({
        inputRange: [0, 1000],
        outputRange: [0, -130],
        extrapolate: "clamp",
      })
    : 0;
  const ruleY = moving
    ? sy!.interpolate({
        inputRange: [0, 900],
        outputRange: [0, 55],
        extrapolate: "clamp",
      })
    : 0;
  const eyebrow = (copy = r.heroEyebrow || m.mood) => (
    <Text
      style={{
        color: m.accent,
        fontSize: 10,
        letterSpacing: 2.4,
        lineHeight: 18,
        fontFamily: "Inter_500Medium",
      }}
    >
      {copy}
    </Text>
  );
  const headline = (
    size: number,
    align: "left" | "center" | "right" = "left",
    sans = false,
  ) => (
    <Text
      style={{
        color: m.ink,
        fontFamily: sans ? "SpaceGrotesk_500Medium" : m.font,
        fontSize:
          title.length > 125
            ? Math.min(size, 34)
            : title.length > 60 && !wide
              ? Math.min(size, 38)
              : size,
        lineHeight:
          title.length > 125
            ? 40
            : title.length > 60 && !wide
              ? Math.min(size, 38) * 1.1
              : size * 1.02,
        letterSpacing: sans ? -1.8 : -0.8,
        textAlign: align,
      }}
    >
      {title}
    </Text>
  );
  const identity = (center = false) => (
    <View style={{ gap: 5, alignItems: center ? "center" : "flex-start" }}>
      <Text style={{ color: m.ink, fontFamily: SERIF, fontSize: 19 }}>
        {r.name}
      </Text>
      <Text
        style={{
          color: light ? "#44676B" : "#D0DDD7",
          fontSize: 11,
          lineHeight: 18,
          textAlign: center ? "center" : "left",
        }}
      >
        {[r.title, r.city].filter(Boolean).join(" · ")}
      </Text>
    </View>
  );
  const introduction = (center = false) => (
    <View style={{ gap: 10 }}>
      {!!r.welcomeNote && (
        <Text
          numberOfLines={expanded ? undefined : 4}
          style={{
            color: light ? "#3E6269" : "#D7E0DC",
            fontSize: 14,
            lineHeight: 23,
            textAlign: center ? "center" : "left",
          }}
        >
          {r.welcomeNote}
        </Text>
      )}
      {r.welcomeNote.length > 180 && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={{
            paddingVertical: 8,
            alignSelf: center ? "center" : "flex-start",
          }}
        >
          <Text
            style={{
              color: m.accent,
              fontSize: 12,
              textDecorationLine: "underline",
            }}
          >
            {expanded ? "Read less" : "Read my introduction"}
          </Text>
        </Pressable>
      )}
    </View>
  );
  const actions = (mode: "pill" | "rule" | "square" = "pill") => (
    <View style={{ gap: 12, marginTop: 22 }}>
      <Pressable
        accessibilityRole="button"
        disabled={!p.onNavigate}
        onPress={() => p.onNavigate?.("/listings")}
        style={{
          minHeight: 54,
          paddingHorizontal: mode === "rule" ? 0 : 20,
          borderRadius: mode === "pill" ? 28 : mode === "square" ? 3 : 0,
          backgroundColor: mode === "rule" ? "transparent" : m.accent,
          borderBottomWidth: mode === "rule" ? 1 : 0,
          borderColor: m.accent,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_600SemiBold",
            color: mode === "rule" ? m.ink : m.bg,
          }}
        >
          {r.primaryCta || "Explore the collection"}
        </Text>
        <ArrowUpRight size={22} color={mode === "rule" ? m.accent : m.bg} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={!p.onNavigate}
        onPress={() => p.onNavigate?.("/message")}
        style={{
          minHeight: 44,
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MessageCircle size={16} color={m.accent} />
        <Text style={{ color: m.ink, fontSize: 13 }}>
          {r.secondaryCta ||
            "Message " + (r.name.split(" ")[0] || "your realtor")}
        </Text>
      </Pressable>
    </View>
  );
  const portrait = (
    width: number,
    shape: "arch" | "square" | "round" = "square",
    align: "flex-start" | "center" | "flex-end" = "center",
  ) =>
    photo.hasPhoto ? (
      <View
        style={{
          width,
          alignSelf: align,
          borderRadius:
            shape === "arch" ? width / 2 : shape === "round" ? 24 : 1,
          borderBottomLeftRadius: shape === "arch" ? 6 : undefined,
          borderBottomRightRadius: shape === "arch" ? 6 : undefined,
          padding: shape === "square" ? 0 : 12,
          paddingTop: shape === "arch" ? 24 : shape === "round" ? 12 : 0,
          overflow: "visible",
          backgroundColor: light ? "#FFFFFF70" : "#FFFFFF08",
          borderWidth: 1,
          borderColor: m.accent + "60",
        }}
      >
        <FullPortrait
          brand={b}
          source={p.portraitSource}
          width={width - (shape === "square" ? 2 : 26)}
          maxHeight={Math.min(width * 2.25, 900)}
          scrollY={sy}
        />
      </View>
    ) : null;
  let composition: React.ReactNode;
  switch (id) {
    case "eliza-editorial":
      composition = (
        <View style={{ paddingTop: 32, gap: 28 }}>
          {eyebrow()}
          <View style={{ maxWidth: wide ? cw * 0.77 : cw }}>
            {headline(wide ? 78 : 53)}
          </View>
          <View
            style={{
              flexDirection: split ? "row" : "column",
              gap: 30,
              alignItems: split ? "flex-end" : undefined,
            }}
          >
            <View
              style={{
                width: split ? cw * 0.42 : landscape ? cw : cw * 0.73,
                borderLeftWidth: 1,
                borderColor: m.accent + "88",
                paddingLeft: 18,
                gap: 20,
              }}
            >
              {introduction()}
              {identity()}
              {actions("rule")}
            </View>
            <View
              style={{
                width: split ? cw * 0.52 : cw,
                marginTop: split ? 0 : 2,
                paddingLeft: 28,
                borderTopWidth: 1,
                borderColor: m.accent + "50",
                paddingTop: 18,
              }}
            >
              {portrait(
                split ? cw * 0.48 : landscape ? cw - 29 : cw * 0.76,
                "square",
                "flex-end",
              )}
              <Text
                style={{
                  color: m.accent,
                  fontSize: 9,
                  letterSpacing: 2,
                  marginTop: 12,
                  textAlign: "right",
                }}
              >
                A PERSONAL INTRODUCTION
              </Text>
            </View>
          </View>
        </View>
      );
      break;
    case "coastal-personal":
      composition = (
        <View style={{ gap: 26, paddingTop: 26 }}>
          <View style={{ alignItems: "center", gap: 17 }}>
            {eyebrow()}
            {headline(wide ? 67 : 48, "center")}
          </View>
          <View
            style={{
              flexDirection: split ? "row" : "column",
              gap: 30,
              alignItems: "center",
            }}
          >
            {portrait(
              split ? cw * 0.46 : landscape ? cw : cw * 0.88,
              photo.ratio >= 1.2 ? "square" : "arch",
            )}
            <View
              style={{
                width: split ? cw * 0.45 : cw,
                backgroundColor: "#FFFFFFD9",
                borderRadius: 26,
                padding: 24,
                gap: 18,
                boxShadow: "0px 12px 42px rgba(33,66,64,0.10)",
              }}
            >
              {identity()}
              {introduction()}
              {actions("pill")}
            </View>
          </View>
          <View
            style={{ height: 1, backgroundColor: "#53797844", marginTop: 8 }}
          />
        </View>
      );
      break;
    case "advisor-journal": {
      const columns =
        photo.hasPhoto &&
        photo.ratio < 1.2 &&
        (wide || (w >= 365 && title.length < 55));
      composition = (
        <View
          style={{
            paddingTop: 28,
            gap: 25,
            borderTopWidth: 2,
            borderColor: m.accent,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            {eyebrow(m.mood)}
            <Text style={{ color: m.accent, fontFamily: SERIF, fontSize: 14 }}>
              —
            </Text>
          </View>
          <View style={{ flexDirection: columns ? "row" : "column", gap: 22 }}>
            <View style={{ width: columns ? cw * 0.53 : cw, gap: 24 }}>
              {headline(wide ? 64 : columns ? 36 : 52)}
              {introduction()}
              {identity()}
            </View>
            <View
              style={{
                width: columns ? cw * 0.4 : cw,
                marginTop: columns ? 42 : 4,
                paddingLeft: 12,
                borderLeftWidth: 1,
                borderColor: m.accent + "66",
              }}
            >
              {portrait(
                columns ? cw * 0.4 - 13 : cw * 0.73,
                "square",
                "flex-end",
              )}
            </View>
          </View>
          {actions("rule")}
        </View>
      );
      break;
    }
    case "warm-concierge":
      composition = (
        <View style={{ paddingTop: 24 }}>
          <View
            style={{
              flexDirection: split ? "row" : "column",
              gap: split ? 38 : 0,
              alignItems: split ? "center" : undefined,
            }}
          >
            <View
              style={{
                width: split ? cw * 0.49 : cw,
                paddingRight: wide ? 0 : 24,
              }}
            >
              {portrait(split ? cw * 0.49 : cw - 24, "round", "flex-start")}
            </View>
            <View
              style={{
                width: split ? cw * 0.46 : cw,
                padding: 24,
                marginTop: split ? 0 : 22,
                borderRadius: 28,
                backgroundColor: "#193B43D9",
                borderWidth: 1,
                borderColor: "#B4D3C84D",
                boxShadow: "0px 18px 50px rgba(0,0,0,0.2)",
                gap: 20,
              }}
            >
              {eyebrow()}
              {headline(wide ? 55 : 43)}
              {introduction()}
              {identity()}
              {actions("pill")}
            </View>
          </View>
        </View>
      );
      break;
    case "private-collection":
      composition = (
        <View style={{ paddingTop: 30, gap: 28 }}>
          <View style={{ alignItems: "center", gap: 22 }}>
            {eyebrow()}
            {headline(wide ? 72 : 48, "center")}
            <View style={{ width: 36, height: 1, backgroundColor: m.accent }} />
          </View>
          <View
            style={{
              flexDirection: split ? "row-reverse" : "column",
              gap: 28,
              alignItems: split ? "center" : undefined,
            }}
          >
            <View
              style={{
                width: split ? cw * 0.49 : cw,
                paddingLeft: 24,
                paddingTop: 18,
                borderTopWidth: 1,
                borderLeftWidth: 1,
                borderColor: m.accent + "66",
              }}
            >
              {portrait(
                split ? cw * 0.46 : landscape ? cw - 25 : cw * 0.82,
                "square",
                "flex-end",
              )}
            </View>
            <View
              style={{
                width: split ? cw * 0.43 : cw,
                paddingVertical: 22,
                gap: 22,
                borderBottomWidth: 1,
                borderColor: m.accent + "55",
              }}
            >
              {identity()}
              {introduction()}
              {actions("rule")}
            </View>
          </View>
        </View>
      );
      break;
    case "modern-editorial":
      composition = (
        <View style={{ paddingTop: 24, gap: 24 }}>
          {eyebrow()}
          <View
            style={{
              paddingBottom: 22,
              borderBottomWidth: 1,
              borderColor: m.accent + "66",
            }}
          >
            {headline(wide ? 74 : 50, "left", true)}
          </View>
          <View
            style={{
              flexDirection: photo.ratio >= 1.2 ? "column" : "row",
              gap: 18,
              alignItems: "flex-end",
            }}
          >
            <View style={{ width: photo.ratio >= 1.2 ? cw : cw * 0.62 }}>
              {portrait(
                photo.ratio >= 1.2 ? cw : cw * 0.62,
                "square",
                "flex-start",
              )}
            </View>
            <View style={{ flex: 1, gap: 16, paddingBottom: 12 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: m.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ArrowUpRight size={17} color={m.accent} />
              </View>
              {identity()}
              <Text
                style={{
                  color: m.accent,
                  fontSize: 10,
                  letterSpacing: 1.3,
                  lineHeight: 17,
                }}
              >
                REAL ESTATE,{"\n"}PERSONALLY.
              </Text>
            </View>
          </View>
          {introduction()}
          {actions("square")}
        </View>
      );
      break;
    case "portrait-statement":
      composition = (
        <View style={{ paddingTop: 36, gap: 28, alignItems: "center" }}>
          {eyebrow()}
          {headline(wide ? 76 : 52, "center")}
          <View
            style={{
              width: 40,
              height: 1,
              backgroundColor: m.accent,
              marginVertical: 6,
            }}
          />
          <View
            style={{
              width: landscape ? cw : split ? cw * 0.43 : cw * 0.75,
              padding: 12,
              borderWidth: 1,
              borderColor: m.accent + "44",
            }}
          >
            {portrait((landscape ? cw : split ? cw * 0.43 : cw * 0.75) - 26)}
          </View>
          <View
            style={{ maxWidth: 460, width: "100%", gap: 20, paddingTop: 4 }}
          >
            {identity(true)}
            {introduction(true)}
            {actions("rule")}
          </View>
        </View>
      );
      break;
  }
  return (
    <View style={{ backgroundColor: m.bg, overflow: "hidden" }}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            height: Math.max(1300, w * 2),
            transform: [{ translateY: scenicY }],
          },
        ]}
      >
        <Image
          source={m.photo}
          contentFit="cover"
          transition={0}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      </Animated.View>
      <LinearGradient
        colors={
          light
            ? ["#EAF0ECC9", "#EAF0EC99", "#EBF0EC"]
            : id === "private-collection"
              ? ["#1A102480", "#3213299C", "#1A1024"]
              : ["#071B2450", m.bg + "99", m.bg]
        }
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: -70,
          top: 165,
          width: 300,
          height: 490,
          borderWidth: 1,
          borderColor: m.accent + "30",
          borderRadius: id === "coastal-personal" ? 180 : 0,
          transform: [
            { translateY: ruleY },
            {
              rotate:
                id === "modern-editorial"
                  ? "-12deg"
                  : id === "private-collection"
                    ? "14deg"
                    : "0deg",
            },
          ],
        }}
      />
      <View
        style={{
          width: cw,
          alignSelf: "center",
          paddingTop: p.topInset ?? 24,
          paddingBottom: 48,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            paddingBottom: 22,
            borderBottomWidth: 1,
            borderColor: m.accent + "44",
          }}
        >
          {!!r.monogram && (
            <Text style={{ fontFamily: SERIF, fontSize: 35, color: m.accent }}>
              {r.monogram}
            </Text>
          )}
          <View style={{ flex: 1, gap: 6 }}>
            <Text
              style={{
                fontSize: 11,
                letterSpacing: 2,
                color: m.ink,
                lineHeight: 18,
                fontFamily: "Inter_500Medium",
              }}
            >
              {r.brandName || r.name}
            </Text>
            {!!r.brandSub && (
              <Text style={{ color: m.accent, fontSize: 8, letterSpacing: 2 }}>
                {r.brandSub}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Message your realtor"
            disabled={!p.onNavigate}
            onPress={() => p.onNavigate?.("/message")}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: m.accent + "66",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: light ? "#FFFFFF70" : "#FFFFFF08",
            }}
          >
            <MessageCircle size={20} color={m.accent} />
          </Pressable>
        </View>
        {composition}
        {!!r.phone && !!p.onCall && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call your realtor"
            onPress={p.onCall}
            style={{
              marginTop: 20,
              paddingVertical: 12,
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              justifyContent:
                id === "portrait-statement" ? "center" : "flex-start",
            }}
          >
            <Phone size={15} color={m.accent} />
            <Text style={{ color: m.accent, fontSize: 12 }}>
              Your direct line
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
