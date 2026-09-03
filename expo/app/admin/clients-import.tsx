import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  ArrowLeft,
  Check,
  FileSpreadsheet,
  Linkedin,
  Mail,
  Smartphone,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import {
  useClients,
  type ClientDraft,
  type ClientSource,
} from "@/contexts/ClientsContext";
import {
  parseCsvContacts,
  parseVCard,
  sniffContactFile,
} from "@/lib/parseContacts";

type StagedSource = Exclude<ClientSource, "manual">;

type Staged = {
  source: StagedSource;
  drafts: ClientDraft[];
  /** Indices the user has un-checked. */
  excluded: Set<number>;
};

export default function ClientsImport() {
  const router = useRouter();
  const { isAdmin, hydrated } = useAuth();
  const { importMany } = useClients();

  const [busy, setBusy] = useState<StagedSource | null>(null);
  const [staged, setStaged] = useState<Staged | null>(null);

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const tap = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const fail = (msg: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(msg);
    } else {
      Alert.alert("Import", msg);
    }
  };

  /* ---------------- phone contacts ---------------- */
  const importFromPhone = async () => {
    if (Platform.OS === "web") {
      fail(
        "Phone contacts aren't available on web. Use Gmail / Outlook CSV instead.",
      );
      return;
    }
    tap();
    setBusy("phone");
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        fail("Permission denied. You can enable Contacts access in Settings.");
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
        ],
        pageSize: 2000,
      });
      const drafts: ClientDraft[] = data
        .map((c) => {
          const name = (c.name ?? "").trim();
          const email = c.emails?.[0]?.email?.trim() ?? "";
          const phone = c.phoneNumbers?.[0]?.number?.trim() ?? "";
          const tagBits = [c.jobTitle, c.company].filter(Boolean) as string[];
          return {
            name: name || email || phone,
            email,
            phone: phone || undefined,
            tag: tagBits.length > 0 ? tagBits.join(" · ") : undefined,
          };
        })
        .filter((d) => d.name && (d.email || d.phone));

      if (drafts.length === 0) {
        fail("No contacts with name + email or phone were found.");
        return;
      }
      setStaged({ source: "phone", drafts, excluded: new Set() });
    } catch (e) {
      console.log("[clients-import] phone", e);
      fail("Couldn't read phone contacts. Try a CSV export instead.");
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- file imports ---------------- */
  const importFromFile = async (source: StagedSource) => {
    tap();
    setBusy(source);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/vcard", "text/x-vcard", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const file = res.assets?.[0];
      if (!file?.uri) return;

      let text = "";
      if (Platform.OS === "web") {
        const r = await fetch(file.uri);
        text = await r.text();
      } else {
        text = await FileSystem.readAsStringAsync(file.uri, {
          encoding: "utf8",
        });
      }

      const sniffed = sniffContactFile(text);
      const drafts =
        sniffed === "vcard" ? parseVCard(text) : parseCsvContacts(text);

      if (drafts.length === 0) {
        fail(
          "No contacts found. Make sure the file has columns like Name, Email, Phone.",
        );
        return;
      }
      setStaged({ source, drafts, excluded: new Set() });
    } catch (e) {
      console.log("[clients-import] file", e);
      fail("Couldn't read that file. Try exporting again as CSV or vCard.");
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- confirm ---------------- */
  const confirm = () => {
    if (!staged) return;
    const list = staged.drafts.filter((_, i) => !staged.excluded.has(i));
    if (list.length === 0) {
      fail("Select at least one contact to import.");
      return;
    }
    const { added, merged, skipped } = importMany(list, staged.source);
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const lines = [
      added > 0 ? `${added} added` : null,
      merged > 0 ? `${merged} merged` : null,
      skipped > 0 ? `${skipped} skipped` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(`Imported. ${lines}`);
      router.replace("/admin/clients");
    } else {
      Alert.alert("Imported", lines || "All set.", [
        { text: "Done", onPress: () => router.replace("/admin/clients") },
      ]);
    }
  };

  const includedCount = useMemo(() => {
    if (!staged) return 0;
    return staged.drafts.length - staged.excluded.size;
  }, [staged]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={18} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <Text style={styles.topTitle}>IMPORT CONTACTS</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {!staged ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>BUILD YOUR ROSTER</Text>
              <Text style={styles.heroTitle}>Bring in everyone, in one pass.</Text>
              <Text style={styles.heroSub}>
                Pull from your phone, email or LinkedIn. We deduplicate by email and
                phone — repeat imports stay clean.
              </Text>
            </View>

            <Text style={styles.sectionLabel}>CHOOSE A SOURCE</Text>

            <SourceCard
              busy={busy === "phone"}
              onPress={importFromPhone}
              Icon={Smartphone}
              title="Phone contacts"
              sub={
                Platform.OS === "web"
                  ? "Open this in the iOS or Android app"
                  : "Pulls every saved contact with a name + email or phone"
              }
              disabled={Platform.OS === "web"}
            />

            <SourceCard
              busy={busy === "google"}
              onPress={() => importFromFile("google")}
              Icon={Mail}
              title="Gmail / Google Contacts"
              sub="contacts.google.com → Export → Google CSV"
            />

            <SourceCard
              busy={busy === "outlook"}
              onPress={() => importFromFile("outlook")}
              Icon={Mail}
              title="Outlook / Apple Contacts"
              sub="Outlook CSV or Apple Contacts vCard (.vcf)"
            />

            <SourceCard
              busy={busy === "linkedin"}
              onPress={() => importFromFile("linkedin")}
              Icon={Linkedin}
              title="LinkedIn connections"
              sub="Settings → Data Privacy → Get a copy → Connections.csv"
            />

            <SourceCard
              busy={busy === "csv"}
              onPress={() => importFromFile("csv")}
              Icon={FileSpreadsheet}
              title="Any CSV or vCard"
              sub="We auto-detect headers like Name, Email, Phone, Company"
            />

            <Pressable
              onPress={() => router.replace("/admin/clients")}
              style={styles.manualRow}
              hitSlop={6}
            >
              <UserPlus size={14} color={brand.muted} strokeWidth={1.6} />
              <Text style={styles.manualText}>OR ADD ONE MANUALLY</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>
                {labelForSource(staged.source)} · {staged.drafts.length} FOUND
              </Text>
              <Text style={styles.heroTitle}>Review and confirm.</Text>
              <Text style={styles.heroSub}>
                Tap to exclude anyone you don't want on the roster. Existing
                contacts will be merged automatically.
              </Text>
            </View>

            <View style={styles.previewList}>
              {staged.drafts.map((d, i) => {
                const on = !staged.excluded.has(i);
                return (
                  <Pressable
                    key={`${d.email}-${d.phone}-${i}`}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                      setStaged((s) => {
                        if (!s) return s;
                        const next = new Set(s.excluded);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return { ...s, excluded: next };
                      });
                    }}
                    style={({ pressed }) => [
                      styles.previewRow,
                      !on && styles.previewRowOff,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on ? (
                        <Check size={12} color={brand.ivory} strokeWidth={2.4} />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewName} numberOfLines={1}>
                        {d.name}
                      </Text>
                      <Text style={styles.previewMeta} numberOfLines={1}>
                        {[d.email, d.phone].filter(Boolean).join("  ·  ") ||
                          "—"}
                      </Text>
                      {d.tag ? (
                        <Text style={styles.previewTag} numberOfLines={1}>
                          {d.tag}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {staged ? (
        <View style={styles.footer}>
          <Pressable
            onPress={() => setStaged(null)}
            style={styles.cancelBtn}
            hitSlop={6}
          >
            <X size={12} color={brand.muted} strokeWidth={1.6} />
            <Text style={styles.cancelText}>BACK</Text>
          </Pressable>
          <Pressable
            onPress={confirm}
            style={({ pressed }) => [
              styles.confirmBtn,
              pressed && { opacity: 0.92 },
            ]}
          >
            <Users size={14} color={brand.forestDeep} strokeWidth={2} />
            <Text style={styles.confirmText}>
              IMPORT {includedCount}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function SourceCard({
  Icon,
  title,
  sub,
  onPress,
  busy,
  disabled,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  sub: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.sourceCard,
        disabled && { opacity: 0.45 },
        pressed && !disabled && !busy && { opacity: 0.92 },
      ]}
    >
      <View style={styles.sourceIcon}>
        {busy ? (
          <ActivityIndicator color={brand.ivory} size="small" />
        ) : (
          <Icon size={16} color={brand.ivory} strokeWidth={1.5} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sourceTitle}>{title}</Text>
        <Text style={styles.sourceSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function labelForSource(s: ClientSource): string {
  switch (s) {
    case "phone":
      return "PHONE";
    case "google":
      return "GMAIL";
    case "outlook":
      return "OUTLOOK";
    case "linkedin":
      return "LINKEDIN";
    case "vcard":
      return "VCARD";
    case "apple":
      return "APPLE";
    case "csv":
      return "CSV";
    default:
      return "MANUAL";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: brand.nightDeep,
    borderBottomWidth: 1,
    borderBottomColor: brand.nightLine,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,26,21,0.3)",
  },
  topTitle: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 11,
    letterSpacing: 3,
  },
  hero: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 18 },
  heroEyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  heroSub: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 12,
  },
  sourceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.night,
  },
  sourceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: brand.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  sourceSub: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 18,
  },
  manualText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  previewList: { paddingHorizontal: 16, gap: 6 },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.night,
  },
  previewRowOff: { opacity: 0.45, backgroundColor: brand.nightHi },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.2,
    borderColor: brand.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: brand.forest, borderColor: brand.forest },
  previewName: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 15 },
  previewMeta: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 11,
    marginTop: 2,
  },
  previewTag: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: brand.nightDeep,
    borderTopWidth: 1,
    borderTopColor: brand.hairline,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  cancelText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: brand.textOnDarkMuted,
    letterSpacing: 1.6,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: brand.gold,
  },
  confirmText: {
    fontFamily: fonts.sansSemi,
    color: brand.forestDeep,
    fontSize: 12,
    letterSpacing: 1.6,
  },
});
