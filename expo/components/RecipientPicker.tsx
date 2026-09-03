import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Check, Plus, UserPlus } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useClients, type Client } from "@/contexts/ClientsContext";

type Props = {
  /** Selected client ids. Empty array = none selected. */
  recipientIds: string[];
  onChange: (next: string[]) => void;
  /** Tap target when there are no clients yet (push to /admin/clients). */
  onAddClient: () => void;
  /** Optional numbered prefix label, e.g. 4 -> "4 · RECIPIENTS". */
  step?: number;
  /** Override label if you don't want a step number. */
  label?: string;
};

/**
 * Multi-select roster picker. Used by admin compose flows
 * (documents, push notifications, showings) so every realtor-initiated
 * action targets a specific subset of clients instead of "everyone".
 */
export default function RecipientPicker({
  recipientIds,
  onChange,
  onAddClient,
  step,
  label,
}: Props) {
  const { clients } = useClients();

  const toggle = (id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    onChange(
      recipientIds.includes(id)
        ? recipientIds.filter((x) => x !== id)
        : [...recipientIds, id],
    );
  };

  const selectAll = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    onChange(
      recipientIds.length === clients.length ? [] : clients.map((c: Client) => c.id),
    );
  };

  const heading = label ?? `${step ?? ""} · RECIPIENTS`.trim().replace(/^· /, "");

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{heading}</Text>
        {clients.length > 0 ? (
          <Pressable onPress={selectAll} hitSlop={8}>
            <Text style={styles.selectAll}>
              {recipientIds.length === clients.length ? "CLEAR ALL" : "SELECT ALL"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {clients.length === 0 ? (
        <Pressable
          onPress={onAddClient}
          style={({ pressed }) => [styles.empty, pressed && { opacity: 0.92 }]}
        >
          <UserPlus size={16} color={brand.goldLight} strokeWidth={1.6} />
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>No clients on your roster yet</Text>
            <Text style={styles.emptySub}>Add one to send anything · tap to manage</Text>
          </View>
          <Plus size={14} color={brand.goldLight} strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={{ gap: 6 }}>
          {clients.map((c: Client) => {
            const on = recipientIds.includes(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.id)}
                style={({ pressed }) => [
                  styles.row,
                  on && styles.rowOn,
                  pressed && !on && { backgroundColor: brand.ivoryWarm },
                ]}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Check size={12} color={brand.ivory} strokeWidth={2.4} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {c.tag ? `${c.tag} · ` : ""}
                    {c.email}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={onAddClient} style={styles.addRow} hitSlop={6}>
            <Plus size={12} color={brand.muted} strokeWidth={1.8} />
            <Text style={styles.addText}>MANAGE CLIENT ROSTER</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { fontFamily: fonts.sansMedium, color: brand.goldDeep, fontSize: 10, letterSpacing: 3 },
  selectAll: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: brand.hairline,
    backgroundColor: "#fff",
  },
  rowOn: { borderColor: brand.gold, backgroundColor: brand.ivoryWarm },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.2,
    borderColor: brand.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: brand.forest, borderColor: brand.forest },
  name: { fontFamily: fonts.serif, color: brand.ink, fontSize: 14 },
  meta: { fontFamily: fonts.sans, color: brand.muted, fontSize: 11, marginTop: 2 },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: brand.forestDeep,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
  },
  emptyTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  emptySub: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.7)", fontSize: 11, marginTop: 2 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
    marginTop: 2,
  },
  addText: {
    fontFamily: fonts.sansMedium,
    color: brand.muted,
    fontSize: 9,
    letterSpacing: 1.5,
  },
});
