import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { brand, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";

interface Props {
  eyebrow: string;
  title: string;
  onDark?: boolean;
}

export default function SectionLabel({ eyebrow, title, onDark = false }: Props) {
  const { theme } = useBrand();
  const textColor = onDark ? theme.onBand.text : brand.ink;
  const eyebrowColor = onDark ? theme.accent.light : theme.accent.deep;
  const ruleColor = onDark ? theme.band.hairline : theme.surface.hairline;
  return (
    <View style={styles.wrap}>
      <View style={styles.eyebrowRow}>
        <View style={[styles.rule, { backgroundColor: ruleColor }]} />
        <Text style={[styles.eyebrow, { color: eyebrowColor }]}>{eyebrow}</Text>
      </View>
      <Text style={[styles.title, { color: textColor, fontFamily: theme.display }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, marginBottom: 18 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  rule: { width: 28, height: 1, marginRight: 10 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
});
