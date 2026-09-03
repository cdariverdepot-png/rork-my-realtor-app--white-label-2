import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, Stack } from "expo-router";
import { brand, dark, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";

/** Branded 404 — keeps the user inside the private experience. */
export default function NotFound() {
  const router = useRouter();
  const { brand: b } = useBrand();
  const realtor = b.realtor;
  const firstName = realtor.name.split(" ")[0] ?? realtor.name;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <Text style={styles.monogram}>{realtor.monogram}</Text>
        <Text style={styles.title}>This door doesn't open.</Text>
        <Text style={styles.sub}>
          The page you're looking for isn't here. Let's get you back home.
        </Text>
        <Pressable
          onPress={() => router.replace("/")}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.btnText}>Back to {firstName}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: dark.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  monogram: {
    fontFamily: fonts.serifBold,
    color: brand.gold,
    fontSize: 40,
    letterSpacing: 2,
    marginBottom: 24,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 28,
    letterSpacing: -0.4,
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  btn: { paddingVertical: 16, paddingHorizontal: 28, backgroundColor: dark.gold, borderRadius: 8 },
  btnText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 12,
    letterSpacing: 2.5,
  },
});
