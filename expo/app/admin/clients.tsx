import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { ChevronRight, Download, IdCard, Mail, Phone, Plus, Trash2, Unlink, Users as UsersIcon, X } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useClients, type Client } from "@/contexts/ClientsContext";
import { useSeats } from "@/contexts/SeatsContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import { profileHeadline } from "@/constants/clientProfile";
import ModalChrome from "@/components/ModalChrome";
import EmptyState from "@/components/EmptyState";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";

const ACCENT = SCREEN_ACCENT.adminClients;
const SURFACE = "rgba(14,16,15,0.72)";
const LINE = "rgba(244,239,230,0.12)";

export default function AdminClients() {
  const router = useRouter();
  const { isAdmin, hydrated } = useAuth();
  const { clients, upsert, remove } = useClients();
  const {
    tracked: seatsTracked,
    isConnected,
    disconnect,
    used: seatsUsed,
    limit: seatLimit,
    unlimited: seatsUnlimited,
  } = useSeats();
  const { getProfile, getProfileByEmail } = useClientProfiles();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [tag, setTag] = useState<string>("");

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const sorted = useMemo(
    () => [...clients].sort((a, b) => b.createdAt - a.createdAt),
    [clients]
  );

  const reset = () => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPhone("");
    setTag("");
  };

  const startEdit = (c: Client) => {
    setEditingId(c.id);
    setName(c.name);
    setEmail(c.email);
    setPhone(c.phone ?? "");
    setTag(c.tag ?? "");
  };

  const save = () => {
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      Alert.alert("Add a name and email", "Both are required to send anything.");
      return;
    }
    if (!/.+@.+\..+/.test(em)) {
      Alert.alert("Email looks off", "Enter a valid client email.");
      return;
    }
    const id = editingId ?? `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existing = clients.find((c) => c.id === id);
    upsert({
      id,
      name: n,
      email: em.toLowerCase(),
      phone: phone.trim() || undefined,
      tag: tag.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reset();
  };

  /**
   * Disconnecting revokes a client's access and frees their place straight
   * away. Their contact card stays on the roster — losing someone's phone
   * number because you needed the place back would be its own bug.
   */
  const confirmDisconnect = (c: Client) => {
    const title = "Disconnect client";
    const body = `${c.name} will lose access to your app. They stay on your roster, and their place frees up straight away.`;
    const run = () => {
      void (async () => {
        const ok = await disconnect(c.id);
        if (!ok) {
          Alert.alert("Couldn't disconnect", "Check your connection and try again.");
          return;
        }
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      })();
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}. ${body}`)) run();
      return;
    }
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: run },
    ]);
  };

  const confirmDel = (c: Client) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Remove ${c.name}?`)) {
        remove(c.id);
        if (editingId === c.id) reset();
      }
      return;
    }
    Alert.alert("Remove client", `${c.name} will be removed from your list.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          remove(c.id);
          if (editingId === c.id) reset();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScreenBackdrop screen="adminClients" />
      <ModalChrome eyebrow="Your clients" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Add the people you work with. They become recipients for documents, push updates and
          showing invitations.
        </Text>

        <Pressable
          onPress={() => router.push("/admin/clients-import")}
          style={({ pressed }) => [styles.importCta, pressed && { opacity: 0.92 }]}
        >
          <View style={styles.importIcon}>
            <Download size={18} color={ACCENT} strokeWidth={1.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.importEyebrow}>ONE-TAP IMPORT</Text>
            <Text style={styles.importTitle}>Bring in your whole roster</Text>
            <Text style={styles.importSub}>
              Phone contacts, Gmail, Outlook, LinkedIn or any CSV. We dedupe automatically.
            </Text>
          </View>
          <ChevronRight size={16} color={ACCENT} strokeWidth={1.6} />
        </Pressable>

        <View style={styles.composer}>
          <View style={styles.composerHead}>
            <Text style={styles.label}>{editingId ? "EDIT CLIENT" : "ADD A CLIENT"}</Text>
            {editingId ? (
              <Pressable onPress={reset} hitSlop={10} style={styles.cancelBtn}>
                <X size={12} color={brand.muted} strokeWidth={1.6} />
                <Text style={styles.cancelText}>CANCEL</Text>
              </Pressable>
            ) : null}
          </View>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={brand.muted}
            style={styles.input}
            autoCapitalize="words"
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="email@domain.com"
            placeholderTextColor={brand.muted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone (optional)"
            placeholderTextColor={brand.muted}
            style={styles.input}
            keyboardType="phone-pad"
          />
          <TextInput
            value={tag}
            onChangeText={setTag}
            placeholder="Short tag, e.g. Buyer · UWS"
            placeholderTextColor={brand.muted}
            style={styles.input}
          />

          <Pressable
            onPress={save}
            style={({ pressed }) => [styles.submit, pressed && { opacity: 0.9 }]}
          >
            <Plus size={14} color={dark.bg} strokeWidth={2} />
            <Text style={styles.submitText}>{editingId ? "Save changes" : "Add client"}</Text>
          </Pressable>
        </View>

        <View style={styles.rosterHead}>
          <Text style={styles.label}>ROSTER · {clients.length}</Text>
          {seatsTracked ? (
            <Text style={styles.rosterSeats}>
              {seatsUnlimited
                ? `${seatsUsed} IN YOUR APP`
                : `${seatsUsed} OF ${seatLimit} IN YOUR APP`}
            </Text>
          ) : null}
        </View>
        {seatsTracked ? (
          <Text style={styles.rosterNote}>
            Contacts are unlimited. Only people who have actually joined your app
            take one of your client places.
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: 16, gap: 8, marginTop: 12 }}>
          {sorted.length === 0 && (
            <EmptyState
              Icon={UsersIcon}
              eyebrow="ROSTER IS EMPTY"
              title="Bring everyone you work with."
              body="One-tap import from phone, Gmail, Outlook, LinkedIn or any CSV — we dedupe automatically. Or add someone manually above."
              accent={ACCENT}
              ctaLabel="IMPORT CONTACTS"
              onCtaPress={() => router.push("/admin/clients-import")}
            />
          )}

          {sorted.map((c) => {
            // Ids can differ between the client's device and the roster row,
            // so fall back to email — the identity the seat ledger uses too.
            const profile = getProfile(c.id) ?? getProfileByEmail(c.email);
            const headline = profile ? profileHeadline(profile.answers) : "";
            return (
            <Pressable
              key={c.id}
              onPress={() => startEdit(c)}
              style={({ pressed }) => [
                styles.row,
                editingId === c.id && { borderColor: tint(ACCENT, 0.6) },
                pressed && { backgroundColor: "rgba(255,255,255,0.05)" },
              ]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {c.name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                {headline ? (
                  <Text style={styles.tag} numberOfLines={1}>
                    {headline.toUpperCase()}
                  </Text>
                ) : c.tag ? (
                  <Text style={styles.tag}>{c.tag.toUpperCase()}</Text>
                ) : null}
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {isConnected(c.id) ? (
                    <View style={styles.connectedPill}>
                      <View style={styles.connectedDot} />
                      <Text style={styles.connectedText}>IN YOUR APP</Text>
                    </View>
                  ) : null}
                  {profile?.completedAt && !profile.seenByRealtor ? (
                    <View style={styles.newProfilePill}>
                      <Text style={styles.newProfileText}>NEW PROFILE</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.metaRow}>
                  <Pressable
                    hitSlop={6}
                    onPress={(e) => {
                      e.stopPropagation();
                      Linking.openURL(`mailto:${c.email}`);
                    }}
                    style={styles.metaPill}
                  >
                    <Mail size={11} color={brand.muted} strokeWidth={1.5} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {c.email}
                    </Text>
                  </Pressable>
                  {c.phone ? (
                    <Pressable
                      hitSlop={6}
                      onPress={(e) => {
                        e.stopPropagation();
                        Linking.openURL(`tel:${c.phone?.replace(/[^+\d]/g, "")}`);
                      }}
                      style={styles.metaPill}
                    >
                      <Phone size={11} color={brand.muted} strokeWidth={1.5} />
                      <Text style={styles.metaText}>{c.phone}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={styles.rowActions}>
                {profile ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/admin/client-profile",
                        params: { clientId: profile.clientId },
                      })
                    }
                    hitSlop={8}
                    accessibilityLabel={`Open ${c.name}'s profile`}
                    style={styles.profileBtn}
                  >
                    <IdCard size={13} color={ACCENT} strokeWidth={1.6} />
                  </Pressable>
                ) : null}
                {isConnected(c.id) ? (
                  <Pressable
                    onPress={() => confirmDisconnect(c)}
                    hitSlop={8}
                    style={styles.unlinkBtn}
                  >
                    <Unlink size={13} color={ACCENT} strokeWidth={1.6} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => confirmDel(c)}
                  hitSlop={8}
                  style={styles.delBtn}
                >
                  <Trash2 size={14} color="#E06E5A" strokeWidth={1.5} />
                </Pressable>
              </View>
            </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  intro: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginHorizontal: 24,
    marginBottom: 18,
  },
  importCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: tint(ACCENT, 0.1),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
  },
  importIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tint(ACCENT, 0.16),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.4),
    alignItems: "center",
    justifyContent: "center",
  },
  importEyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  importTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  importSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.7)",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  composer: {
    marginHorizontal: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 16,
    backgroundColor: SURFACE,
    gap: 10,
  },
  composerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelText: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    color: brand.textOnDarkMuted,
    letterSpacing: 1.5,
  },
  label: { fontFamily: fonts.sansMedium, color: dark.textDim, fontSize: 10, letterSpacing: 3 },
  rosterHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginTop: 24,
  },
  rosterSeats: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9.5,
    letterSpacing: 1.8,
  },
  rosterNote: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11,
    lineHeight: 16,
    marginHorizontal: 24,
    marginTop: 8,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  connectedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.45),
    backgroundColor: tint(ACCENT, 0.12),
  },
  connectedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT },
  connectedText: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  newProfilePill: {
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.5)",
    backgroundColor: "rgba(210,163,67,0.14)",
  },
  newProfileText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  profileBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
  },
  unlinkBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
  },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: LINE,
    backgroundColor: "rgba(255,255,255,0.04)",
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 15,
  },
  submit: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  submitText: { fontFamily: fonts.sansSemi, color: dark.bg, fontSize: 12, letterSpacing: 1.6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
    backgroundColor: tint(ACCENT, 0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 13, letterSpacing: 1 },
  tag: { fontFamily: fonts.sansMedium, color: ACCENT, fontSize: 9, letterSpacing: 2 },
  name: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16, marginTop: 3 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
  },
  metaText: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 10, maxWidth: 160 },
  delBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(224,110,90,0.3)",
  },
  empty: {
    paddingVertical: 32,
    alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 16,
    gap: 6,
  },
  emptyTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 17, marginTop: 6 },
  emptySub: { fontFamily: fonts.serif, color: brand.textOnDarkMuted, fontSize: 13 },
});
