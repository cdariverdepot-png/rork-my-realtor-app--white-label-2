import React from "react";
import { Pressable, Text, View } from "react-native";
import type { Brand } from "@/contexts/BrandContext";
import { imagePositionKey } from "@/lib/themeImages";

export default function ThemeImagePosition({ draft, onChange }: { draft: Brand; onChange: (mutator: (b: Brand) => Brand) => void }) {
  const key = imagePositionKey(draft.theme);
  const point = draft.theme.imagePositions?.[key] ?? { x: 50, y: 50 };
  return <View style={{ padding: 20, gap: 12 }}>
    <Text style={{ color: "white", fontSize: 18 }}>Image position for this look</Text>
    <Text style={{ color: "#ccc", lineHeight: 22 }}>Position your portrait in the preview above. Other looks and your original image stay unchanged.</Text>
    {(["x", "y"] as const).map(axis => <View key={axis} style={{ flexDirection: "row", gap: 8 }}>
      {(axis === "x" ? ["Left", "Center", "Right"] : ["Top", "Middle", "Bottom"]).map((label, i) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: point[axis] === i * 50 }} onPress={() => onChange(b => ({ ...b, theme: { ...b.theme, imagePositions: { ...b.theme.imagePositions, [key]: { ...point, [axis]: i * 50 } } } }))} style={{ flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 8, backgroundColor: point[axis] === i * 50 ? "#48634c" : "#303438" }}><Text style={{ color: "white" }}>{label}</Text></Pressable>)}
    </View>)}
  </View>;
}
