import React, { useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  FileText,
  FolderOpen,
  Lock,
  PenLine,
  Send,
  ShieldCheck,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import {
  STAGES,
  useDocuments,
  type DocItem,
  type DocPortal,
  type DocStage,
  type Transaction,
} from "@/contexts/DocumentsContext";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";

const ACCENT = SCREEN_ACCENT.documents;

function fmtSize(bytes?: number): string {
  if (!bytes) return "PDF";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PORTAL_LABEL: Record<DocPortal, string> = {
  docusign: "DocuSign",
  dotloop: "Dotloop",
  skyslope: "SkySlope",
  authentisign: "Authentisign",
  adobesign: "Adobe Acrobat Sign",
  hellosign: "Dropbox Sign",
  other: "Secure portal",
};

function statusCopy(d: DocItem): { label: string; color: string; Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> } {
  switch (d.status) {
    case "signed":
      return { label: "SIGNED", color: "#3F7A4E", Icon: CheckCircle2 };
    case "viewed":
      return { label: "OPENED", color: brand.goldDeep, Icon: Clock };
    case "awaiting-signature":
      return { label: "AWAITING SIGNATURE", color: brand.gold, Icon: PenLine };
    default:
      return { label: "SHARED", color: brand.muted, Icon: FileText };
  }
}

/** Compact 3-step timeline: Sent → Viewed → Signed. */
function StatusTimeline({ d }: { d: DocItem }) {
  const sentAt = d.sentAt ?? d.uploadedAt;
  const viewedAt = d.viewedAt;
  const signedAt = d.signedAt;
  const steps: { key: string; label: string; at?: number; done: boolean }[] = [
    { key: "sent", label: "Sent", at: sentAt, done: !!sentAt },
    {
      key: "viewed",
      label: "Opened",
      at: viewedAt,
      done: !!viewedAt || d.status === "signed",
    },
    { key: "signed", label: "Signed", at: signedAt, done: !!signedAt },
  ];
  return (
    <View style={styles.timeline}>
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <View style={styles.tlStep}>
            <View
              style={[
                styles.tlDot,
                s.done && { backgroundColor: brand.gold, borderColor: brand.gold },
              ]}
            />
            <Text style={[styles.tlLabel, s.done && { color: brand.ivory }]}>{s.label}</Text>
            <Text style={styles.tlTime}>{s.at ? fmtTime(s.at).split(",")[0] : "—"}</Text>
          </View>
          {i < steps.length - 1 ? (
            <View style={[styles.tlBar, steps[i + 1].done && { backgroundColor: brand.gold }]} />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

export default function DocumentsScreen() {
  const { items, transactions, markViewed } = useDocuments();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleFolder = (id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setCollapsed((p) => ({ ...p, [id]: !p[id] }));
  };

  const open = async (d: DocItem) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (d.kind === "portal") markViewed(d.id);
    try {
      if (d.uri.startsWith("http")) {
        await WebBrowser.openBrowserAsync(d.uri);
      } else {
        await Linking.openURL(d.uri);
      }
    } catch (e) {
      Alert.alert("Couldn't open", "This document could not be opened on this device.");
      console.log("[docs] open", e);
    }
  };

  const { txGroups, looseEnvelopes, looseFiles } = useMemo(() => {
    const byTx = new Map<string, DocItem[]>();
    const loose: DocItem[] = [];
    for (const d of items) {
      if (d.transactionId) {
        const arr = byTx.get(d.transactionId) ?? [];
        arr.push(d);
        byTx.set(d.transactionId, arr);
      } else {
        loose.push(d);
      }
    }
    const txGroups = transactions
      .filter((t) => byTx.has(t.id))
      .sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"))
      .map((t) => ({ tx: t, docs: byTx.get(t.id) ?? [] }));
    return {
      txGroups,
      looseEnvelopes: loose.filter((d) => d.kind === "portal"),
      looseFiles: loose.filter((d) => d.kind !== "portal"),
    };
  }, [items, transactions]);

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="documents" intensity="deep" />
      <ModalChrome eyebrow="Your documents" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Reveal delay={40}>
          <Text style={styles.intro}>
            Filed by transaction. Sign securely through the same platforms your closing team uses.
          </Text>
        </Reveal>

        {/* Transaction folders */}
        <Reveal delay={120}>
        <View>
        {txGroups.map(({ tx, docs }) => {
          const isClosed = collapsed[tx.id] ?? tx.status === "closed";
          return (
            <TransactionFolder
              key={tx.id}
              tx={tx}
              docs={docs}
              collapsed={isClosed}
              onToggle={() => toggleFolder(tx.id)}
              onOpen={open}
            />
          );
        })}
        </View>
        </Reveal>

        {/* Loose envelopes (no transaction) */}
        {looseEnvelopes.length > 0 ? (
          <Reveal delay={200}>
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>SECURE SIGNING</Text>
              <View style={styles.secureBadge}>
                <ShieldCheck size={11} color={brand.goldLight} strokeWidth={1.6} />
                <Text style={styles.secureText}>ENCRYPTED · INDUSTRY STANDARD</Text>
              </View>
            </View>
            <View style={styles.envelopeList}>
              {looseEnvelopes.map((d) => (
                <EnvelopeCard key={d.id} d={d} onOpen={() => open(d)} />
              ))}
            </View>
          </>
          </Reveal>
        ) : null}

        {/* Empty state if nothing at all */}
        {txGroups.length === 0 && looseEnvelopes.length === 0 ? (
          <View style={styles.emptyEnvelope}>
            <Lock size={18} color={brand.gold} strokeWidth={1.5} />
            <Text style={styles.emptyEnvTitle}>Nothing to sign right now.</Text>
            <Text style={styles.emptyEnvSub}>
              When a contract or disclosure is ready, you&apos;ll see it filed by transaction here.
            </Text>
          </View>
        ) : null}

        {looseFiles.length > 0 ? (
          <Reveal delay={260}>
          <>
            <View style={styles.divider} />
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>ATTACHMENTS</Text>
              <Text style={styles.sectionHint}>Reference files · no signature</Text>
            </View>
            <View style={styles.list}>
              {looseFiles.map((d) => (
                <FileRow key={d.id} d={d} onOpen={() => open(d)} />
              ))}
            </View>
          </>
          </Reveal>
        ) : null}

        <Reveal delay={320}>
        <View style={styles.privacyCard}>
          <ShieldCheck size={16} color={brand.goldLight} strokeWidth={1.5} />
          <Text style={styles.privacyText}>
            Signing happens inside your realtor&apos;s licensed e-signature portal — eIDAS / ESIGN
            compliant, audit-trailed, and never copied to this app.
          </Text>
        </View>
        </Reveal>
      </ScrollView>
    </View>
  );
}

function TransactionFolder({
  tx,
  docs,
  collapsed,
  onToggle,
  onOpen,
}: {
  tx: Transaction;
  docs: DocItem[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (d: DocItem) => void;
}) {
  const counts = useMemo(() => {
    const c: Record<DocStage, number> = {
      "Pre-Listing": 0,
      Offer: 0,
      Disclosures: 0,
      Closing: 0,
    };
    for (const d of docs) if (d.stage) c[d.stage] += 1;
    return c;
  }, [docs]);

  const signedCount = docs.filter((d) => d.status === "signed").length;
  const total = docs.filter((d) => d.kind === "portal").length;

  const stagesWithDocs = STAGES.filter((s) => counts[s] > 0);

  return (
    <View style={styles.folder}>
      <PressableScale
        onPress={onToggle}
        haptic="selection"
        scaleTo={0.99}
        style={styles.folderHead}
      >
        <View style={styles.folderIcon}>
          <FolderOpen size={16} color={brand.goldLight} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.folderEyebrow}>
            {tx.status === "closed" ? "CLOSED · " : "ACTIVE · "}
            {tx.reference ?? `OPENED ${fmtDate(tx.createdAt).toUpperCase()}`}
          </Text>
          <Text style={styles.folderTitle} numberOfLines={1}>
            {tx.address}
          </Text>
          <Text style={styles.folderMeta}>
            {total > 0
              ? `${signedCount} of ${total} signed · ${docs.length} document${docs.length === 1 ? "" : "s"}`
              : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
          </Text>
        </View>
        {collapsed ? (
          <ChevronDown size={16} color={brand.goldLight} strokeWidth={1.5} />
        ) : (
          <ChevronUp size={16} color={brand.goldLight} strokeWidth={1.5} />
        )}
      </PressableScale>

      {!collapsed ? (
        <View style={styles.folderBody}>
          {stagesWithDocs.map((stage) => (
            <View key={stage} style={styles.stageBlock}>
              <View style={styles.stageHead}>
                <Text style={styles.stageLabel}>{stage.toUpperCase()}</Text>
                <View style={styles.stageRule} />
                <Text style={styles.stageCount}>{counts[stage]}</Text>
              </View>
              {docs
                .filter((d) => d.stage === stage)
                .sort((a, b) => (b.sentAt ?? b.uploadedAt) - (a.sentAt ?? a.uploadedAt))
                .map((d) =>
                  d.kind === "portal" ? (
                    <EnvelopeCard key={d.id} d={d} onOpen={() => onOpen(d)} compact />
                  ) : (
                    <View key={d.id} style={{ marginTop: 8 }}>
                      <FileRow d={d} onOpen={() => onOpen(d)} />
                    </View>
                  )
                )}
            </View>
          ))}

          {/* Files inside transaction with no stage */}
          {docs
            .filter((d) => !d.stage && d.kind !== "portal")
            .map((d) => (
              <View key={d.id} style={{ marginTop: 8 }}>
                <FileRow d={d} onOpen={() => onOpen(d)} />
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

function EnvelopeCard({
  d,
  onOpen,
  compact,
}: {
  d: DocItem;
  onOpen: () => void;
  compact?: boolean;
}) {
  const s = statusCopy(d);
  return (
    <PressableScale
      onPress={onOpen}
      haptic="medium"
      scaleTo={0.985}
      style={[styles.envelope, compact ? { padding: 14, marginTop: 8 } : null]}
    >
      <View style={styles.envHeader}>
        <View style={styles.portalBadge}>
          <Text style={styles.portalBadgeText}>
            {(d.portal ? PORTAL_LABEL[d.portal] : "Secure portal").toUpperCase()}
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: s.color }]}>
          <s.Icon size={10} color={s.color} strokeWidth={1.8} />
          <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>

      <Text style={styles.envCat}>{d.category.toUpperCase()}</Text>
      <Text style={styles.envName} numberOfLines={2}>
        {d.name}
      </Text>
      {d.note ? <Text style={styles.envNote}>{d.note}</Text> : null}

      <StatusTimeline d={d} />

      <View style={styles.envFooter}>
        <View style={styles.envMetaRow}>
          <Send size={10} color="rgba(244,239,230,0.55)" strokeWidth={1.6} />
          <Text style={styles.envMeta}>Sent {fmtDate(d.sentAt ?? d.uploadedAt)}</Text>
        </View>
        <View style={styles.openCta}>
          <PenLine size={13} color={dark.gold} strokeWidth={1.8} />
          <Text style={styles.openCtaText}>
            {d.status === "signed" ? "VIEW" : "OPEN & SIGN"}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

function FileRow({ d, onOpen }: { d: DocItem; onOpen: () => void }) {
  return (
    <PressableScale
      onPress={onOpen}
      haptic="selection"
      scaleTo={0.99}
      style={styles.row}
    >
      <View style={styles.docIcon}>
        <FileText size={18} color={brand.ivory} strokeWidth={1.5} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cat}>{d.category.toUpperCase()}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {d.name}
        </Text>
        {d.note ? <Text style={styles.note}>{d.note}</Text> : null}
        <Text style={styles.meta}>
          {fmtSize(d.size)} · {fmtDate(d.uploadedAt)}
        </Text>
      </View>
      <ChevronRight size={16} color={dark.textDim} strokeWidth={1.5} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  intro: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 14,
    lineHeight: 19,
    marginHorizontal: 24,
    marginBottom: 18,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
  },
  sectionHint: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  secureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.4),
    backgroundColor: tint(ACCENT, 0.12),
    borderRadius: 999,
  },
  secureText: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 8.5,
    letterSpacing: 1.2,
  },
  envelopeList: { paddingHorizontal: 16, gap: 10 },
  envelope: {
    backgroundColor: "rgba(14,16,15,0.76)",
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.28),
    borderRadius: 16,
    padding: 18,
  },
  envHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  portalBadge: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: tint(ACCENT, 0.14),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.4),
    borderRadius: 999,
  },
  portalBadgeText: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderRadius: 999,
  },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 8.5, letterSpacing: 1.2 },
  envCat: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 2,
  },
  envName: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 18,
    letterSpacing: -0.3,
    marginTop: 5,
    lineHeight: 22,
  },
  envNote: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 17,
  },
  timeline: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(244,239,230,0.12)",
  },
  tlStep: { alignItems: "flex-start", flex: 0, minWidth: 70 },
  tlDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.35)",
    backgroundColor: "transparent",
    marginBottom: 5,
  },
  tlLabel: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.55)",
    fontSize: 9,
    letterSpacing: 1.4,
  },
  tlTime: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.45)",
    fontSize: 9.5,
    marginTop: 2,
  },
  tlBar: {
    height: 1,
    flex: 1,
    backgroundColor: "rgba(244,239,230,0.18)",
    marginTop: 4,
    marginHorizontal: 4,
  },
  envFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  envMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  envMeta: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 11,
    letterSpacing: 0.4,
  },
  openCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  openCtaText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  emptyEnvelope: {
    marginHorizontal: 16,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.28),
    backgroundColor: "rgba(14,16,15,0.7)",
    borderRadius: 16,
  },
  divider: {
    height: 1,
    backgroundColor: dark.border,
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 16,
  },
  empty: {
    marginHorizontal: 16,
    padding: 26,
    backgroundColor: "rgba(14,16,15,0.72)",
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    alignItems: "center",
    gap: 8,
  },
  emptyEnvTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: dark.text,
    marginTop: 4,
  },
  emptyEnvSub: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 6,
  },
  list: { paddingHorizontal: 16, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.72)",
    borderRadius: 14,
  },
  docIcon: {
    width: 44,
    height: 56,
    backgroundColor: tint(ACCENT, 0.12),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cat: { fontFamily: fonts.sansMedium, color: ACCENT, fontSize: 9, letterSpacing: 2 },
  name: { fontFamily: fonts.serif, color: dark.text, fontSize: 16, marginTop: 4, letterSpacing: -0.2 },
  note: { fontFamily: fonts.serifItalic, color: dark.textMuted, fontSize: 12, marginTop: 4 },
  meta: { fontFamily: fonts.sans, color: dark.textDim, fontSize: 11, marginTop: 6 },
  privacyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 24,
    padding: 16,
    backgroundColor: "rgba(14,16,15,0.72)",
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 14,
  },
  privacyText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.85)",
    fontSize: 12,
    lineHeight: 18,
  },
  folder: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.72)",
    borderRadius: 16,
    overflow: "hidden",
  },
  folderHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  folderIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.4),
    backgroundColor: tint(ACCENT, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  folderEyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  folderTitle: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 16,
    letterSpacing: -0.2,
    marginTop: 3,
  },
  folderMeta: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  folderBody: { padding: 14, gap: 4 },
  stageBlock: { marginTop: 6 },
  stageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  stageLabel: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 9.5,
    letterSpacing: 2.2,
  },
  stageRule: { flex: 1, height: 1, backgroundColor: dark.border },
  stageCount: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 10,
    letterSpacing: 0.4,
  },
});
