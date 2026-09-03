import React from "react";
import { Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowRight } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";
import { useEditMode } from "@/contexts/EditModeContext";
import EditableText from "./EditableText";
import SectionLabel from "./SectionLabel";

export default React.memo(function PersonalNote() {
  const router = useRouter();
  const { brand: b, theme } = useBrand();
  const { editing, setNote, setNoteBody, previewBrand } = useEditMode();
  const personalNote = previewBrand.note;
  const realtor = previewBrand.realtor;
  const open = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push("/note");
  };
  const filled = (s: string | undefined): boolean => (s ?? "").trim().length > 0;

  return (
    <View style={styles.section}>
      <SectionLabel
        eyebrow="A note from me"
        title={filled(personalNote.title) ? personalNote.title : "A note from me."}
      />
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface.panel, borderColor: theme.surface.hairline },
        ]}
      >
        {/* An undated note is fine; a hairline rule attached to nothing is not. */}
        {filled(personalNote.date) ? (
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: theme.accent.deep }]}>
              {personalNote.date.toUpperCase()}
            </Text>
            <View style={[styles.rule, { backgroundColor: theme.surface.hairline }]} />
          </View>
        ) : null}
        {personalNote.body[0] || editing ? (
          <EditableText
            editing={editing}
            value={personalNote.body[0] ?? ""}
            onSave={(v) => setNoteBody(0, v)}
            label="Note — first paragraph"
            multiline
            style={[styles.body, { fontFamily: theme.displayItalic }]}
          />
        ) : null}
        {personalNote.body[1] || editing ? (
          <View style={{ marginTop: 14 }}>
            <EditableText
              editing={editing}
              value={personalNote.body[1] ?? ""}
              onSave={(v) => setNoteBody(1, v)}
              label="Note — second paragraph"
              multiline
              style={[styles.body, { fontFamily: theme.displayItalic }]}
            />
          </View>
        ) : null}
        <View style={styles.signoff}>
          {filled(personalNote.signoff) || editing ? (
            <EditableText
              editing={editing}
              value={personalNote.signoff}
              onSave={(v) => setNote({ signoff: v })}
              label="Sign-off"
              style={[styles.signoffLabel, { fontFamily: theme.displayItalic }]}
            />
          ) : null}
          {b.signatureUrl ? (
            <Image source={{ uri: b.signatureUrl }} style={styles.signature} contentFit="contain" />
          ) : null}
          {filled(realtor.name) ? <Text style={styles.signedName}>{realtor.name}</Text> : null}
        </View>
        <Pressable onPress={open} style={[styles.readMore, { borderTopColor: theme.surface.hairline }]}>
          <Text style={[styles.readMoreText, { color: theme.band.base }]}>Read the full note</Text>
          <ArrowRight size={14} color={theme.band.base} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingTop: 52 },
  card: {
    marginHorizontal: 24,
    backgroundColor: brand.paper,
    borderWidth: 1,
    borderColor: brand.hairline,
    padding: 26,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  dateLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 10,
    letterSpacing: 3,
  },
  rule: { flex: 1, height: 1, backgroundColor: brand.hairline },
  body: {
    fontFamily: fonts.serifItalic,
    color: brand.ink,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0.1,
  },
  signoff: { marginTop: 22 },
  signoffLabel: {
    fontFamily: fonts.serifItalic,
    color: brand.muted,
    fontSize: 14,
  },
  signature: { width: 180, height: 56, marginTop: -6, marginLeft: -6 },
  signedName: {
    fontFamily: fonts.sansMedium,
    color: brand.ink,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 2,
  },
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: brand.hairline,
  },
  readMoreText: {
    fontFamily: fonts.sansMedium,
    color: brand.forest,
    fontSize: 12,
    letterSpacing: 2,
  },
});
