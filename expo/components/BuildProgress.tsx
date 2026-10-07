import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Check, Sparkles, X } from "lucide-react-native";
import type { ActivityLine } from "@/lib/importProgress";

/**
 * Live activity from the importer. Each line exists because the server reported that work
 * started, produced data, or finished (see lib/importProgress). There are no timers here:
 * the list changes only when a real event arrives, so it can move quickly or wait as long as
 * the work does, and whatever is still running stays visibly active.
 */
export default function BuildProgress({ lines }: { lines: ActivityLine[] }) {
  const running = lines.some(line => line.state === "active");
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        marginTop: 28,
        padding: 22,
        borderRadius: 20,
        backgroundColor: "rgba(18,28,34,0.86)",
        borderWidth: 1,
        borderColor: "rgba(226,206,171,0.24)",
        shadowColor: "#000",
        shadowOpacity: 0.24,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: "rgba(226,206,171,0.38)",
            backgroundColor: "rgba(226,206,171,0.09)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={16} color="#E3D6BB" strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#F7F4EB", fontSize: 18, fontWeight: "600" }}>Building your app</Text>
          <Text style={{ color: "#9EAAA7", fontSize: 12, marginTop: 2, letterSpacing: 0.5 }}>{running ? "LIVE IMPORT ACTIVITY" : "IMPORT ACTIVITY"}</Text>
        </View>
      </View>

      {lines.map(line => {
        const active = line.state === "active";
        return (
          <View key={line.id} style={{ minHeight: 34, flexDirection: "row", alignItems: "center", gap: 11, opacity: active ? 1 : 0.8 }}>
            <View style={{ width: 22, alignItems: "center" }}>
              {active ? (
                <ActivityIndicator size="small" color="#E3D6BB" />
              ) : line.state === "failed" ? (
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(255,186,169,0.14)", alignItems: "center", justifyContent: "center" }}>
                  <X size={12} color="#FFBAA9" strokeWidth={2.6} />
                </View>
              ) : (
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(116,211,164,0.14)", alignItems: "center", justifyContent: "center" }}>
                  <Check size={13} color="#74D3A4" strokeWidth={2.6} />
                </View>
              )}
            </View>
            <Text style={{ flex: 1, color: active ? "#F7F4EB" : line.state === "failed" ? "#FFBAA9" : "#BCC5C1", fontSize: 14.5, lineHeight: 20 }}>{line.text}</Text>
          </View>
        );
      })}
    </View>
  );
}
