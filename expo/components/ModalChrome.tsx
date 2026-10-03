import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useWorkflowBack } from '@/hooks/useWorkflowBack';
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, dark, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";

export default function ModalChrome({
  eyebrow,
  onDark = true,
}: {
  eyebrow: string;
  onDark?: boolean;
}) {
  const back = useWorkflowBack();
  const insets = useSafeAreaInsets();
  const { brand: b } = useBrand();
  const fg = onDark ? dark.text : brand.ink;
  const sub = onDark ? dark.goldLight : brand.goldDeep;
  const brandWord = `${(b.realtor.brandName || "MY REALTOR").toUpperCase()} PRIVATE`;
  return (
    <View style={[styles.row, { paddingTop: insets.top + 14 }]}>
      <View>
        <Text style={[styles.eyebrow, { color: sub }]}>{brandWord}</Text>
        <Text style={[styles.title, { color: fg }]}>{eyebrow}</Text>
      </View>
      <Pressable
        onPress={back}
        accessibilityRole="button"
        accessibilityLabel="Close page"
        hitSlop={14}
        style={[
          styles.close,
          { borderColor: onDark ? dark.borderStrong : brand.hairline },
        ]}
      >
        <X size={18} color={fg} strokeWidth={1.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 4,
  },
  title: { fontFamily: fonts.serif, fontSize: 22, letterSpacing: -0.3 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
