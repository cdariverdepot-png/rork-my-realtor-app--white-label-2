import React from "react";
import { View, StyleSheet } from "react-native";
import ChatThread from "@/components/ChatThread";
import Reveal from "@/components/Reveal";
import { useBrand } from "@/contexts/BrandContext";

export default function ClientMessages() {
  const { brand: b } = useBrand();
  const firstName = b.realtor.name.split(" ")[0] ?? b.realtor.name;
  return (
    <Reveal duration={420} distance={14} style={styles.fill}>
      <View style={styles.fill}>
        <ChatThread role="client" eyebrow={`Direct line to ${firstName}`} />
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
