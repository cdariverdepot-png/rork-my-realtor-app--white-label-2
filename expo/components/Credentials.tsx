import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { brand, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";
import { hasCredentials } from "@/lib/credentials";
export { hasCredentials } from "@/lib/credentials";
import SectionLabel from "./SectionLabel";

/** True when there is at least one fact worth showing a client. */

/**
 * Proof-by-qualification, sitting between the personal note (the emotional
 * pitch) and the testimonials (proof by others).
 *
 * The realtor supplies structured facts only — the theme decides how they are
 * presented, so the same record reads as an engraved plate in a classic look
 * and a spare small-caps row in a structural one. Nothing here is a badge or a
 * verification mark: these are the realtor's own stated qualifications.
 */
export default React.memo(function Credentials() {
  const { brand: b, theme } = useBrand();
  const c = b.credentials;

  const rows = useMemo(() => {
    const out: { label: string; value: string; detail?: string }[] = [];
    c.education.forEach((e) => {
      if (!e.institution && !e.credential) return;
      out.push({
        label: e.year,
        value: e.credential || e.institution,
        detail: e.credential && e.institution ? e.institution : undefined,
      });
    });
    c.awards.forEach((a) => {
      if (!a.title) return;
      out.push({ label: a.year, value: a.title, detail: a.issuer || undefined });
    });
    return out;
  }, [c.education, c.awards]);

  if (!hasCredentials(c)) return null;

  const layout = theme.credentials;
  const inline = layout === "inline";
  const centered = layout === "plate";

  const align = centered ? ("center" as const) : ("flex-start" as const);
  const textAlign = centered ? ("center" as const) : ("left" as const);

  return (
    <View style={styles.section}>
      <SectionLabel
        eyebrow={c.eyebrow.trim() || "Background"}
        title={c.title.trim() || "Credentials & training."}
      />

      <View
        style={[
          styles.card,
          centered && styles.cardPlate,
          { backgroundColor: theme.surface.panel, borderColor: theme.surface.hairline },
        ]}
      >
        {/* Designations — the marks that carry the most weight, so they lead. */}
        {c.designations.length > 0 ? (
          <View style={[styles.marks, { alignItems: align }]}>
            <View style={[styles.markRow, centered && styles.markRowCentered]}>
              {c.designations.map((d) => (
                <View
                  key={d.code + d.mark}
                  style={[styles.markChip, { borderColor: theme.accent.base }]}
                >
                  <Text style={[styles.markText, { color: theme.accent.deep }]}>{d.mark}</Text>
                </View>
              ))}
            </View>
            {!inline ? (
              <View style={{ alignSelf: "stretch", marginTop: 12 }}>
                {c.designations.map((d) => (
                  <Text
                    key={`n-${d.code}-${d.name}`}
                    style={[styles.markName, { textAlign }]}
                  >
                    {d.name}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Education and awards share one engraved ledger — same shape, same rhythm. */}
        {rows.length > 0 ? (
          <View style={[styles.ledger, { borderTopColor: theme.surface.hairline }]}>
            {rows.map((r, i) => (
              <View
                key={`${r.value}-${i}`}
                style={[
                  styles.ledgerRow,
                  centered && styles.ledgerRowCentered,
                  i > 0 && { borderTopWidth: 1, borderTopColor: theme.surface.hairline },
                ]}
              >
                {r.label && !centered ? (
                  <Text style={[styles.year, { color: theme.accent.deep }]}>{r.label}</Text>
                ) : null}
                <View style={{ flex: centered ? 0 : 1 }}>
                  <Text
                    style={[styles.rowValue, { fontFamily: theme.display, textAlign }]}
                  >
                    {r.value}
                  </Text>
                  {r.detail ? (
                    <Text style={[styles.rowDetail, { textAlign }]}>
                      {centered && r.label ? `${r.detail} · ${r.label}` : r.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {c.memberships.length > 0 ? (
          <View style={[styles.tail, { borderTopColor: theme.surface.hairline }]}>
            <Text style={[styles.tailLabel, { color: theme.accent.deep, textAlign }]}>MEMBER OF</Text>
            {c.memberships.map((m) => (
              <Text key={m} style={[styles.tailValue, { textAlign }]}>
                {m}
              </Text>
            ))}
          </View>
        ) : null}

        {c.languages.length > 0 ? (
          <View style={[styles.tail, { borderTopColor: theme.surface.hairline }]}>
            <Text style={[styles.tailLabel, { color: theme.accent.deep, textAlign }]}>SPEAKS</Text>
            <Text style={[styles.tailValue, { textAlign }]}>{c.languages.join(" · ")}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingVertical: 34 },
  card: {
    marginHorizontal: 24,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 22,
  },
  cardPlate: { alignItems: "center" },
  marks: { alignSelf: "stretch" },
  markRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  markRowCentered: { justifyContent: "center" },
  markChip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  markText: {
    fontFamily: fonts.sansSemi,
    fontSize: 10.5,
    letterSpacing: 1.8,
  },
  markName: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  ledger: { alignSelf: "stretch", marginTop: 20, borderTopWidth: 1, paddingTop: 4 },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 13,
  },
  ledgerRowCentered: { flexDirection: "column", alignItems: "center", gap: 4 },
  year: {
    fontFamily: fonts.sansSemi,
    fontSize: 11,
    letterSpacing: 1.4,
    width: 42,
    marginTop: 3,
  },
  rowValue: { color: brand.ink, fontSize: 17, lineHeight: 23 },
  rowDetail: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 12,
    marginTop: 3,
  },
  tail: { alignSelf: "stretch", marginTop: 16, borderTopWidth: 1, paddingTop: 14 },
  tailLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 9.5,
    letterSpacing: 2,
    marginBottom: 7,
  },
  tailValue: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 12.5,
    lineHeight: 20,
  },
});
