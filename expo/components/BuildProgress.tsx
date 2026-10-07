import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Check, Sparkles } from "lucide-react-native";

const STEPS = [
  "Connecting to your website",
  "Reading your public profile",
  "Finding active listings",
  "Choosing the best listing images",
  "Matching your website structure",
  "Building your agent profile",
  "Preparing the client experience",
  "Running a final quality check",
];

export default function BuildProgress({ activity }: { activity?: string }) {
  const [visible, setVisible] = useState(1);

  useEffect(() => {
    setVisible(1);
    const timer = setInterval(() => {
      setVisible(current => {
        if (current >= STEPS.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 950);
    return () => clearInterval(timer);
  }, []);

  return (
    <View
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
          <Text style={{ color: "#9EAAA7", fontSize: 12, marginTop: 2, letterSpacing: 0.5 }}>LIVE BUILD SEQUENCE</Text>
        </View>
      </View>

      {STEPS.slice(0, visible).map((step, index) => {
        const current = index === visible - 1;
        const completed = index < visible - 1;
        return (
          <View
            key={step}
            style={{
              minHeight: 34,
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
              opacity: current ? 1 : 0.76,
            }}
          >
            <View style={{ width: 22, alignItems: "center" }}>
              {completed ? (
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(116,211,164,0.14)", alignItems: "center", justifyContent: "center" }}>
                  <Check size={13} color="#74D3A4" strokeWidth={2.6} />
                </View>
              ) : (
                <ActivityIndicator size="small" color="#E3D6BB" />
              )}
            </View>
            <Text style={{ color: current ? "#F7F4EB" : "#BCC5C1", fontSize: 14.5, lineHeight: 20 }}>{step}</Text>
          </View>
        );
      })}

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 10, marginBottom: 6 }} />
      <Text style={{ color: "#9EAAA7", fontSize: 12.5, lineHeight: 19 }}>
        {activity || "Reading your website and preparing the first version."}
      </Text>
    </View>
  );
}
