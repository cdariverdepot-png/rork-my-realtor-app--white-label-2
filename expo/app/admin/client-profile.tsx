import React, { useEffect, useMemo } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { CalendarClock, Mail, MessageCircle, Phone, UserSearch } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import ModalChrome from "@/components/ModalChrome";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientsContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import {
  PROFILE_STEPS,
  arr,
  completion,
  hasValue,
  labelFor,
  str,
  visibleFields,
  type ProfileAnswers,
} from "@/constants/clientProfile";

const ACCENT = SCREEN_ACCENT.adminClients;
const SURFACE = "rgba(14,16,15,0.72)";
const LINE = "rgba(244,239,230,0.12)";

/**
 * What the client told us, read back to the realtor.
 *
 * Strictly read-only. A client's own words about their budget and timeline are
 * evidence, and an agent quietly editing them would destroy the only thing that
 * makes this data worth collecting. The realtor's own working notes already
 * have a home in the client feed.
 */
export default function AdminClientProfile() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const { isAdmin, hydrated } = useAuth();
  const { clients } = useClients();
  const { getProfile, markSeen } = useClientProfiles();

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const profile = useMemo(
    () => (clientId ? getProfile(clientId) : null),
    [clientId, getProfile]
  );

  const contact = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId]
  );

  // Opening it is the acknowledgement — no separate "mark as read" chore.
  useEffect(() => {
    if (clientId && profile && !profile.seenByRealtor) markSeen(clientId);
  }, [clientId, profile, markSeen]);

  const answers: ProfileAnswers = profile?.answers ?? {};
  const stats = useMemo(() => completion(answers), [answers]);

  const displayName =
    str(answers, "preferredName") ||
    str(answers, "fullName") ||
    contact?.name ||
    "This client";
  const legalName = str(answers, "fullName");
  const phone = str(answers, "phone") || contact?.phone || "";
  const email = profile?.email || contact?.email || "";
  const photo = str(answers, "photo");

  const tap = (fn: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    fn();
  };

  if (!profile) {
    return (
      <View style={styles.root}>
        <ScreenBackdrop screen="adminClients" />
        <ModalChrome eyebrow="Client profile" />
        <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
          <EmptyState
            Icon={UserSearch}
            eyebrow="NOT FILLED IN YET"
            title="No profile from this client."
            body="They'll be invited to complete one when they next open your app. It covers how to reach them, what they're looking for and their timeline."
            accent={ACCENT}
            ctaLabel="NUDGE THEM"
            onCtaPress={() => {
              if (contact?.email) Linking.openURL(`mailto:${contact.email}`);
              else router.back();
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="adminClients" />
      <ModalChrome eyebrow="Client profile" />

      <ScrollView contentContainerStyle={{ paddingBottom: 90 }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            {photo ? (
              <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={styles.avatarText}>
                {displayName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName}</Text>
            {legalName && legalName !== displayName ? (
              <Text style={styles.legal}>On paperwork: {legalName}</Text>
            ) : null}
            <Text style={styles.shared}>
              {profile.completedAt
                ? `Shared ${new Date(profile.completedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}`
                : "In progress"}
              {" · "}
              {stats.done} of {stats.total} answered
            </Text>
          </View>
        </View>

        {/* Reach them the way they asked to be reached */}
        <View style={styles.actionRow}>
          {phone ? (
            <>
              <ActionChip
                Icon={MessageCircle}
                label="TEXT"
                onPress={tap(() => Linking.openURL(`sms:${phone.replace(/[^+\d]/g, "")}`))}
              />
              <ActionChip
                Icon={Phone}
                label="CALL"
                onPress={tap(() => Linking.openURL(`tel:${phone.replace(/[^+\d]/g, "")}`))}
              />
            </>
          ) : null}
          {email ? (
            <ActionChip
              Icon={Mail}
              label="EMAIL"
              onPress={tap(() => Linking.openURL(`mailto:${email}`))}
            />
          ) : null}
          {clientId ? (
            <ActionChip
              Icon={CalendarClock}
              label="CURATE"
              onPress={tap(() => router.push("/admin/feed"))}
            />
          ) : null}
        </View>

        {str(answers, "contactMethod") || str(answers, "contactTime") ? (
          <Text style={styles.preference}>
            Prefers{" "}
            <Text style={styles.preferenceStrong}>
              {readValue(answers, "contactMethod") || "any contact"}
            </Text>
            {str(answers, "contactTime")
              ? `, ${(readValue(answers, "contactTime") ?? "").toLowerCase()}`
              : ""}
            .
          </Text>
        ) : null}

        {/* Everything they answered, in the order they were asked */}
        {PROFILE_STEPS.filter((s) => (s.showIf ? s.showIf(answers) : true)).map((s) => {
          const rows = visibleFields(s, answers).filter(
            (f) => f.kind !== "photo" && hasValue(answers, f.id)
          );
          if (rows.length === 0) return null;
          return (
            <View key={s.id} style={styles.section}>
              <Text style={styles.sectionLabel}>{s.eyebrow === "LAST ONE" ? "IN THEIR WORDS" : s.title.toUpperCase()}</Text>
              <View style={styles.card}>
                {rows.map((f, i) => {
                  const isList = f.kind === "multi";
                  const isLong = f.kind === "longtext";
                  return (
                    <View key={f.id} style={[styles.row, i > 0 && styles.rowDivided]}>
                      <Text style={styles.rowLabel}>{f.label}</Text>
                      {isList ? (
                        <View style={styles.chips}>
                          {arr(answers, f.id).map((v) => (
                            <View key={v} style={styles.chip}>
                              <Text style={styles.chipText}>{labelFor(f, v)}</Text>
                            </View>
                          ))}
                        </View>
                      ) : isLong ? (
                        <Text style={styles.quote}>{str(answers, f.id)}</Text>
                      ) : (
                        <Text style={styles.rowValue}>{labelFor(f, str(answers, f.id))}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {stats.done < stats.total ? (
          <Text style={styles.footnote}>
            {displayName.split(" ")[0]} hasn&apos;t answered everything yet. The rest appears here
            automatically if they fill it in later.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function readValue(a: ProfileAnswers, id: string): string {
  for (const s of PROFILE_STEPS) {
    const f = s.fields.find((x) => x.id === id);
    if (f) return labelFor(f, str(a, id));
  }
  return str(a, id);
}

function ActionChip({
  Icon,
  label,
  onPress,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionChip, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={13} color={ACCENT} strokeWidth={1.7} />
      <Text style={styles.actionChipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.4),
    backgroundColor: tint(ACCENT, 0.14),
  },
  avatarText: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 16, letterSpacing: 1 },
  name: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 22, letterSpacing: -0.3 },
  legal: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 11.5,
    marginTop: 3,
  },
  shared: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9.5,
    letterSpacing: 1.4,
    marginTop: 7,
  },

  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
    backgroundColor: tint(ACCENT, 0.09),
  },
  actionChipText: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 9.5,
    letterSpacing: 1.6,
  },

  preference: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 12.5,
    lineHeight: 18,
    marginHorizontal: 20,
    marginTop: 14,
  },
  preferenceStrong: { fontFamily: fonts.sansSemi, color: brand.ivory },

  section: { marginTop: 24 },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 9.5,
    letterSpacing: 2.6,
    marginHorizontal: 24,
    marginBottom: 10,
  },
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: LINE,
    backgroundColor: SURFACE,
    paddingHorizontal: 16,
  },
  row: { paddingVertical: 14, gap: 7 },
  rowDivided: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkDim,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  rowValue: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16, letterSpacing: -0.1 },
  quote: {
    fontFamily: fonts.serifItalic,
    color: brand.ivory,
    fontSize: 14.5,
    lineHeight: 21,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.32),
    backgroundColor: tint(ACCENT, 0.1),
  },
  chipText: { fontFamily: fonts.sansMedium, color: brand.ivory, fontSize: 11.5 },

  footnote: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11.5,
    lineHeight: 17,
    marginHorizontal: 24,
    marginTop: 24,
  },
});
