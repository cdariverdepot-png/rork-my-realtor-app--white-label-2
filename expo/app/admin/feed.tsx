import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  ChevronRight,
  FileText,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useClients, type Client } from "@/contexts/ClientsContext";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { useDocuments } from "@/contexts/DocumentsContext";
import {
  useClientFeed,
  type SavedSearch,
} from "@/contexts/ClientFeedContext";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import { specLine } from "@/lib/listingSpecs";

const ACCENT = SCREEN_ACCENT.adminFeed;
const SURFACE = "rgba(14,16,15,0.72)";
const SURFACE_HI = "rgba(14,16,15,0.82)";
const LINE = "rgba(244,239,230,0.12)";
const INK = "#0B0D0C";

type Tab = "pinned" | "notes" | "searches";

/** Editorial textures + accent colors — same palette as the admin
 *  Insights digest cards, so every stat strip reads as one system. */
const STAT_IMAGES = {
  leads: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c0c56eed-afa3-49a0-9867-9fa3725bbae2.png" },
  viewed: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/2195dcf4-b69b-433c-b880-1abaf83d602c.png" },
  docs: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/b545cbc8-efee-45e9-be11-e429ba2f13d7.png" },
} as const;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function AdminFeed() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const { isAdmin, hydrated } = useAuth();
  const { clients } = useClients();
  const { all: listings } = useListings();
  const { items: documents } = useDocuments();
  const {
    getFeed,
    togglePinListing,
    togglePinDoc,
    addNote,
    removeNote,
    upsertSearch,
    removeSearch,
    curatedClientCount,
  } = useClientFeed();

  const [clientId, setClientId] = useState<string>(params.clientId ?? clients[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("pinned");
  const [noteDraft, setNoteDraft] = useState<string>("");

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  useEffect(() => {
    if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [clientId, clients]);

  const client = useMemo<Client | undefined>(
    () => clients.find((c) => c.id === clientId),
    [clientId, clients]
  );
  const feed = useMemo(() => getFeed(clientId), [clientId, getFeed]);

  const tap = (cb: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb();
  };

  if (clients.length === 0) {
    return (
      <View style={styles.root}>
        <ScreenBackdrop screen="adminFeed" intensity="deep" />
        <ModalChrome eyebrow="Private feeds" />
        <View style={styles.empty}>
          <UserPlus size={20} color={ACCENT} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Add a client first.</Text>
          <Text style={styles.emptySub}>
            Private feeds are tied to specific clients. Build your roster, then come back to curate.
          </Text>
          <Pressable
            onPress={() => router.replace("/admin/clients")}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
          >
            <Plus size={14} color={INK} strokeWidth={2} />
            <Text style={styles.ctaText}>Manage roster</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScreenBackdrop screen="adminFeed" intensity="deep" />
      <ModalChrome eyebrow="Private feeds" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Curate exactly what {client?.name.split(" ")[0] ?? "this client"} sees — pinned homes,
          documents, private notes, and saved searches that quietly alert them on price drops or
          new matches.
        </Text>

        <View style={styles.statsRow}>
          <Stat
            label="ON ROSTER"
            value={String(clients.length)}
            Icon={Users}
            accent="#62D29A"
            image={STAT_IMAGES.leads}
          />
          <Stat
            label="CURATED"
            value={String(curatedClientCount)}
            Icon={Sparkles}
            accent="#6FA8E5"
            image={STAT_IMAGES.viewed}
          />
          <Stat
            label="PINNED"
            value={String(
              feed.pinnedListingIds.length + feed.pinnedDocumentIds.length + feed.notes.length
            )}
            Icon={Pin}
            accent="#C99BE5"
            image={STAT_IMAGES.docs}
          />
        </View>

        <Text style={styles.label}>CLIENT</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.clientRow}
        >
          {clients.map((c) => {
            const on = clientId === c.id;
            const f = getFeed(c.id);
            const total =
              f.pinnedListingIds.length + f.pinnedDocumentIds.length + f.notes.length;
            return (
              <Pressable
                key={c.id}
                onPress={tap(() => setClientId(c.id))}
                style={[styles.clientChip, on && styles.clientChipOn]}
              >
                <View style={[styles.avatar, on && { backgroundColor: ACCENT }]}>
                  <Text style={[styles.avatarText, on && { color: INK }]}>
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
                  <Text
                    style={[styles.clientName, on && { color: brand.ivory }]}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                  <Text
                    style={[
                      styles.clientMeta,
                      on && { color: "rgba(244,239,230,0.7)" },
                    ]}
                    numberOfLines={1}
                  >
                    {total > 0 ? `${total} curated` : "Not curated yet"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.tabRow}>
          {(
            [
              { id: "pinned", label: "PINNED", count: feed.pinnedListingIds.length + feed.pinnedDocumentIds.length },
              { id: "notes", label: "NOTES", count: feed.notes.length },
              { id: "searches", label: "ALERTS", count: feed.savedSearches.length },
            ] as const
          ).map((t) => {
            const on = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={tap(() => setTab(t.id))}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {t.label}
                  {t.count > 0 ? ` · ${t.count}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "pinned" && (
          <PinnedTab
            clientId={clientId}
            listings={listings}
            documents={documents}
            pinnedListingIds={feed.pinnedListingIds}
            pinnedDocumentIds={feed.pinnedDocumentIds}
            onTogglePinListing={togglePinListing}
            onTogglePinDoc={togglePinDoc}
          />
        )}

        {tab === "notes" && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.noteComposer}>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder={`A note for ${client?.name.split(" ")[0] ?? "them"} — context, a thought, anything.`}
                placeholderTextColor={brand.muted}
                multiline
                style={styles.noteInput}
              />
              <Pressable
                onPress={() => {
                  if (!noteDraft.trim()) return;
                  if (Platform.OS !== "web")
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  addNote(clientId, noteDraft);
                  setNoteDraft("");
                }}
                style={({ pressed }) => [
                  styles.addNoteBtn,
                  !noteDraft.trim() && { opacity: 0.4 },
                  pressed && { opacity: 0.85 },
                ]}
                disabled={!noteDraft.trim()}
              >
                <Plus size={14} color={INK} strokeWidth={2} />
                <Text style={styles.addNoteText}>Pin this note</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 16, gap: 8 }}>
              {feed.notes.length === 0 && (
                <View style={styles.softEmpty}>
                  <StickyNote size={16} color={ACCENT} strokeWidth={1.5} />
                  <Text style={styles.softEmptyText}>
                    No private notes yet. They appear inline on this client&apos;s home view.
                  </Text>
                </View>
              )}
              {feed.notes.map((n) => (
                <View key={n.id} style={styles.noteCard}>
                  <Text style={styles.noteText}>{n.text}</Text>
                  <View style={styles.noteFoot}>
                    <Text style={styles.noteDate}>
                      {new Date(n.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                    <Pressable
                      onPress={() => removeNote(clientId, n.id)}
                      hitSlop={8}
                      style={styles.noteDel}
                    >
                      <Trash2 size={12} color="#E06E5A" strokeWidth={1.5} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {tab === "searches" && (
          <SearchesTab
            clientId={clientId}
            searches={feed.savedSearches}
            onSave={(s) => upsertSearch(clientId, s)}
            onRemove={(id) => removeSearch(clientId, id)}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PinnedTab({
  clientId,
  listings,
  documents,
  pinnedListingIds,
  pinnedDocumentIds,
  onTogglePinListing,
  onTogglePinDoc,
}: {
  clientId: string;
  listings: ManagedListing[];
  documents: ReturnType<typeof useDocuments>["items"];
  pinnedListingIds: string[];
  pinnedDocumentIds: string[];
  onTogglePinListing: (cid: string, lid: string) => void;
  onTogglePinDoc: (cid: string, did: string) => void;
}) {
  const visibleListings = listings.filter((l) => !l.hidden);
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <Text style={styles.subHead}>HOMES TO HOLD FOR THEM</Text>
      <View style={{ gap: 8 }}>
        {visibleListings.length === 0 && (
          <View style={styles.softEmpty}>
            <Text style={styles.softEmptyText}>No live listings to pin yet.</Text>
          </View>
        )}
        {visibleListings.map((l) => {
          const on = pinnedListingIds.includes(l.id);
          return (
            <Pressable
              key={l.id}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                onTogglePinListing(clientId, l.id);
              }}
              style={({ pressed }) => [
                styles.pinRow,
                on && styles.pinRowOn,
                pressed && !on && { backgroundColor: "rgba(255,255,255,0.05)" },
              ]}
            >
              <View style={styles.thumb}>
                <Image
                  source={{ uri: l.images?.[0] ?? l.image }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pinKicker}>{l.neighborhood.toUpperCase()}</Text>
                <Text style={styles.pinTitle} numberOfLines={1}>
                  {l.title}
                </Text>
                <Text style={styles.pinMeta}>
                  {[l.price, specLine(l, "short", false)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {on ? (
                <Pin size={16} color={ACCENT} strokeWidth={2} />
              ) : (
                <PinOff size={16} color={brand.muted} strokeWidth={1.5} />
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.subHead, { marginTop: 24 }]}>DOCUMENTS TO HOLD FOR THEM</Text>
      <View style={{ gap: 8 }}>
        {documents.length === 0 && (
          <View style={styles.softEmpty}>
            <FileText size={16} color={ACCENT} strokeWidth={1.5} />
            <Text style={styles.softEmptyText}>No documents to pin yet.</Text>
          </View>
        )}
        {documents.map((d) => {
          const on = pinnedDocumentIds.includes(d.id);
          return (
            <Pressable
              key={d.id}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                onTogglePinDoc(clientId, d.id);
              }}
              style={({ pressed }) => [
                styles.pinRow,
                on && styles.pinRowOn,
                pressed && !on && { backgroundColor: "rgba(255,255,255,0.05)" },
              ]}
            >
              <View style={[styles.thumb, { backgroundColor: tint(ACCENT, 0.14), alignItems: "center", justifyContent: "center" }]}>
                <FileText size={20} color={ACCENT} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pinKicker}>{d.category.toUpperCase()}</Text>
                <Text style={styles.pinTitle} numberOfLines={1}>
                  {d.name}
                </Text>
                <Text style={styles.pinMeta}>
                  {d.kind === "portal" ? "Secure portal · signature" : "Attachment"}
                </Text>
              </View>
              {on ? (
                <Pin size={16} color={ACCENT} strokeWidth={2} />
              ) : (
                <PinOff size={16} color={brand.muted} strokeWidth={1.5} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SearchesTab({
  clientId,
  searches,
  onSave,
  onRemove,
}: {
  clientId: string;
  searches: SavedSearch[];
  onSave: (s: SavedSearch) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const [open, setOpen] = useState<boolean>(false);

  const startNew = () => {
    setEditing({
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: "",
      neighborhood: "",
      maxPrice: undefined,
      minBeds: undefined,
      tag: undefined,
      alertNew: true,
      alertPriceDrop: true,
      createdAt: Date.now(),
    });
    setOpen(true);
  };

  const startEdit = (s: SavedSearch) => {
    setEditing({ ...s });
    setOpen(true);
  };

  return (
    <View style={{ paddingHorizontal: 16 }} key={clientId}>
      {!open ? (
        <Pressable
          onPress={startNew}
          style={({ pressed }) => [styles.savedCta, pressed && { opacity: 0.92 }]}
        >
          <Search size={16} color={ACCENT} strokeWidth={1.6} />
          <View style={{ flex: 1 }}>
            <Text style={styles.savedCtaTitle}>New saved search + alert</Text>
            <Text style={styles.savedCtaSub}>
              Quietly notifies them on new matches and price drops only.
            </Text>
          </View>
          <ChevronRight size={14} color={ACCENT} strokeWidth={1.6} />
        </Pressable>
      ) : (
        <SearchEditor
          initial={editing!}
          onCancel={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={(s) => {
            if (!s.label.trim()) {
              Alert.alert("Add a label", "Give the search a short name like \"UWS family\".");
              return;
            }
            onSave(s);
            setOpen(false);
            setEditing(null);
          }}
        />
      )}

      <View style={{ marginTop: 16, gap: 8 }}>
        {searches.length === 0 && !open && (
          <View style={styles.softEmpty}>
            <Search size={16} color={ACCENT} strokeWidth={1.5} />
            <Text style={styles.softEmptyText}>
              No saved searches yet. Add one and we&apos;ll quietly watch the market for them.
            </Text>
          </View>
        )}
        {searches.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => startEdit(s)}
            style={({ pressed }) => [
              styles.searchRow,
              pressed && { backgroundColor: "rgba(255,255,255,0.05)" },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.searchLabel}>{s.label}</Text>
              <Text style={styles.searchMeta} numberOfLines={2}>
                {[
                  s.neighborhood,
                  s.tag,
                  s.minBeds ? `${s.minBeds}+ bd` : null,
                  s.maxPrice ? `≤ $${(s.maxPrice / 1_000_000).toFixed(2)}M` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Anywhere · any spec"}
              </Text>
              <Text style={styles.searchAlerts}>
                {s.alertNew ? "● NEW MATCHES" : ""}
                {s.alertNew && s.alertPriceDrop ? "  " : ""}
                {s.alertPriceDrop ? "● PRICE DROPS" : ""}
                {!s.alertNew && !s.alertPriceDrop ? "MUTED" : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => onRemove(s.id)}
              hitSlop={8}
              style={styles.searchDel}
            >
              <Trash2 size={12} color="#E06E5A" strokeWidth={1.5} />
            </Pressable>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SearchEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: SavedSearch;
  onCancel: () => void;
  onSave: (s: SavedSearch) => void;
}) {
  const [s, setS] = useState<SavedSearch>(initial);

  const tags: ManagedListing["tag"][] = [
    "Off-market",
    "Quiet listing",
    "New",
    "Just reduced",
  ];

  return (
    <View style={styles.editor}>
      <View style={styles.editorHead}>
        <Text style={styles.label}>SAVED SEARCH</Text>
        <Pressable onPress={onCancel} hitSlop={10} style={styles.cancelBtn}>
          <X size={12} color={brand.muted} strokeWidth={1.6} />
          <Text style={styles.cancelText}>CANCEL</Text>
        </Pressable>
      </View>

      <TextInput
        value={s.label}
        onChangeText={(label) => setS({ ...s, label })}
        placeholder="Label, e.g. UWS family"
        placeholderTextColor={brand.muted}
        style={styles.input}
      />
      <TextInput
        value={s.neighborhood ?? ""}
        onChangeText={(neighborhood) => setS({ ...s, neighborhood: neighborhood || undefined })}
        placeholder="Neighborhood (optional)"
        placeholderTextColor={brand.muted}
        style={styles.input}
      />
      <View style={styles.dualRow}>
        <TextInput
          value={s.minBeds ? String(s.minBeds) : ""}
          onChangeText={(v) => {
            const n = parseInt(v.replace(/\D/g, ""), 10);
            setS({ ...s, minBeds: Number.isFinite(n) ? n : undefined });
          }}
          placeholder="Min beds"
          placeholderTextColor={brand.muted}
          keyboardType="number-pad"
          style={[styles.input, { flex: 1 }]}
        />
        <TextInput
          value={s.maxPrice ? String(s.maxPrice / 1_000_000) : ""}
          onChangeText={(v) => {
            const n = parseFloat(v);
            setS({ ...s, maxPrice: Number.isFinite(n) ? n * 1_000_000 : undefined });
          }}
          placeholder="Max price ($M)"
          placeholderTextColor={brand.muted}
          keyboardType="decimal-pad"
          style={[styles.input, { flex: 1 }]}
        />
      </View>

      <Text style={[styles.label, { marginTop: 8 }]}>TAG</Text>
      <View style={styles.tagRow}>
        <Pressable
          onPress={() => setS({ ...s, tag: undefined })}
          style={[styles.tagPill, !s.tag && styles.tagPillOn]}
        >
          <Text style={[styles.tagText, !s.tag && { color: brand.ivory }]}>Any</Text>
        </Pressable>
        {tags.map((t) => {
          const on = s.tag === t;
          return (
            <Pressable
              key={t}
              onPress={() => setS({ ...s, tag: t })}
              style={[styles.tagPill, on && styles.tagPillOn]}
            >
              <Text style={[styles.tagText, on && { color: brand.ivory }]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Alert on new matches</Text>
          <Text style={styles.toggleSub}>One quiet push when a fresh listing fits.</Text>
        </View>
        <Switch
          value={s.alertNew}
          onValueChange={(alertNew) => setS({ ...s, alertNew })}
          trackColor={{ true: ACCENT, false: "rgba(244,239,230,0.18)" }}
          thumbColor={brand.ivory}
        />
      </View>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Alert on price drops</Text>
          <Text style={styles.toggleSub}>Only when something already on radar moves.</Text>
        </View>
        <Switch
          value={s.alertPriceDrop}
          onValueChange={(alertPriceDrop) => setS({ ...s, alertPriceDrop })}
          trackColor={{ true: ACCENT, false: "rgba(244,239,230,0.18)" }}
          thumbColor={brand.ivory}
        />
      </View>

      <Pressable
        onPress={() => onSave(s)}
        style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.9 }]}
      >
        <Text style={styles.saveBtnText}>Save search</Text>
      </Pressable>
    </View>
  );
}

function Stat({
  label,
  value,
  Icon,
  accent,
  image,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  accent: string;
  image: { uri: string };
}) {
  return (
    <View style={styles.statTile}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(8,9,12,0.6)", "rgba(8,9,12,0.88)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.statIcon, { borderColor: hexToRgba(accent, 0.4) }]}>
        <Icon size={13} color={accent} strokeWidth={1.9} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statLabel, { color: accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  intro: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginHorizontal: 24,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 8,
    marginBottom: 22,
  },
  statTile: {
    flex: 1,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
    overflow: "hidden",
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(8,10,9,0.72)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 24, letterSpacing: -0.5 },
  statLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 8.5,
    letterSpacing: 1.6,
    marginTop: 5,
  },
  statDivider: { width: 1, backgroundColor: brand.nightLine },

  label: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginBottom: 10,
  },
  subHead: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 9,
    letterSpacing: 2.5,
    marginTop: 8,
    marginBottom: 10,
  },

  clientRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 4,
  },
  clientChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 200,
    padding: 10,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  clientChipOn: { backgroundColor: tint(ACCENT, 0.16), borderColor: tint(ACCENT, 0.6) },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tint(ACCENT, 0.16),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 11, letterSpacing: 1 },
  clientName: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  clientMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 10, marginTop: 2 },

  tabRow: {
    flexDirection: "row",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  tabOn: { backgroundColor: tint(ACCENT, 0.18), borderColor: tint(ACCENT, 0.6) },
  tabText: { fontFamily: fonts.sansSemi, color: brand.textOnDarkMuted, fontSize: 10, letterSpacing: 1.5 },
  tabTextOn: { color: brand.ivory },

  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  pinRowOn: { borderColor: tint(ACCENT, 0.6), backgroundColor: tint(ACCENT, 0.1) },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: tint(ACCENT, 0.14),
    overflow: "hidden",
  },
  pinKicker: { fontFamily: fonts.sansMedium, color: ACCENT, fontSize: 9, letterSpacing: 2 },
  pinTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14, marginTop: 3 },
  pinMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3 },

  noteComposer: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: LINE,
    backgroundColor: SURFACE,
    gap: 10,
  },
  noteInput: {
    minHeight: 90,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: LINE,
    backgroundColor: "rgba(255,255,255,0.04)",
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 14,
    textAlignVertical: "top",
  },
  addNoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  addNoteText: {
    fontFamily: fonts.sansSemi,
    color: INK,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  noteCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  noteText: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 15, lineHeight: 22 },
  noteFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  noteDate: { fontFamily: fonts.sansMedium, color: brand.textOnDarkMuted, fontSize: 9, letterSpacing: 1.5 },
  noteDel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: LINE,
  },

  savedCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: tint(ACCENT, 0.12),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.4),
  },
  savedCtaTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16 },
  savedCtaSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.7)",
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },

  editor: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: LINE,
    backgroundColor: SURFACE_HI,
    gap: 10,
  },
  editorHead: {
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
  cancelText: { fontFamily: fonts.sansMedium, fontSize: 9, color: brand.textOnDarkMuted, letterSpacing: 1.5 },
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
  dualRow: { flexDirection: "row", gap: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
  },
  tagPillOn: { backgroundColor: tint(ACCENT, 0.18), borderColor: tint(ACCENT, 0.6) },
  tagText: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 12 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  toggleTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  toggleSub: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 2 },
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    color: INK,
    fontSize: 12,
    letterSpacing: 1.6,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  searchLabel: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16 },
  searchMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 4 },
  searchAlerts: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 6,
  },
  searchDel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: LINE,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 22, marginTop: 6 },
  emptySub: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: ACCENT,
    marginTop: 14,
  },
  ctaText: { fontFamily: fonts.sansSemi, color: INK, fontSize: 12, letterSpacing: 1.6 },

  softEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  softEmptyText: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
