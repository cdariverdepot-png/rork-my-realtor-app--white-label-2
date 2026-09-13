import React from "react";
import { Pressable, Text, View } from "react-native";
import type { Brand } from "@/contexts/BrandContext";
import { CLIENT_SECTIONS, sectionState } from "@/constants/sections";
import { useListings } from "@/contexts/ListingsContext";

/** Removal keeps the section's underlying data. Restoring derives readiness. */
export default function ContentSections({ draft, onChange }: {
  draft: Brand; onChange: (mutator: (current: Brand) => Brand) => void;
}) {
  const { all } = useListings();
  const context = { brand: draft, visibleListingCount: all.filter(l => !l.hidden).length };
  const optional = CLIENT_SECTIONS.filter(s => !s.structural);
  const hidden = optional.filter(s => sectionState(draft, s.id, s.isReady(context)) === "hidden");
  return <View style={{ padding: 20, gap: 12 }}>
    <Text style={{ color: "#F4EFE6", fontSize: 20 }}>App sections</Text>
    {optional.filter(s => !hidden.includes(s)).map(s => <View key={s.id} style={{ padding: 16, backgroundColor: "#242626", borderRadius: 8, gap: 8 }}>
      <Text style={{ color: "#F4EFE6", textTransform: "capitalize" }}>{s.id} · {s.isReady(context) ? "Content present" : "Empty — visible only while editing"}</Text>
      <Pressable accessibilityRole="button" onPress={() => onChange(b => ({ ...b, sectionStates: { ...b.sectionStates, [s.id]: "hidden" } }))} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={{ color: "#EBC776" }}>Remove from App</Text>
      </Pressable>
    </View>)}
    {hidden.length > 0 && <Pressable accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center" }} onPress={() => onChange(b => {
      const sectionStates = { ...b.sectionStates };
      for (const s of hidden) delete sectionStates[s.id];
      return { ...b, sectionStates };
    })}><Text style={{ color: "#EBC776" }}>Restore Hidden Sections ({hidden.length})</Text></Pressable>}
  </View>;
}
