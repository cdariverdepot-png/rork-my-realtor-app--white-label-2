import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import PortraitImage from "./PortraitImage";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Send,
  Check,
  CheckCheck,
  Plus,
  Paperclip,
  X,
  Home,
  FileText,
  Pencil,
  Trash2,
  Bookmark,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, fonts } from "@/constants/colors";
import { avatarPlaceholder } from "@/constants/assets";
import { useBrand } from "@/contexts/BrandContext";
import { useMessages, type ChatRole } from "@/contexts/MessagesContext";
import { useListings } from "@/contexts/ListingsContext";
import { useDocuments } from "@/contexts/DocumentsContext";
import { useQuickReplies, type QuickReply } from "@/contexts/QuickRepliesContext";
import ModalChrome from "@/components/ModalChrome";
import { bustedUri } from "@/lib/imageUri";

type Pending = { kind: "listing"; id: string } | { kind: "document"; id: string } | null;

/**
 * Shared chat thread used on both client and admin sides.
 * Pass `role` to identify who is sending in this view.
 */
export default function ChatThread({
  role,
  eyebrow,
  topHint,
  clientName,
}: {
  role: ChatRole;
  eyebrow: string;
  /** Optional banner rendered above the thread — used for empty-state CTAs. */
  topHint?: React.ReactNode;
  /** When the realtor views a client thread, the client's display name. */
  clientName?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { messages, otherTyping, send, setTyping, markRead, hasThread } = useMessages();
  const { all: allListings } = useListings();
  const { items: docs } = useDocuments();
  const { replies, custom, add, remove, update } = useQuickReplies();

  const [text, setText] = useState<string>("");
  const [pending, setPending] = useState<Pending>(null);
  const [attachOpen, setAttachOpen] = useState<boolean>(false);
  const [manageOpen, setManageOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState<string>("");
  const [draftText, setDraftText] = useState<string>("");

  const { brand: b } = useBrand();
  const realtor = b.realtor;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    markRead(role);
  }, [role, messages.length, markRead]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, otherTyping]);

  const onSubmit = () => {
    if (!text.trim() && !pending) return;
    // No conversation to send into (e.g. the realtor's client preview): say so
    // instead of clearing the text as if it had been sent.
    if (!hasThread) {
      Alert.alert("Preview only", "In your clients' app this sends straight to your Messages inbox.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    send(role, text.trim() || (pending?.kind === "listing" ? "Sharing this listing." : "Sharing a document."), {
      listingId: pending?.kind === "listing" ? pending.id : undefined,
      documentId: pending?.kind === "document" ? pending.id : undefined,
    });
    setText("");
    setPending(null);
  };

  const onChange = (v: string) => {
    setText(v);
    setTyping(role);
  };

  const onTemplate = (q: QuickReply) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setText((prev) => (prev.trim() ? `${prev.trim()} ${q.text}` : q.text));
  };

  const openCreate = () => {
    setEditingId(null);
    setDraftLabel("");
    setDraftText("");
    setManageOpen(true);
  };

  const openEdit = (q: QuickReply) => {
    setEditingId(q.id);
    setDraftLabel(q.label);
    setDraftText(q.text);
    setManageOpen(true);
  };

  const saveDraft = () => {
    if (!draftLabel.trim() || !draftText.trim()) return;
    if (editingId) {
      update(editingId, { label: draftLabel, text: draftText });
    } else {
      add({ label: draftLabel, text: draftText });
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setManageOpen(false);
  };

  const pendingListing = useMemo(
    () => (pending?.kind === "listing" ? allListings.find((l) => l.id === pending.id) : null),
    [pending, allListings]
  );
  const pendingDoc = useMemo(
    () => (pending?.kind === "document" ? docs.find((d) => d.id === pending.id) : null),
    [pending, docs]
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ModalChrome eyebrow={eyebrow} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, gap: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          {role === "client" && b.portraitUrl ? (
            <PortraitImage uri={b.portraitUrl} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Image source={avatarPlaceholder} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.introName}>
              {role === "realtor" ? clientName ?? "Client" : realtor.name}
            </Text>
            <Text style={styles.introSub}>
              {role === "realtor"
                ? "Private client thread"
                : `${realtor.title} · usually replies within the hour`}
            </Text>
          </View>
        </View>

        {topHint}

        {messages.map((m, idx) => {
          const mine = m.role === role;
          const prev = messages[idx - 1];
          const showHead = !prev || prev.role !== m.role;
          const listing = m.listingId ? allListings.find((l) => l.id === m.listingId) : null;
          const doc = m.documentId ? docs.find((d) => d.id === m.documentId) : null;
          return (
            <View key={m.id} style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
              {!mine && showHead && (
                <Text style={styles.bubbleHead}>{m.role === "realtor" ? realtor.name.split(" ")[0] : clientName ?? "Client"}</Text>
              )}
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {listing && (
                  <Pressable
                    onPress={() => router.push(`/listing/${listing.id}`)}
                    style={styles.attached}
                  >
                    <Image
                      source={{ uri: bustedUri(listing.images?.[0] ?? listing.image, listing.updatedAt) }}
                      style={styles.attachedImg}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attachedHood}>{listing.neighborhood.toUpperCase()}</Text>
                      <Text style={styles.attachedTitle}>{listing.title}</Text>
                      <Text style={styles.attachedPrice}>{listing.price}</Text>
                    </View>
                  </Pressable>
                )}
                {doc && (
                  <View style={styles.attached}>
                    <View style={[styles.attachedImg, styles.docIcon]}>
                      <FileText size={20} color={brand.goldLight} strokeWidth={1.5} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attachedHood}>{(doc.category ?? "DOCUMENT").toString().toUpperCase()}</Text>
                      <Text style={styles.attachedTitle} numberOfLines={1}>
                        {doc.name}
                      </Text>
                      <Text style={styles.attachedPrice}>
                        {doc.kind === "portal" ? "Secure portal" : "Attachment"}
                      </Text>
                    </View>
                  </View>
                )}
                <Text style={[styles.bubbleText, mine && { color: brand.ivory }]}>{m.text}</Text>
                <View style={styles.bubbleFoot}>
                  <Text style={[styles.timeText, mine && { color: "rgba(244,239,230,0.6)" }]}>
                    {new Date(m.createdAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                  {mine ? (
                    m.read ? (
                      <CheckCheck size={12} color={brand.goldLight} strokeWidth={2} />
                    ) : (
                      <Check size={12} color="rgba(244,239,230,0.6)" strokeWidth={2} />
                    )
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}

        {otherTyping && (
          <View style={[styles.bubbleWrap, styles.left]}>
            <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
              <View style={styles.dot} />
              <View style={[styles.dot, { opacity: 0.6 }]} />
              <View style={[styles.dot, { opacity: 0.3 }]} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick reply rail (realtor only) */}
      {role === "realtor" && (
        <View style={styles.rail}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railInner}
            keyboardShouldPersistTaps="handled"
          >
            {replies.map((q) => (
              <Pressable
                key={q.id}
                onPress={() => onTemplate(q)}
                onLongPress={() => openEdit(q)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.chipText}>{q.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={openCreate}
              style={({ pressed }) => [styles.chipGhost, pressed && { opacity: 0.7 }]}
            >
              <Plus size={12} color={brand.goldDeep} strokeWidth={2} />
              <Text style={styles.chipGhostText}>New template</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Pending attachment preview */}
      {pending && (pendingListing || pendingDoc) && (
        <View style={styles.pendingBar}>
          {pendingListing && (
            <View style={styles.pendingItem}>
              <Image
                source={{ uri: pendingListing.images?.[0] ?? pendingListing.image }}
                style={styles.pendingImg}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingHood}>{pendingListing.neighborhood.toUpperCase()}</Text>
                <Text style={styles.pendingTitle} numberOfLines={1}>
                  {pendingListing.title}
                </Text>
              </View>
            </View>
          )}
          {pendingDoc && (
            <View style={styles.pendingItem}>
              <View style={[styles.pendingImg, styles.docIconLight]}>
                <FileText size={16} color={brand.goldDeep} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingHood}>
                  {(pendingDoc.category ?? "DOCUMENT").toString().toUpperCase()}
                </Text>
                <Text style={styles.pendingTitle} numberOfLines={1}>
                  {pendingDoc.name}
                </Text>
              </View>
            </View>
          )}
          <Pressable onPress={() => setPending(null)} style={styles.pendingClose} hitSlop={8}>
            <X size={14} color={brand.muted} strokeWidth={2} />
          </Pressable>
        </View>
      )}

      <View style={[styles.dock, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          onPress={() => setAttachOpen(true)}
          style={({ pressed }) => [styles.attachBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Paperclip size={18} color={brand.goldDeep} strokeWidth={2} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onChange}
          placeholder={role === "realtor" ? `Reply to ${clientName ?? "your client"}…` : `Write to ${realtor.name.split(" ")[0]}…`}
          placeholderTextColor={brand.muted}
          style={styles.input}
          multiline
          onSubmitEditing={onSubmit}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!text.trim() && !pending}
          style={({ pressed }) => [
            styles.sendBtn,
            !text.trim() && !pending && { opacity: 0.4 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Send size={16} color={brand.forestDeep} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Attach picker */}
      <Modal
        transparent
        visible={attachOpen}
        animationType="fade"
        onRequestClose={() => setAttachOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setAttachOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Attach</Text>

            <Text style={styles.sheetLabel}>LISTINGS</Text>
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
              {allListings.length === 0 && (
                <Text style={styles.empty}>No listings yet.</Text>
              )}
              {allListings.map((l) => (
                <Pressable
                  key={l.id}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                  onPress={() => {
                    setPending({ kind: "listing", id: l.id });
                    setAttachOpen(false);
                  }}
                >
                  <Image source={{ uri: bustedUri(l.images?.[0] ?? l.image, l.updatedAt) }} style={styles.rowImg} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowHood}>{l.neighborhood.toUpperCase()}</Text>
                    <Text style={styles.rowTitle} numberOfLines={1}>{l.title}</Text>
                    <Text style={styles.rowMeta}>{l.price}</Text>
                  </View>
                  <Home size={16} color={brand.goldDeep} strokeWidth={1.5} />
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.sheetLabel, { marginTop: 18 }]}>DOCUMENTS</Text>
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
              {docs.length === 0 && <Text style={styles.empty}>No documents yet.</Text>}
              {docs.map((d) => (
                <Pressable
                  key={d.id}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                  onPress={() => {
                    setPending({ kind: "document", id: d.id });
                    setAttachOpen(false);
                  }}
                >
                  <View style={[styles.rowImg, styles.docIconLight]}>
                    <FileText size={18} color={brand.goldDeep} strokeWidth={1.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowHood}>{(d.category ?? "DOCUMENT").toString().toUpperCase()}</Text>
                    <Text style={styles.rowTitle} numberOfLines={1}>{d.name}</Text>
                    <Text style={styles.rowMeta}>
                      {d.kind === "portal" ? "Secure portal link" : "Uploaded file"}
                    </Text>
                  </View>
                  <Bookmark size={16} color={brand.goldDeep} strokeWidth={1.5} />
                </Pressable>
              ))}
            </ScrollView>

            <Pressable style={styles.sheetCancel} onPress={() => setAttachOpen(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Template editor */}
      <Modal
        transparent
        visible={manageOpen}
        animationType="fade"
        onRequestClose={() => setManageOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setManageOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.editorHead}>
              <Text style={styles.sheetTitle}>
                {editingId ? "Edit template" : "New template"}
              </Text>
              {editingId && !custom.find((c) => c.id === editingId) ? null : editingId ? (
                <Pressable
                  onPress={() => {
                    remove(editingId);
                    setManageOpen(false);
                  }}
                  hitSlop={8}
                  style={styles.deleteBtn}
                >
                  <Trash2 size={14} color={brand.muted} strokeWidth={1.8} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.sheetLabel}>LABEL</Text>
            <TextInput
              value={draftLabel}
              onChangeText={setDraftLabel}
              placeholder="e.g. Open house Sunday"
              placeholderTextColor={brand.muted}
              style={styles.field}
              maxLength={40}
            />

            <Text style={[styles.sheetLabel, { marginTop: 14 }]}>MESSAGE</Text>
            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder="What should the template send?"
              placeholderTextColor={brand.muted}
              style={[styles.field, styles.fieldMulti]}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable
                style={[styles.sheetCancel, { flex: 1 }]}
                onPress={() => setManageOpen(false)}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  (!draftLabel.trim() || !draftText.trim()) && { opacity: 0.45 },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={saveDraft}
                disabled={!draftLabel.trim() || !draftText.trim()}
              >
                <Pencil size={14} color={brand.forestDeep} strokeWidth={2} />
                <Text style={styles.saveBtnText}>{editingId ? "Save" : "Add template"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.paper },
  intro: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: brand.gold },
  avatarFallback: { backgroundColor: "#07070A", overflow: "hidden" },
  introName: { fontFamily: fonts.serif, color: brand.ink, fontSize: 16 },
  introSub: { fontFamily: fonts.sans, color: brand.muted, fontSize: 11, marginTop: 2 },
  bubbleWrap: { maxWidth: "82%" },
  left: { alignSelf: "flex-start" },
  right: { alignSelf: "flex-end" },
  bubbleHead: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: { paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  bubbleMine: { backgroundColor: brand.forest },
  bubbleTheirs: { backgroundColor: "#fff", borderWidth: 1, borderColor: brand.hairline },
  bubbleText: { fontFamily: fonts.serif, color: brand.ink, fontSize: 15, lineHeight: 21 },
  bubbleFoot: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  timeText: { fontFamily: fonts.sans, color: brand.muted, fontSize: 10 },
  typing: { flexDirection: "row", gap: 4, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.muted },

  attached: {
    flexDirection: "row",
    gap: 10,
    padding: 8,
    backgroundColor: "rgba(244,239,230,0.1)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    alignItems: "center",
  },
  attachedImg: { width: 48, height: 48, backgroundColor: brand.forestDeep },
  docIcon: { alignItems: "center", justifyContent: "center" },
  attachedHood: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 9, letterSpacing: 2 },
  attachedTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 13, marginTop: 2 },
  attachedPrice: { fontFamily: fonts.serifItalic, color: brand.goldLight, fontSize: 12, marginTop: 2 },

  rail: {
    borderTopWidth: 1,
    borderTopColor: brand.hairline,
    backgroundColor: brand.paper,
  },
  railInner: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: "center" },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: brand.hairline,
    backgroundColor: "#fff",
  },
  chipText: { fontFamily: fonts.sansMedium, color: brand.ink, fontSize: 12, letterSpacing: 0.4 },
  chipGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: brand.gold,
    borderStyle: "dashed",
  },
  chipGhostText: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 11,
    letterSpacing: 1.2,
  },

  pendingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: brand.hairline,
    backgroundColor: "#fff",
  },
  pendingItem: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" },
  pendingImg: { width: 36, height: 36, backgroundColor: brand.forestDeep },
  docIconLight: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(210,163,67,0.12)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.35)",
  },
  pendingHood: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 9,
    letterSpacing: 1.6,
  },
  pendingTitle: { fontFamily: fonts.serif, color: brand.ink, fontSize: 13, marginTop: 2 },
  pendingClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.hairline,
  },

  dock: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: brand.paper,
    borderTopWidth: 1,
    borderTopColor: brand.hairline,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: brand.hairline,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: brand.hairline,
    backgroundColor: "#fff",
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 0,
    backgroundColor: brand.gold,
    alignItems: "center",
    justifyContent: "center",
  },

  scrim: {
    flex: 1,
    backgroundColor: "rgba(13,26,22,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: brand.paper,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: brand.gold,
  },
  sheetHandle: {
    width: 40,
    height: 3,
    backgroundColor: brand.hairline,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 22,
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  sheetLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  empty: {
    fontFamily: fonts.serifItalic,
    color: brand.muted,
    fontSize: 13,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
  },
  rowImg: { width: 44, height: 44, backgroundColor: brand.forestDeep },
  rowHood: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  rowTitle: { fontFamily: fonts.serif, color: brand.ink, fontSize: 14, marginTop: 2 },
  rowMeta: { fontFamily: fonts.sans, color: brand.muted, fontSize: 11, marginTop: 1 },
  sheetCancel: {
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.hairline,
    marginTop: 14,
  },
  sheetCancelText: {
    fontFamily: fonts.sansSemi,
    color: brand.ink,
    fontSize: 12,
    letterSpacing: 2,
  },

  editorHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  deleteBtnText: {
    fontFamily: fonts.sansMedium,
    color: brand.muted,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  field: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: brand.hairline,
    backgroundColor: "#fff",
  },
  fieldMulti: { minHeight: 90, textAlignVertical: "top", lineHeight: 21 },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: brand.gold,
    paddingVertical: 14,
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    color: brand.forestDeep,
    fontSize: 12,
    letterSpacing: 2,
  },
});
