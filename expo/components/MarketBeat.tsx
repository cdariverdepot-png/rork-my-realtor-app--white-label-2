import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { brand, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";
import SectionLabel from "./SectionLabel";

export default function MarketBeat() {
  const { brand: b, theme } = useBrand();
  const marketBeat = b.beat;
  const bullets = marketBeat.bullets.filter((b) => b.label.trim() || b.copy.trim());
  if (!bullets.length) return null;
  return (
    <View style={[styles.section, { backgroundColor: theme.band.base }]}>
      <View style={styles.inner}>
        <SectionLabel
          eyebrow="What I'm seeing"
          title={marketBeat.headline}
          onDark
        />
        <View style={styles.list}>
          {bullets.map((b, i) => (
            <View key={`beat-${i}`} style={styles.row}>
              <Text style={[styles.num, { color: theme.accent.light, fontFamily: theme.displayItalic }]}>{String(i + 1).padStart(2, "0")}</Text>
              <View style={styles.rowBody}>
                <Text style={[styles.label, { fontFamily: theme.display }]}>{b.label}</Text>
                <Text style={styles.copy}>{b.copy}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: brand.forest, paddingVertical: 52, marginTop: 52 },
  inner: {},
  list: { paddingHorizontal: 24, marginTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairlineDark,
    gap: 18,
  },
  num: {
    fontFamily: fonts.serifItalic,
    color: brand.goldLight,
    fontSize: 14,
    width: 28,
    marginTop: 4,
  },
  rowBody: { flex: 1 },
  label: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 20,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  copy: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.75)",
    fontSize: 14,
    lineHeight: 19,
  },
});
