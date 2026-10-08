import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Check, Sparkles, X } from "lucide-react-native";
import type { ActivityLine } from "@/lib/importProgress";

/**
 * Live activity from the importer. Each line exists because the server reported that work
 * started, produced data, or finished (see lib/importProgress). There are no timers here:
 * the list changes only when a real event arrives, so it can move quickly or wait as long as
 * the work does, and whatever is still running stays visibly active.
 */
/**
 * failure: the build stopped. The panel gives the server's reason, what was already saved, and a way
 * forward; it never replaces the activity above it, so the realtor can see where it stopped.
 */
export default function BuildProgress({ lines, failure, onRetry, onChangeWebsite }: {
  lines: ActivityLine[];
  failure?: { message: string; kept: string[] } | null;
  onRetry?: () => void;
  onChangeWebsite?: () => void;
}) {
  const running = !failure && lines.some(line => line.state === "active");
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
          <Text style={{ color: "#9EAAA7", fontSize: 12, marginTop: 2, letterSpacing: 0.5 }}>{failure ? "BUILD STOPPED" : running ? "LIVE IMPORT ACTIVITY" : "IMPORT ACTIVITY"}</Text>
        </View>
      </View>

      {lines.map(line => {
        const active = !failure && line.state === "active";
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
      {failure ? (
        <View accessibilityRole="alert" style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", gap: 8 }}>
          <Text style={{ color: "#F7F4EB", fontSize: 15.5, fontWeight: "600" }}>The build stopped</Text>
          <Text style={{ color: "#FFBAA9", fontSize: 14, lineHeight: 20 }}>{failure.message}</Text>
          {failure.kept.map(note => <Text key={note} style={{ color: "#BCC5C1", fontSize: 13.5, lineHeight: 19 }}>{note}</Text>)}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry the build" onPress={onRetry}
              style={{ flex: 1, minHeight: 46, borderRadius: 11, backgroundColor: "#C2A276", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#172027", fontWeight: "700" }}>Retry</Text>
            </Pressable> : null}
            {onChangeWebsite ? <Pressable accessibilityRole="button" accessibilityLabel="Change website" onPress={onChangeWebsite}
              style={{ flex: 1, minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: "#657079", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#F7F4EB", fontWeight: "600" }}>Change website</Text>
            </Pressable> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
