import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Lock } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import PressableScale from "@/components/PressableScale";

/**
 * Sign-in option matching SocialSignIn button chrome.
 * Tapping expands an in-place access-code field — the guest/demo code
 * is never shown on screen; it still works when typed.
 */
export default function AccessCodeContinue({
  code,
  onChangeCode,
  onSubmit,
  busy = false,
  error = null,
  initiallyOpen = false,
}: {
  code: string;
  onChangeCode: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: string | null;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);

  if (!open) {
    return (
      <View style={styles.wrap}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Continue with access code"
          disabled={busy}
          haptic="selection"
          scaleTo={0.97}
          hitSlop={10}
          style={[styles.btn, busy && { opacity: 0.55 }]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            setOpen(true);
          }}
        >
          <Text style={styles.btnText}>Continue with access code</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>Enter the code your realtor shared with you.</Text>
      <View style={styles.inputWrap}>
        <Lock size={14} color="#e0bc72" strokeWidth={1.6} />
        <TextInput
          value={code}
          onChangeText={(v) => onChangeCode(v.toUpperCase())}
          placeholder="ACCESS CODE"
          placeholderTextColor="rgba(244,239,230,0.28)"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          autoFocus={Platform.OS !== "web"}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          style={styles.input}
          maxLength={12}
          accessibilityLabel="Access code"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PressableScale
        accessibilityRole="button"
        onPress={onSubmit}
        disabled={busy || !code.trim()}
        haptic="medium"
        scaleTo={0.97}
        hitSlop={12}
        style={[styles.submit, (busy || !code.trim()) && { opacity: 0.45 }]}
      >
        <Text style={styles.submitText}>{busy ? "WORKING…" : "CONTINUE"}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 0, width: "100%" },
  btn: {
    borderWidth: 1,
    borderColor: "#b99960",
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#f3ead9", textAlign: "center", fontSize: 15, letterSpacing: 0.3 },
  hint: {
    color: "rgba(244,239,230,0.55)",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#b99960",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    minHeight: 52,
    backgroundColor: "rgba(8,26,21,0.45)",
  },
  input: {
    flex: 1,
    color: "#f3ead9",
    fontSize: 17,
    letterSpacing: 4,
    textAlign: "center",
    paddingVertical: 0,
    fontWeight: "600",
  },
  error: {
    color: "#E8B7A6",
    fontSize: 11.5,
    letterSpacing: 0.6,
    textAlign: "center",
  },
  submit: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4efe6",
    paddingVertical: 16,
    borderRadius: 10,
    minHeight: 52,
  },
  submitText: {
    color: "#0c1f1a",
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: "600",
  },
});
