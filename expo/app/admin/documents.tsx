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
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import {
  Check,
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  FileText,
  FolderOpen,
  Link as LinkIcon,
  Paperclip,
  PenLine,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import {
  STAGES,
  useDocuments,
  type DocCategory,
  type DocItem,
  type DocPortal,
  type DocStage,
  type DocStatus,
  type Transaction,
} from "@/contexts/DocumentsContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useClients } from "@/contexts/ClientsContext";
import ModalChrome from "@/components/ModalChrome";
import EmptyState from "@/components/EmptyState";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";

const ACCENT = SCREEN_ACCENT.adminDocuments;
const SURFACE = "rgba(14,16,15,0.72)";
const SURFACE_HI = "rgba(14,16,15,0.82)";
const LINE = "rgba(244,239,230,0.12)";
const INK = "#0B0D0C";

const CATS: DocCategory[] = ["Contract", "Disclosure", "Inspection", "Other"];

type Mode = "portal" | "file";

const PORTALS: { key: DocPortal; label: string; hint: string; signInUrl: string }[] = [
  {
    key: "docusign",
    label: "DocuSign",
    hint: "eSignature · the industry standard",
    signInUrl: "https://account.docusign.com/",
  },
  {
    key: "dotloop",
    label: "Dotloop",
    hint: "Transactions for real estate",
    signInUrl: "https://www.dotloop.com/my/login/",
  },
  {
    key: "skyslope",
    label: "SkySlope",
    hint: "Brokerage compliance + signing",
    signInUrl: "https://app.skyslope.com/",
  },
  {
    key: "authentisign",
    label: "Authentisign",
    hint: "Lone Wolf · NAR member benefit",
    signInUrl: "https://authentisign.com/",
  },
  {
    key: "adobesign",
    label: "Adobe Acrobat Sign",
    hint: "Enterprise-grade eSignature",
    signInUrl: "https://acrobat.adobe.com/link/sign/start",
  },
  {
    key: "hellosign",
    label: "Dropbox Sign",
    hint: "Formerly HelloSign",
    signInUrl: "https://app.hellosign.com/",
  },
  {
    key: "other",
    label: "Other portal",
    hint: "Paste any secure signing link",
    signInUrl: "",
  },
];

export default function AdminDocuments() {
  const router = useRouter();
  const { isAdmin, hydrated } = useAuth();
  const { brand: b } = useBrand();
  const firstName = b.realtor.name.split(" ")[0] ?? b.realtor.name;
  const {
    items,
    transactions,
    add,
    remove,
    setStatus,
    createTransaction,
  } = useDocuments();
  const { broadcastFromRealtor } = useNotifications();
  const { clients } = useClients();

  const [mode, setMode] = useState<Mode>("portal");

  // Portal form
  const [portal, setPortal] = useState<DocPortal>("docusign");
  const [envelopeUrl, setEnvelopeUrl] = useState<string>("");

  // Shared form
  const [name, setName] = useState<string>("");
  const [category, setCategory] = useState<DocCategory>("Contract");
  const [note, setNote] = useState<string>("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [transactionId, setTransactionId] = useState<string | null>(
    transactions[0]?.id ?? null
  );
  const [stage, setStage] = useState<DocStage>("Offer");
  const [showNewTx, setShowNewTx] = useState<boolean>(false);
  const [newTxAddress, setNewTxAddress] = useState<string>("");
  const [newTxRef, setNewTxRef] = useState<string>("");

  // File form
  const [picking, setPicking] = useState<boolean>(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pendingSize, setPendingSize] = useState<number | undefined>(undefined);
  const [pendingMime, setPendingMime] = useState<string | undefined>(undefined);
  const [pendingFileName, setPendingFileName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const tap = (cb: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb();
  };

  const portalMeta = useMemo(() => PORTALS.find((p) => p.key === portal) ?? PORTALS[0], [portal]);

  const toggleRecipient = (id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setRecipientIds(recipientIds.length === clients.length ? [] : clients.map((c) => c.id));
  };

  const pick = async () => {
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setPendingUri(a.uri);
      setPendingSize(a.size);
      setPendingMime(a.mimeType);
      setPendingFileName(a.name);
      if (!name) setName(a.name?.replace(/\.[^.]+$/, "") ?? "Document");
    } catch (e) {
      console.log("[admin/docs] pick", e);
      Alert.alert("Couldn't pick file", "Try again or attach a public URL instead.");
    } finally {
      setPicking(false);
    }
  };

  const reset = () => {
    setName("");
    setNote("");
    setRecipientIds([]);
    setEnvelopeUrl("");
    setPendingUri(null);
    setPendingSize(undefined);
    setPendingMime(undefined);
    setPendingFileName(undefined);
  };

  const createNewTx = () => {
    if (!newTxAddress.trim()) {
      Alert.alert("Add an address", "Give this transaction a property or title.");
      return;
    }
    const t = createTransaction({
      address: newTxAddress.trim(),
      reference: newTxRef.trim() || undefined,
      stage,
      clientIds: recipientIds,
    });
    setTransactionId(t.id);
    setNewTxAddress("");
    setNewTxRef("");
    setShowNewTx(false);
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const validRecipients = (): boolean => {
    if (clients.length === 0) {
      Alert.alert(
        "No clients yet",
        "Add a client first — that's who receives this document.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add a client", onPress: () => router.push("/admin/clients") },
        ]
      );
      return false;
    }
    if (recipientIds.length === 0) {
      Alert.alert("Choose recipients", "Select at least one client to share this with.");
      return false;
    }
    return true;
  };

  const sendPortal = () => {
    if (!name.trim()) {
      Alert.alert("Add a document name", "Give this envelope a clear title for the client.");
      return;
    }
    if (!envelopeUrl.trim() || !/^https?:\/\//i.test(envelopeUrl.trim())) {
      Alert.alert(
        "Paste the secure link",
        `Open ${portalMeta.label}, prepare the envelope, then paste the recipient signing link here.`
      );
      return;
    }
    if (!validRecipients()) return;

    const now = Date.now();
    const d: DocItem = {
      id: `d_${now}`,
      name: name.trim(),
      category,
      kind: "portal",
      portal,
      uri: envelopeUrl.trim(),
      uploadedAt: now,
      sentAt: now,
      note: note.trim() || undefined,
      status: "awaiting-signature",
      recipientIds: [...recipientIds],
      transactionId: transactionId ?? undefined,
      stage,
    };
    add(d);
    const recipientNames = clients
      .filter((c) => recipientIds.includes(c.id))
      .map((c) => c.name.split(" ")[0])
      .join(", ");
    broadcastFromRealtor({
      kind: "personal",
      title: `${portalMeta.label} envelope ready`,
      body: `${d.name} — open & sign securely. Sent to ${recipientNames}.`,
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reset();
  };

  const sendFile = () => {
    if (!pendingUri || !name.trim()) {
      Alert.alert("Add a name and a file", "We need both before sharing.");
      return;
    }
    if (!validRecipients()) return;
    const now = Date.now();
    const d: DocItem = {
      id: `d_${now}`,
      name: name.trim(),
      category,
      kind: "file",
      uri: pendingUri,
      size: pendingSize,
      mimeType: pendingMime,
      uploadedAt: now,
      sentAt: now,
      note: note.trim() || undefined,
      status: "shared",
      recipientIds: [...recipientIds],
      transactionId: transactionId ?? undefined,
      stage,
    };
    add(d);
    const recipientNames = clients
      .filter((c) => recipientIds.includes(c.id))
      .map((c) => c.name.split(" ")[0])
      .join(", ");
    broadcastFromRealtor({
      kind: "personal",
      title: `${firstName} shared a document`,
      body: `${category} · ${d.name} — sent to ${recipientNames}.`,
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reset();
  };

  const openPortal = async () => {
    if (!portalMeta.signInUrl) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try {
      await WebBrowser.openBrowserAsync(portalMeta.signInUrl);
    } catch (e) {
      console.log("[admin/docs] portal open", e);
      Linking.openURL(portalMeta.signInUrl).catch(() => {});
    }
  };

  const confirmDel = (d: DocItem) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete "${d.name}"?`)) remove(d.id);
      return;
    }
    Alert.alert("Delete document", `"${d.name}" will be removed for the client too.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove(d.id) },
    ]);
  };

  const recipientLabel = (d: DocItem): string => {
    if (!d.recipientIds || d.recipientIds.length === 0) return "All clients";
    const named = clients.filter((c) => d.recipientIds!.includes(c.id)).map((c) => c.name);
    if (named.length === 0) return `${d.recipientIds.length} recipient(s)`;
    if (named.length <= 2) return named.join(", ");
    return `${named[0]} +${named.length - 1}`;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScreenBackdrop screen="adminDocuments" intensity="deep" />
      <ModalChrome eyebrow="Documents · admin" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode switcher */}
        <View style={styles.tabRow}>
          <ModeTab
            label="Send via secure portal"
            sub="DocuSign · Dotloop · SkySlope"
            Icon={ShieldCheck}
            active={mode === "portal"}
            onPress={tap(() => setMode("portal"))}
          />
          <ModeTab
            label="Attach a file"
            sub="Reference only · no signature"
            Icon={Paperclip}
            active={mode === "file"}
            onPress={tap(() => setMode("file"))}
          />
        </View>

        {mode === "portal" ? (
          <View style={styles.composer}>
            <Text style={styles.label}>1 · CHOOSE PORTAL</Text>
            <View style={styles.portalGrid}>
              {PORTALS.map((p) => {
                const on = portal === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPortal(p.key)}
                    style={[styles.portalChip, on && styles.portalChipOn]}
                  >
                    <Text style={[styles.portalLabel, on && { color: brand.ivory }]}>
                      {p.label}
                    </Text>
                    <Text style={[styles.portalHint, on && { color: "rgba(244,239,230,0.65)" }]}>
                      {p.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {portalMeta.signInUrl ? (
              <Pressable
                onPress={openPortal}
                style={({ pressed }) => [styles.portalOpen, pressed && { opacity: 0.92 }]}
              >
                <ExternalLink size={14} color={ACCENT} strokeWidth={1.6} />
                <Text style={styles.portalOpenText}>
                  Open {portalMeta.label} to prepare the envelope
                </Text>
              </Pressable>
            ) : null}

            <Text style={[styles.label, { marginTop: 16 }]}>2 · PASTE SIGNING LINK</Text>
            <View style={styles.linkInputWrap}>
              <LinkIcon size={14} color={brand.muted} strokeWidth={1.6} />
              <TextInput
                value={envelopeUrl}
                onChangeText={setEnvelopeUrl}
                placeholder={
                  portalMeta.key === "docusign"
                    ? "https://na4.docusign.net/Signing/..."
                    : `https://${portalMeta.label.toLowerCase().replace(/\s/g, "")}.com/sign/...`
                }
                placeholderTextColor={brand.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.linkInput}
              />
            </View>
            <Text style={styles.helper}>
              Generate this link inside {portalMeta.label} after adding signers and tags. The client
              opens it from their app and signs in their licensed portal — never inside Vance.
            </Text>

            <SharedFields
              category={category}
              setCategory={setCategory}
              name={name}
              setName={setName}
              note={note}
              setNote={setNote}
              labelOffset={3}
              namePlaceholder="e.g. 245 W 72 · Purchase Agreement"
            />

            <TransactionBlock
              transactions={transactions}
              transactionId={transactionId}
              setTransactionId={setTransactionId}
              stage={stage}
              setStage={setStage}
              showNewTx={showNewTx}
              setShowNewTx={setShowNewTx}
              newTxAddress={newTxAddress}
              setNewTxAddress={setNewTxAddress}
              newTxRef={newTxRef}
              setNewTxRef={setNewTxRef}
              onCreateTx={createNewTx}
              labelOffset={4}
            />

            <RecipientsBlock
              clients={clients}
              recipientIds={recipientIds}
              toggleRecipient={toggleRecipient}
              selectAll={selectAll}
              onAddClient={() => router.push("/admin/clients")}
              labelOffset={5}
            />

            <Pressable
              onPress={tap(sendPortal)}
              disabled={!name.trim() || !envelopeUrl.trim() || recipientIds.length === 0}
              style={({ pressed }) => [
                styles.submit,
                (!name.trim() || !envelopeUrl.trim() || recipientIds.length === 0) && {
                  opacity: 0.4,
                },
                pressed && { opacity: 0.9 },
              ]}
            >
              <PenLine size={14} color={INK} strokeWidth={2} />
              <Text style={styles.submitText}>
                Send for signature · {recipientIds.length || 0}{" "}
                {recipientIds.length === 1 ? "client" : "clients"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.composer}>
            <Text style={styles.label}>1 · CHOOSE A FILE</Text>
            <Pressable
              onPress={tap(pick)}
              disabled={picking}
              style={({ pressed }) => [styles.pick, pressed && { opacity: 0.92 }]}
            >
              <View style={styles.pickIcon}>
                <FileText size={18} color={brand.ivory} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickTitle} numberOfLines={1}>
                  {pendingFileName ?? (picking ? "Choosing…" : "Choose a file")}
                </Text>
                <Text style={styles.pickSub} numberOfLines={1}>
                  {pendingUri ? pendingMime ?? "Selected" : "PDF, image, or any file"}
                </Text>
              </View>
              <Plus size={16} color={brand.ivory} strokeWidth={2} />
            </Pressable>
            <Text style={styles.helper}>
              For email-style attachments only. Anything that needs a signature should go through a
              secure portal.
            </Text>

            <SharedFields
              category={category}
              setCategory={setCategory}
              name={name}
              setName={setName}
              note={note}
              setNote={setNote}
              labelOffset={2}
              namePlaceholder="Document name"
            />

            <TransactionBlock
              transactions={transactions}
              transactionId={transactionId}
              setTransactionId={setTransactionId}
              stage={stage}
              setStage={setStage}
              showNewTx={showNewTx}
              setShowNewTx={setShowNewTx}
              newTxAddress={newTxAddress}
              setNewTxAddress={setNewTxAddress}
              newTxRef={newTxRef}
              setNewTxRef={setNewTxRef}
              onCreateTx={createNewTx}
              labelOffset={3}
            />

            <RecipientsBlock
              clients={clients}
              recipientIds={recipientIds}
              toggleRecipient={toggleRecipient}
              selectAll={selectAll}
              onAddClient={() => router.push("/admin/clients")}
              labelOffset={4}
            />

            <Pressable
              onPress={tap(sendFile)}
              disabled={!pendingUri || !name.trim() || recipientIds.length === 0}
              style={({ pressed }) => [
                styles.submit,
                (!pendingUri || !name.trim() || recipientIds.length === 0) && { opacity: 0.4 },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Paperclip size={14} color={INK} strokeWidth={2} />
              <Text style={styles.submitText}>
                Share with {recipientIds.length || 0}{" "}
                {recipientIds.length === 1 ? "client" : "clients"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* History */}
        <Text style={[styles.label, { marginHorizontal: 24, marginTop: 28 }]}>
          SHARED · {items.length}
        </Text>
        <View style={{ paddingHorizontal: 16, gap: 8, marginTop: 12 }}>
          {items.length === 0 && (
            <EmptyState
              Icon={ShieldCheck}
              eyebrow="NOTHING SHARED YET"
              title="Send your first envelope."
              body="Prepare it in DocuSign or Dotloop, then paste the secure link above. Clients sign in their licensed portal — you track Sent, Viewed, Signed in real time."
              accent={ACCENT}
              ctaLabel={mode === "portal" ? "OPEN PORTAL" : "CHOOSE A FILE"}
              onCtaPress={() => {
                if (mode === "portal") void openPortal();
                else void pick();
              }}
            />
          )}
          {items.map((d) => {
            const tx = d.transactionId
              ? transactions.find((t) => t.id === d.transactionId)
              : undefined;
            return (
              <View key={d.id} style={styles.row}>
                <View
                  style={[
                    styles.docIcon,
                    d.kind === "portal" && { backgroundColor: tint(ACCENT, 0.16) },
                  ]}
                >
                  {d.kind === "portal" ? (
                    <PenLine size={16} color={ACCENT} strokeWidth={1.5} />
                  ) : (
                    <FileText size={16} color={brand.ivory} strokeWidth={1.5} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cat} numberOfLines={1}>
                    {(d.kind === "portal" && d.portal
                      ? `${d.portal.toUpperCase()} · ${d.category.toUpperCase()}`
                      : d.category.toUpperCase()) +
                      (d.stage ? ` · ${d.stage.toUpperCase()}` : "")}
                  </Text>
                  <Text style={styles.name} numberOfLines={2}>
                    {d.name}
                  </Text>
                  {tx ? (
                    <View style={styles.metaRow}>
                      <FolderOpen size={10} color={ACCENT} strokeWidth={1.5} />
                      <Text style={[styles.meta, { color: ACCENT }]} numberOfLines={1}>
                        {tx.address}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.metaRow}>
                    <Users size={10} color={brand.muted} strokeWidth={1.5} />
                    <Text style={styles.meta} numberOfLines={1}>
                      {recipientLabel(d)} · {new Date(d.uploadedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {d.kind === "portal" ? (
                    <StatusControls d={d} setStatus={setStatus} />
                  ) : null}
                </View>
                <Pressable onPress={() => confirmDel(d)} style={styles.iconBtn}>
                  <Trash2 size={14} color="#A04A3C" strokeWidth={1.5} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StatusControls({
  d,
  setStatus,
}: {
  d: DocItem;
  setStatus: (id: string, s: DocStatus) => void;
}) {
  const opts: { key: DocStatus; label: string; Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }[] = [
    { key: "awaiting-signature", label: "Sent", Icon: PenLine },
    { key: "viewed", label: "Viewed", Icon: Eye },
    { key: "signed", label: "Signed", Icon: CheckCircle2 },
  ];
  return (
    <View style={styles.statusRow}>
      {opts.map((o, i) => {
        const reached =
          d.status === "signed"
            ? true
            : d.status === "viewed"
            ? i <= 1
            : i === 0;
        const active = d.status === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              setStatus(d.id, o.key);
            }}
            style={[
              styles.statusPill,
              reached && styles.statusPillReached,
              active && styles.statusPillActive,
            ]}
          >
            <o.Icon
              size={9}
              color={active ? INK : reached ? ACCENT : brand.muted}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.statusPillText,
                reached && { color: ACCENT },
                active && { color: INK },
              ]}
            >
              {o.label.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
      {d.status !== "signed" ? (
        <View style={styles.statusHintWrap}>
          <Clock size={9} color={brand.muted} strokeWidth={1.5} />
          <Text style={styles.statusHint}>Tap to sync from portal</Text>
        </View>
      ) : null}
    </View>
  );
}

function TransactionBlock({
  transactions,
  transactionId,
  setTransactionId,
  stage,
  setStage,
  showNewTx,
  setShowNewTx,
  newTxAddress,
  setNewTxAddress,
  newTxRef,
  setNewTxRef,
  onCreateTx,
  labelOffset,
}: {
  transactions: Transaction[];
  transactionId: string | null;
  setTransactionId: (id: string | null) => void;
  stage: DocStage;
  setStage: (s: DocStage) => void;
  showNewTx: boolean;
  setShowNewTx: (b: boolean) => void;
  newTxAddress: string;
  setNewTxAddress: (s: string) => void;
  newTxRef: string;
  setNewTxRef: (s: string) => void;
  onCreateTx: () => void;
  labelOffset: number;
}) {
  const active = transactions.filter((t) => t.status === "active");
  return (
    <View style={{ gap: 10, marginTop: 18 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={styles.label}>{labelOffset} · TRANSACTION & STAGE</Text>
        <Pressable onPress={() => setShowNewTx(!showNewTx)} hitSlop={8}>
          <Text style={styles.selectAll}>{showNewTx ? "CANCEL" : "+ NEW"}</Text>
        </Pressable>
      </View>

      {showNewTx ? (
        <View style={styles.newTxBox}>
          <TextInput
            value={newTxAddress}
            onChangeText={setNewTxAddress}
            placeholder="Property address or title"
            placeholderTextColor={brand.muted}
            style={styles.input}
          />
          <TextInput
            value={newTxRef}
            onChangeText={setNewTxRef}
            placeholder="Reference (MLS, transaction ID) — optional"
            placeholderTextColor={brand.muted}
            style={styles.input}
          />
          <Pressable
            onPress={onCreateTx}
            style={({ pressed }) => [styles.newTxBtn, pressed && { opacity: 0.9 }]}
          >
            <FolderOpen size={12} color={INK} strokeWidth={2} />
            <Text style={styles.newTxBtnText}>OPEN TRANSACTION</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.txList}>
          {active.length === 0 ? (
            <Text style={styles.helper}>
              No active transactions yet. Tap +NEW to open one — folders keep Offer, Disclosures,
              and Closing tidy.
            </Text>
          ) : (
            active.map((t) => {
              const on = transactionId === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTransactionId(t.id)}
                  style={[styles.txChip, on && styles.txChipOn]}
                >
                  <FolderOpen
                    size={12}
                    color={on ? ACCENT : brand.muted}
                    strokeWidth={1.6}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.txChipTitle, on && { color: brand.ivory }]}
                      numberOfLines={1}
                    >
                      {t.address}
                    </Text>
                    {t.reference ? (
                      <Text
                        style={[styles.txChipMeta, on && { color: "rgba(244,239,230,0.6)" }]}
                      >
                        {t.reference}
                      </Text>
                    ) : null}
                  </View>
                  {on ? <Check size={12} color={INK} strokeWidth={2.4} /> : null}
                </Pressable>
              );
            })
          )}
        </View>
      )}

      <Text style={[styles.label, { marginTop: 6 }]}>STAGE</Text>
      <View style={styles.catRow}>
        {STAGES.map((s) => {
          const on = stage === s;
          return (
            <Pressable
              key={s}
              onPress={() => setStage(s)}
              style={[styles.catChip, on && styles.catChipOn]}
            >
              <Text style={[styles.catChipText, on && { color: brand.ivory }]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ModeTab({
  label,
  sub,
  Icon,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeTab,
        active && styles.modeTabOn,
        pressed && !active && { backgroundColor: "rgba(255,255,255,0.05)" },
      ]}
    >
      <Icon size={14} color={active ? ACCENT : brand.muted} strokeWidth={1.6} />
      <Text style={[styles.modeLabel, active && { color: brand.ivory }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.modeSub, active && { color: "rgba(244,239,230,0.6)" }]}
        numberOfLines={1}
      >
        {sub}
      </Text>
    </Pressable>
  );
}

function SharedFields({
  category,
  setCategory,
  name,
  setName,
  note,
  setNote,
  labelOffset,
  namePlaceholder,
}: {
  category: DocCategory;
  setCategory: (c: DocCategory) => void;
  name: string;
  setName: (s: string) => void;
  note: string;
  setNote: (s: string) => void;
  labelOffset: number;
  namePlaceholder: string;
}) {
  return (
    <View style={{ gap: 10, marginTop: 18 }}>
      <Text style={styles.label}>{labelOffset} · NAME & CATEGORY</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={namePlaceholder}
        placeholderTextColor={brand.muted}
        style={styles.input}
      />
      <View style={styles.catRow}>
        {CATS.map((c) => {
          const on = category === c;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.catChip, on && styles.catChipOn]}
            >
              <Text style={[styles.catChipText, on && { color: brand.ivory }]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="Optional — a one-line note for the client."
        placeholderTextColor={brand.muted}
        style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
      />
    </View>
  );
}

function RecipientsBlock({
  clients,
  recipientIds,
  toggleRecipient,
  selectAll,
  onAddClient,
  labelOffset,
}: {
  clients: { id: string; name: string; email: string; tag?: string }[];
  recipientIds: string[];
  toggleRecipient: (id: string) => void;
  selectAll: () => void;
  onAddClient: () => void;
  labelOffset: number;
}) {
  return (
    <View style={{ gap: 10, marginTop: 18 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={styles.label}>{labelOffset} · RECIPIENTS</Text>
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
          style={({ pressed }) => [styles.noClients, pressed && { opacity: 0.92 }]}
        >
          <UserPlus size={16} color={ACCENT} strokeWidth={1.6} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noClientsTitle}>No clients on your roster yet</Text>
            <Text style={styles.noClientsSub}>Add one to send anything · tap to manage</Text>
          </View>
          <Plus size={14} color={ACCENT} strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={{ gap: 6 }}>
          {clients.map((c) => {
            const on = recipientIds.includes(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => toggleRecipient(c.id)}
                style={({ pressed }) => [
                  styles.recipient,
                  on && styles.recipientOn,
                  pressed && !on && { backgroundColor: "rgba(255,255,255,0.05)" },
                ]}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Check size={12} color={brand.ivory} strokeWidth={2.4} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recipientName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.recipientMeta} numberOfLines={1}>
                    {c.tag ? `${c.tag} · ` : ""}
                    {c.email}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={onAddClient} style={styles.addClientRow} hitSlop={6}>
            <Plus size={12} color={brand.muted} strokeWidth={1.8} />
            <Text style={styles.addClientText}>MANAGE CLIENT ROSTER</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0D0C" },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
    gap: 4,
  },
  modeTabOn: {
    backgroundColor: tint(ACCENT, 0.14),
    borderColor: tint(ACCENT, 0.5),
  },
  modeLabel: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14, marginTop: 4 },
  modeSub: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  composer: {
    marginHorizontal: 16,
    padding: 18,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  label: { fontFamily: fonts.sansMedium, color: ACCENT, fontSize: 10, letterSpacing: 3 },
  helper: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  portalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  portalChip: {
    width: "48.7%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  portalChipOn: { backgroundColor: tint(ACCENT, 0.16), borderColor: tint(ACCENT, 0.6) },
  portalLabel: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  portalHint: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 10, marginTop: 2 },
  portalOpen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: tint(ACCENT, 0.5),
    backgroundColor: tint(ACCENT, 0.12),
  },
  portalOpenText: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  linkInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: LINE,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginTop: 8,
  },
  linkInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    color: brand.ivory,
    fontSize: 13,
  },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
    backgroundColor: tint(ACCENT, 0.12),
    marginTop: 10,
  },
  pickIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.5),
    alignItems: "center",
    justifyContent: "center",
  },
  pickTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 15 },
  pickSub: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.7)", fontSize: 11, marginTop: 2 },
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
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
  },
  catChipOn: { backgroundColor: tint(ACCENT, 0.18), borderColor: tint(ACCENT, 0.55) },
  catChipText: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 12 },
  selectAll: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  recipient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  recipientOn: { borderColor: tint(ACCENT, 0.55), backgroundColor: tint(ACCENT, 0.1) },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.2,
    borderColor: "rgba(244,239,230,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  recipientName: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  recipientMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 2 },
  noClients: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: tint(ACCENT, 0.1),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
  },
  noClientsTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  noClientsSub: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.7)", fontSize: 11, marginTop: 2 },
  addClientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
    marginTop: 2,
  },
  addClientText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 18,
  },
  submitText: { fontFamily: fonts.sansSemi, color: INK, fontSize: 12, letterSpacing: 1.4 },
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
  docIcon: {
    width: 38,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.3),
    backgroundColor: tint(ACCENT, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  cat: { fontFamily: fonts.sansMedium, color: ACCENT, fontSize: 9, letterSpacing: 2 },
  name: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  meta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, flex: 1 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: LINE,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  statusPillReached: {
    borderColor: tint(ACCENT, 0.6),
    backgroundColor: tint(ACCENT, 0.12),
  },
  statusPillActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  statusPillText: {
    fontFamily: fonts.sansSemi,
    color: brand.textOnDarkMuted,
    fontSize: 8.5,
    letterSpacing: 1.2,
  },
  statusHintWrap: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 2 },
  statusHint: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 9.5,
    letterSpacing: 0.2,
  },
  txList: { gap: 6 },
  txChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  txChipOn: { backgroundColor: tint(ACCENT, 0.14), borderColor: tint(ACCENT, 0.55) },
  txChipTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  txChipMeta: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 10,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  newTxBox: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: tint(ACCENT, 0.4),
    backgroundColor: SURFACE_HI,
  },
  newTxBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  newTxBtnText: {
    fontFamily: fonts.sansSemi,
    color: INK,
    fontSize: 11,
    letterSpacing: 1.4,
  },
});
