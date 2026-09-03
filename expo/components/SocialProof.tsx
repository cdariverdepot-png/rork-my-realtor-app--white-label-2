import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { brand, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";
import SectionLabel from "./SectionLabel";

const { width: W } = Dimensions.get("window");
const Q_W = W - 48;

export default function SocialProof() {
  const { brand: b, theme } = useBrand();
  const testimonials = b.testimonials;
  const recentlyClosed = b.recentlyClosed;
  const realtor = b.realtor;
  const [idx, setIdx] = useState<number>(0);
  const ref = useRef<FlatList>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / Q_W);
    if (next !== idx) setIdx(next);
  };

  const hasTestimonials = testimonials.length > 0;
  const hasClosed = recentlyClosed.length > 0;
  // Nothing to show yet (a brand-new realtor) — hide the whole section.
  if (!hasTestimonials && !hasClosed) return null;

  return (
    <View style={[styles.section, { backgroundColor: theme.band.deep }]}>
      <View style={[styles.dark, { backgroundColor: theme.band.deep }]}>
        <SectionLabel
          eyebrow={b.social.eyebrow.trim() || "In their words"}
          title={b.social.title.trim() || "What clients say."}
          onDark
        />
        {hasTestimonials ? (
        <FlatList
          ref={ref}
          horizontal
          pagingEnabled
          data={testimonials}
          keyExtractor={(_, i) => `t-${i}`}
          showsHorizontalScrollIndicator={false}
          snapToInterval={Q_W + 16}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={[styles.quoteCard, { width: Q_W, borderColor: theme.band.hairline }]}>
              <Text style={[styles.bigQuote, { color: theme.accent.base, fontFamily: theme.displayBold }]}>“</Text>
              <Text style={[styles.quote, { fontFamily: theme.display }]}>{item.quote}</Text>
              <View style={[styles.qFooter, { borderTopColor: theme.band.hairline }]}>
                <View style={[styles.qRule, { backgroundColor: theme.accent.base }]} />
                <View>
                  <Text style={styles.author}>{item.author}</Text>
                  <Text style={styles.detail}>{item.detail}</Text>
                </View>
              </View>
            </View>
          )}
        />
        ) : null}
        {hasTestimonials ? (
        <View style={styles.dots}>
          {testimonials.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === idx && { backgroundColor: theme.accent.base, width: 18 },
              ]}
            />
          ))}
        </View>
        ) : null}

        {hasClosed ? (
        <View
          style={[
            styles.closedBlock,
            { borderTopColor: theme.band.hairline },
            !hasTestimonials && { marginTop: 8 },
          ]}
        >
          <View style={styles.closedHead}>
            <Text style={[styles.closedKicker, { color: theme.accent.light }]}>
              {b.social.closedKicker.trim() || "RECENTLY CLOSED"}
            </Text>
            {/* "+ closed" with no figure in front of it says nothing. */}
            {realtor.closedVolume.trim() ? (
              <Text style={[styles.closedVol, { fontFamily: theme.displayItalic }]}>
                {realtor.closedVolume}+ closed
              </Text>
            ) : null}
          </View>
          {recentlyClosed.map((c, i) => (
            <View key={i} style={[styles.closedRow, { borderBottomColor: theme.band.hairline }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.closedAddr, { fontFamily: theme.display }]}>{c.address}</Text>
                <Text style={styles.closedDays}>Closed in {c.days}</Text>
              </View>
              <Text
                style={[
                  styles.closedPrice,
                  { color: theme.accent.light, fontFamily: theme.display },
                ]}
              >
                {c.price}
              </Text>
            </View>
          ))}
        </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 56 },
  dark: {
    backgroundColor: brand.forestDeep,
    paddingTop: 56,
    paddingBottom: 56,
  },
  quoteCard: {
    backgroundColor: "transparent",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: brand.hairlineDark,
    paddingVertical: 28,
    paddingHorizontal: 4,
  },
  bigQuote: {
    fontFamily: fonts.serifBold,
    color: brand.gold,
    fontSize: 64,
    lineHeight: 64,
    marginLeft: -2,
    marginBottom: -8,
  },
  quote: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 19,
    lineHeight: 28,
    letterSpacing: -0.2,
    marginTop: 12,
  },
  qFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 28,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: brand.hairlineDark,
  },
  qRule: { width: 24, height: 1, backgroundColor: brand.gold },
  author: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  detail: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.4,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(244,239,230,0.2)",
  },
  closedBlock: {
    marginTop: 44,
    marginHorizontal: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: brand.hairlineDark,
  },
  closedHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  closedKicker: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  closedVol: {
    fontFamily: fonts.serifItalic,
    color: brand.ivory,
    fontSize: 13,
  },
  closedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairlineDark,
  },
  closedAddr: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  closedDays: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 11,
    marginTop: 4,
  },
  closedPrice: {
    fontFamily: fonts.serif,
    color: brand.goldLight,
    fontSize: 16,
  },
});
