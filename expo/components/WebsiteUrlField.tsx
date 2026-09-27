import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";
import { websiteState } from "@/lib/websiteUrl";

/**
 * The "Your website or profile link" card from Build Your App, shared so every
 * place that takes the realtor's website looks and validates the same way.
 */
export default function WebsiteUrlField({ eyebrow, title, note, value, onChangeText, failure, children }: {
  eyebrow: string;
  title?: string;
  note?: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Shown in place of "Looks good" when this exact site couldn't be read. */
  failure?: string | null;
  children?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const state = websiteState(value);
  return (
    <View style={{ marginTop: 30, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#C2A276",
      backgroundColor: "rgba(194,162,118,0.08)" }}>
      <Text style={{ color: "#C2A276", fontSize: 12, fontWeight: "700", letterSpacing: 1.6 }}>{eyebrow}</Text>
      {title ? <Text style={{ color: "white", fontSize: 20, fontWeight: "600", marginTop: 4 }}>{title}</Text> : null}
      {note ? <Text style={{ color: "#C8D0D0", lineHeight: 21, marginTop: 6 }}>{note}</Text> : null}
      <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1.5,
        borderColor: state === "valid" ? "#3FB37F" : state === "invalid" && !focused ? "#FF9C85" : "#7B858C",
        backgroundColor: "#0C1014", paddingHorizontal: 14 }}>
        <TextInput value={value} onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="yourwebsite.com" placeholderTextColor="#6F7A80" accessibilityLabel="Website or profile URL"
          autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="done"
          style={{ flex: 1, color: "white", fontSize: 18, paddingVertical: 16 }} />
        {state === "valid" ? <View accessibilityLabel="Website looks good" style={{ width: 28, height: 28, borderRadius: 14,
          backgroundColor: "#3FB37F", alignItems: "center", justifyContent: "center" }}>
          <Check size={17} color="white" strokeWidth={3} />
        </View> : null}
      </View>
      {state === "invalid" && !focused
        ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9", marginTop: 8 }}>That doesn’t look like a web address. Try something like yourname.com</Text>
        : failure
          ? <Text style={{ color: "#FFBAA9", marginTop: 8 }}>{failure}</Text>
          : state === "valid" ? <Text style={{ color: "#8FD9B4", marginTop: 8 }}>Looks good</Text> : null}
      {children}
    </View>
  );
}
