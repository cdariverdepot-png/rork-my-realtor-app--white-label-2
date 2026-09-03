import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Bell, Send } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useNotifications, type NotifKind } from "@/contexts/NotificationsContext";
import { useListings } from "@/contexts/ListingsContext";
import { useClients } from "@/contexts/ClientsContext";
import ModalChrome from "@/components/ModalChrome";
import RecipientPicker from "@/components/RecipientPicker";

const KINDS: { key: NotifKind; label: string }[] = [
  { key: "personal", label: "Personal note" },
  { key: "new", label: "New listing" },
  { key: "price", label: "Price change" },
  { key: "status", label: "Status update" },
];

const TEMPLATES: Record<NotifKind, { title: string; body: string }> = {
  personal: {
    title: "A personal note",
    body: "Quick read — call me when you have a minute.",
  },
  new: {
    title: "Quiet listing for you",
    body: "Just got eyes on something I think you'll love. Want to walk it this week?",
  },
  price: {
    title: "Price moved",
    body: "Seller adjusted today. At this number it's a different conversation.",
  },
  status: {
    title: "Status update",
    body: "Update on a home you're watching.",
  },
  appointment: { title: "", body: "" },
};

export default function AdminNotifications() {
  const router = useRouter();
  const { isAdmin, hydrated } = useAuth();
  const { broadcastFromRealtor, items } = useNotifications();
  const { all } = useListings();
  const { clients } = useClients();

  const [kind, setKind] = useState<NotifKind>("personal");
  const [title, setTitle] = useState<string>(TEMPLATES.personal.title);
  const [body, setBody] = useState<string>(TEMPLATES.personal.body);
  const [listingId, setListingId] = useState<string>("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const switchKind = (k: NotifKind) => {
    setKind(k);
    setTitle(TEMPLATES[k].title);
    setBody(TEMPLATES[k].body);
  };

  const send = () => {
    if (!title.trim() || !body.trim()) return;
    if (clients.length > 0 && recipientIds.length === 0) {
      Alert.alert(
        "Choose recipients",
        "Pick at least one client — or tap Select All to send to your full roster.",
      );
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    broadcastFromRealtor({
      kind,
      title: title.trim(),
      body: body.trim(),
      listingId: listingId || undefined,
      recipientIds: recipientIds.length > 0 ? [...recipientIds] : undefined,
    });
    setSentAt(Date.now());
    setTimeout(() => setSentAt(null), 1800);
  };

  return (
    <View style={styles.root}>
      <ModalChrome eyebrow="Push to clients" />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <Text style={styles.intro}>
          Keep it personal. Pick exactly who hears from you — no broadcasting blindly.
        </Text>

        <Text style={styles.label}>KIND</Text>
        <View style={styles.kindRow}>
          {KINDS.map((k) => {
            const on = kind === k.key;
            return (
              <Pressable
                key={k.key}
                onPress={() => switchKind(k.key)}
                style={[styles.kindChip, on && styles.kindChipOn]}
              >
                <Text style={[styles.kindText, on && { color: brand.ivory }]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: 18 }]}>TITLE</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={brand.muted} />

        <Text style={[styles.label, { marginTop: 14 }]}>MESSAGE</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
          placeholderTextColor={brand.muted}
        />

        <Text style={[styles.label, { marginTop: 14 }]}>ATTACH A LISTING (OPTIONAL)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <Pressable
            onPress={() => setListingId("")}
            style={[styles.lChip, !listingId && styles.lChipOn]}
          >
            <Text style={[styles.lChipText, !listingId && { color: brand.ivory }]}>None</Text>
          </Pressable>
          {all.map((l) => {
            const on = listingId === l.id;
            return (
              <Pressable key={l.id} onPress={() => setListingId(l.id)} style={[styles.lChip, on && styles.lChipOn]}>
                <Text style={[styles.lChipText, on && { color: brand.ivory }]} numberOfLines={1}>
                  {l.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ marginHorizontal: 24, marginTop: 18 }}>
          <RecipientPicker
            recipientIds={recipientIds}
            onChange={setRecipientIds}
            onAddClient={() => router.push("/admin/clients")}
            label="RECIPIENTS"
          />
        </View>

        <View style={styles.preview}>
          <View style={styles.previewIcon}>
            <Bell size={14} color={dark.bg} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.previewKicker}>VANCE PRIVATE · Now</Text>
            <Text style={styles.previewTitle}>{title || "Title"}</Text>
            <Text style={styles.previewBody} numberOfLines={3}>
              {body || "Message preview"}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={send}
          disabled={!title.trim() || !body.trim() || recipientIds.length === 0}
          style={({ pressed }) => [
            styles.send,
            (!title.trim() || !body.trim() || recipientIds.length === 0) && { opacity: 0.4 },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Send size={16} color={dark.bg} strokeWidth={2} />
          <Text style={styles.sendText}>
            {sentAt
              ? "Sent ✓"
              : recipientIds.length > 0
                ? `Push to ${recipientIds.length} ${recipientIds.length === 1 ? "client" : "clients"}`
                : clients.length === 0
                  ? "Add a client first"
                  : "Choose recipients"}
          </Text>
        </Pressable>

        <Text style={[styles.label, { marginHorizontal: 24, marginTop: 24, marginBottom: 12 }]}>
          RECENTLY SENT
        </Text>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {items.slice(0, 6).map((n) => (
            <View key={n.id} style={styles.histRow}>
              <Text style={styles.histKind}>{n.kind.toUpperCase()}</Text>
              <Text style={styles.histTitle}>{n.title}</Text>
              <Text style={styles.histBody} numberOfLines={2}>
                {n.body}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  intro: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginHorizontal: 24,
    marginBottom: 22,
  },
  label: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginBottom: 10,
  },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 24 },
  kindChip: { paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: brand.nightLine },
  kindChipOn: { backgroundColor: dark.gold, borderColor: dark.gold },
  kindText: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 13 },
  input: {
    marginHorizontal: 24,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.night,
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 15,
  },
  lChip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: brand.nightLine,
    maxWidth: 200,
  },
  lChipOn: { backgroundColor: dark.gold, borderColor: dark.gold },
  lChipText: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 12 },
  preview: {
    flexDirection: "row",
    gap: 12,
    margin: 24,
    padding: 14,
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  previewIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: brand.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  previewKicker: { fontFamily: fonts.sansMedium, color: brand.textOnDarkMuted, fontSize: 9, letterSpacing: 1.5 },
  previewTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14, marginTop: 3 },
  previewBody: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  send: {
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    backgroundColor: brand.gold,
  },
  sendText: { fontFamily: fonts.sansSemi, color: dark.bg, fontSize: 12, letterSpacing: 1.8 },
  histRow: { padding: 12, borderWidth: 1, borderColor: brand.nightLine, backgroundColor: brand.night },
  histKind: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 9, letterSpacing: 2 },
  histTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14, marginTop: 4 },
  histBody: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 12, marginTop: 4 },
});
