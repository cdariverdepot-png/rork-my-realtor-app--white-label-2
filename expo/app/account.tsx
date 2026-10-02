import React, { useMemo, useState } from "react";
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
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowRight,
  Bell,
  Bookmark,
  CalendarCheck,
  Heart,
  LogOut,
  MessageCircle,
  Pencil,
  Pin,
  Search,
  ShieldCheck,
  Trash2,
  UserCircle,
  X,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useClientFeed } from "@/contexts/ClientFeedContext";
import { useListings } from "@/contexts/ListingsContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useMessages } from "@/contexts/MessagesContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useBrand } from "@/contexts/BrandContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { bustedUri } from "@/lib/imageUri";
import { bookConsultation } from "@/lib/contact";
import { deleteClientAccount } from "@/lib/accountDelete";

export default function ClientAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    hydrated,
    isClient,
    currentClientId,
    session,
    updateClientProfile,
    logout,
  } = useAuth();
  const { getFeed } = useClientFeed();
  const { getById } = useListings();
  const { totalFavorites: favCount } = useFavorites();
  const { messages } = useMessages();
  const { unreadCount: unreadAlerts } = useNotifications();
  const { brand: b } = useBrand();
  const { myProfileShared, myCompletion } = useClientProfiles();

  const [editingName, setEditingName] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>(session?.name ?? "");

  const feed = useMemo(() => {
    if (!currentClientId) return null;
    return getFeed(currentClientId);
  }, [currentClientId, getFeed]);

  const pinnedListings = useMemo(() => {
    if (!feed) return [];
    return feed.pinnedListingIds
      .map((id) => getById(id))
      .filter((l): l is NonNullable<ReturnType<typeof getById>> => Boolean(l) && !l!.hidden);
  }, [feed, getById]);

  const unreadFromRealtor = useMemo(
    () => messages.filter((m) => m.role === "realtor" && !m.read).length,
    [messages]
  );
  const tap = (cb: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb();
  };

  const handleSignOut = async () => {
    if (Platform.OS === "web") {
      await logout();
      router.replace("/");
      return;
    }
    Alert.alert("Sign out", "You'll need your email and password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace("/");
        },
      },
    ]);
  };

  /**
   * Account deletion. Required by App Store guideline 5.1.1(v), and the right
   * thing regardless — someone who wants out should not have to email anyone.
   *
   * Two-step confirm because it is irreversible. The copy is honest about the
   * one thing we cannot erase: the realtor's own address-book entry, which is
   * theirs, not ours.
   */
  const handleDelete = () => {
    const realtorFirst = b.realtor.name.split(" ")[0];
    const run = async () => {
      if (!session?.realtorId || !session.email) return;
      setDeleting(true);
      try {
        await deleteClientAccount({
          realtorId: session.realtorId,
          email: session.email,
          clientId: session.clientId,
        });
        await logout();
        router.replace("/");
      } catch (e) {
        console.log("[account] delete failed", e);
        setDeleting(false);
        Alert.alert("Couldn't delete", "Something went wrong. Please try again.");
      }
    };

    if (Platform.OS === "web") {
      void run();
      return;
    }

    Alert.alert(
      "Delete your account?",
      `This erases your account, your profile and your saved properties. It cannot be undone.\n\n${realtorFirst} may still have your name and number in their own contacts — ask them directly if you'd like that removed too.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert("Last check", "Permanently delete your account?", [
              { text: "Keep my account", style: "cancel" },
              {
                text: "Delete forever",
                style: "destructive",
                onPress: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  void run();
                },
              },
            ]);
          },
        },
      ]
    );
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setEditingName(false);
      setNameDraft(session?.name ?? "");
      return;
    }
    await updateClientProfile({ name: trimmed });
    setEditingName(false);
  };

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: dark.bg }} />;
  }

  const realtorName = b.realtor.name;
  const firstName = (session?.name ?? "").split(" ")[0] || "there";

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="account" />
      <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
          <X size={18} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.brandName}>YOUR ACCOUNT</Text>
          <Text style={styles.brandSub}>{(b.realtor.brandName || "MY REALTOR").toUpperCase()} PRIVATE · CLIENT</Text>
        </View>
        <Pressable hitSlop={12} onPress={handleSignOut} style={styles.iconBtn}>
          <LogOut size={16} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 116 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>SIGNED IN · {session?.email.toUpperCase()}</Text>
          <Text style={styles.heroTitle}>Hello, {firstName}.</Text>
          <Text style={styles.heroSub}>
            This is your private space with {realtorName}. Everything saved here travels with you.
          </Text>
        </View>

        <View style={styles.profileCard}>
          <Text style={styles.cardLabel}>NAME</Text>
          {editingName ? (
            <View style={styles.editRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                style={styles.editInput}
                placeholder="Your name"
                placeholderTextColor="rgba(244,239,230,0.4)"
              />
              <Pressable onPress={saveName} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>SAVE</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={tap(() => {
                setNameDraft(session?.name ?? "");
                setEditingName(true);
              })}
              style={styles.profileRow}
            >
              <Text style={styles.profileValue}>{session?.name ?? "—"}</Text>
              <Pencil size={14} color={brand.goldLight} strokeWidth={1.6} />
            </Pressable>
          )}
          <View style={styles.profileDivider} />
          <Text style={styles.cardLabel}>EMAIL</Text>
          <Text style={styles.profileValue}>{session?.email}</Text>
        </View>

        {/* The intake profile. Shown as an open invitation rather than a
            warning — a client who skipped it did not do anything wrong, and
            the pitch is what they get back, not what we still want. */}
        <Pressable
          onPress={tap(() => router.push({ pathname: "/client-profile", params: { edit: "1" } }))}
          style={({ pressed }) => [styles.profileTask, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityLabel={myProfileShared ? "View and edit your profile" : "Complete your profile"}
        >
          <View style={styles.profileTaskHead}>
            <UserCircle size={16} color={brand.goldLight} strokeWidth={1.6} />
            <Text style={styles.cardLabel}>
              {myProfileShared ? "YOUR PROFILE" : "FINISH YOUR PROFILE"}
            </Text>
          </View>
          <Text style={styles.profileTaskTitle}>
            {myProfileShared
              ? `${realtorName.split(" ")[0]} has your details.`
              : `Help ${realtorName.split(" ")[0]} find the right home.`}
          </Text>
          <Text style={styles.profileTaskBody}>
            {myProfileShared
              ? "Tap to review or update anything — changes reach them straight away."
              : "A few questions about what you're looking for, your timeline and how to reach you. Takes about a minute."}
          </Text>
          <View style={styles.profileTaskMeterTrack}>
            <View
              style={[
                styles.profileTaskMeterFill,
                { width: `${Math.round(myCompletion.pct * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.profileTaskFoot}>
            <Text style={styles.profileTaskMeta}>
              {myCompletion.done} of {myCompletion.total} answered
            </Text>
            <View style={styles.profileTaskCta}>
              <Text style={styles.profileTaskCtaText}>
                {myProfileShared ? "REVIEW" : "CONTINUE"}
              </Text>
              <ArrowRight size={12} color={brand.goldLight} strokeWidth={2} />
            </View>
          </View>
        </Pressable>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>CURATED FOR YOU</Text>
          <Text style={styles.sectionHint}>Selected by {realtorName.split(" ")[0]}</Text>
        </View>

        {pinnedListings.length > 0 ? (
          <View style={{ gap: 10, paddingHorizontal: 16 }}>
            {pinnedListings.map((l) => (
              <Pressable
                key={l.id}
                onPress={tap(() => router.push(`/listing/${l.id}`))}
                style={({ pressed }) => [styles.listingRow, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.thumbWrap}>
                  <Image
                    source={{ uri: bustedUri(l.images?.[0] ?? l.image, l.updatedAt) }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowEyebrow}>{l.neighborhood.toUpperCase()}</Text>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {l.price} · {l.beds} bd · {l.baths} ba
                  </Text>
                </View>
                <ArrowRight size={14} color={brand.goldLight} strokeWidth={1.6} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Pin size={16} color={brand.goldLight} strokeWidth={1.6} />
            <Text style={styles.emptyTitle}>Nothing pinned yet.</Text>
            <Text style={styles.emptySub}>
              {realtorName.split(" ")[0]} will pin homes here as she finds matches for you.
            </Text>
          </View>
        )}

        {(feed?.notes.length ?? 0) > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>PRIVATE NOTES</Text>
              <Text style={styles.sectionHint}>From {realtorName.split(" ")[0]}</Text>
            </View>
            <View style={{ gap: 10, paddingHorizontal: 16 }}>
              {feed!.notes.map((n) => (
                <View key={n.id} style={styles.noteCard}>
                  <Text style={styles.noteText}>{n.text}</Text>
                  <Text style={styles.noteDate}>
                    {new Date(n.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {(feed?.savedSearches.length ?? 0) > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>SAVED SEARCHES</Text>
              <Text style={styles.sectionHint}>You'll be alerted on matches</Text>
            </View>
            <View style={{ gap: 8, paddingHorizontal: 16 }}>
              {feed!.savedSearches.map((s) => (
                <View key={s.id} style={styles.searchRow}>
                  <Search size={14} color={brand.goldLight} strokeWidth={1.6} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchLabel}>{s.label}</Text>
                    <Text style={styles.searchMeta}>
                      {[
                        s.neighborhood,
                        s.tag,
                        s.maxPrice ? `≤ $${(s.maxPrice / 1_000_000).toFixed(1)}M` : null,
                        s.minBeds ? `${s.minBeds}+ bd` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Any match"}
                    </Text>
                  </View>
                  <View style={styles.alertChips}>
                    {s.alertNew ? <View style={styles.alertChip}><Text style={styles.alertChipText}>NEW</Text></View> : null}
                    {s.alertPriceDrop ? <View style={styles.alertChip}><Text style={styles.alertChipText}>DROP</Text></View> : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>SHORTCUTS</Text>
          <Text style={styles.sectionHint}>Saved across devices</Text>
        </View>

        <View style={styles.shortcutGrid}>
          <Shortcut
            label="Messages"
            sub={unreadFromRealtor > 0 ? `${unreadFromRealtor} new` : "Direct line"}
            Icon={MessageCircle}
            badge={unreadFromRealtor}
            onPress={tap(() => router.push("/messages"))}
          />
          <Shortcut
            label="Favorites"
            sub={favCount > 0 ? `${favCount} saved` : "Tap to browse"}
            Icon={Heart}
            onPress={tap(() => router.push("/favorites"))}
          />
          <Shortcut
            label="Alerts"
            sub={unreadAlerts > 0 ? `${unreadAlerts} unread` : `Updates from ${b.realtor.name.split(" ")[0]}`}
            Icon={Bell}
            badge={unreadAlerts}
            onPress={tap(() => router.push("/notifications"))}
          />
          <Shortcut
            label="Documents"
            sub="Sign & download"
            Icon={Bookmark}
            onPress={tap(() => router.push("/documents"))}
          />
          <Shortcut
            label="Book consultation"
            sub={`Meet with ${realtorName.split(" ")[0]}`}
            Icon={CalendarCheck}
            onPress={tap(bookConsultation)}
          />
        </View>

        <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
          <LogOut size={14} color="rgba(244,239,230,0.7)" strokeWidth={1.6} />
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </Pressable>

        <View style={styles.legalRow}>
          <Pressable
            onPress={tap(() => router.push({ pathname: "/legal", params: { doc: "privacy" } }))}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.legalLink}>Privacy</Text>
          </Pressable>
          <View style={styles.legalDot} />
          <Pressable
            onPress={tap(() => router.push({ pathname: "/legal", params: { doc: "terms" } }))}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.legalLink}>Terms</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleDelete}
          disabled={deleting}
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Delete my account"
        >
          <Trash2 size={12} color="rgba(224,110,90,0.85)" strokeWidth={1.6} />
          <Text style={styles.deleteText}>
            {deleting ? "DELETING…" : "DELETE MY ACCOUNT"}
          </Text>
        </Pressable>

        <View style={styles.assurance}>
          <ShieldCheck size={13} color="rgba(244,239,230,0.4)" strokeWidth={1.5} />
          <Text style={styles.assuranceText}>
            Your details go only to {realtorName.split(" ")[0]}. Never sold, never shared.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Shortcut({
  label,
  sub,
  Icon,
  onPress,
  badge,
}: {
  label: string;
  sub: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.tileIcon}>
        <Icon size={16} color={brand.ivory} strokeWidth={1.6} />
        {badge && badge > 0 ? (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,10,9,0.4)",
  },
  brandName: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 4,
  },
  brandSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 2,
  },
  hero: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22 },
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
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  heroSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.7)",
    fontSize: 14,
    lineHeight: 20,
  },
  profileCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 18,
    backgroundColor: "rgba(8,26,21,0.55)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.3)",
  },
  cardLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileValue: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  profileDivider: {
    height: 1,
    backgroundColor: "rgba(244,239,230,0.12)",
    marginVertical: 16,
  },
  editRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  editInput: {
    flex: 1,
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 18,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(244,239,230,0.25)",
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: brand.gold,
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  profileTask: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 18,
    backgroundColor: "rgba(210,163,67,0.09)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.34)",
    gap: 10,
  },
  profileTaskHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileTaskTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  profileTaskBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.66)",
    fontSize: 12.5,
    lineHeight: 18,
  },
  profileTaskMeterTrack: {
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(244,239,230,0.14)",
    overflow: "hidden",
    marginTop: 2,
  },
  profileTaskMeterFill: { height: 2, borderRadius: 999, backgroundColor: brand.gold },
  profileTaskFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileTaskMeta: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.55)",
    fontSize: 10.5,
    letterSpacing: 1.2,
  },
  profileTaskCta: { flexDirection: "row", alignItems: "center", gap: 6 },
  profileTaskCtaText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
  },
  sectionHint: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    backgroundColor: "rgba(8,26,21,0.5)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.25)",
  },
  thumbWrap: {
    width: 64,
    height: 64,
    backgroundColor: dark.goldSoft,
    borderRadius: 4,
    overflow: "hidden",
  },
  rowEyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
  },
  rowTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 15,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  rowMeta: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  empty: {
    marginHorizontal: 16,
    padding: 24,
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(8,26,21,0.45)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.12)",
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 15,
  },
  emptySub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  noteCard: {
    padding: 14,
    backgroundColor: "rgba(210,163,67,0.08)",
    borderLeftWidth: 2,
    borderLeftColor: brand.gold,
  },
  noteText: {
    fontFamily: fonts.serifItalic,
    color: brand.ivory,
    fontSize: 14,
    lineHeight: 20,
  },
  noteDate: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 1.8,
    marginTop: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "rgba(8,26,21,0.5)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.12)",
  },
  searchLabel: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  searchMeta: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 11,
    marginTop: 2,
  },
  alertChips: { flexDirection: "row", gap: 4 },
  alertChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    backgroundColor: "rgba(210,163,67,0.12)",
  },
  alertChipText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 8,
    letterSpacing: 1.4,
  },
  shortcutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 28,
  },
  tile: {
    width: "48.5%",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(8,26,21,0.5)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.25)",
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(210,163,67,0.18)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#A04A3C",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: dark.bg,
  },
  tileBadgeText: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 9,
  },
  tileLabel: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  tileSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 10.5,
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginHorizontal: 24,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.18)",
  },
  signOutText: {
    fontFamily: fonts.sansSemi,
    color: "rgba(244,239,230,0.7)",
    fontSize: 10,
    letterSpacing: 2.4,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 22,
  },
  legalLink: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.5)",
    fontSize: 11.5,
    letterSpacing: 0.4,
  },
  legalDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(244,239,230,0.3)",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 14,
    marginTop: 6,
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    color: "rgba(224,110,90,0.85)",
    fontSize: 10,
    letterSpacing: 2,
  },
  assurance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 40,
    marginTop: 2,
  },
  assuranceText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.4)",
    fontSize: 10.5,
    lineHeight: 16,
  },
});
