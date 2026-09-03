import React, { useMemo, useState, useCallback } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import type { CatalogueOption } from "@/constants/catalogues";

/**
 * Shared picker used across Brand Studio for facts that come from a known
 * vocabulary (states, years, degrees, brokerages, languages, memberships).
 *
 * Deliberately NOT used for anything in the realtor's own voice — taglines,
 * headlines, notes and quotes stay free text, because a dropdown of pre-written
 * copy would make every white-label instance sound identical.
 *
 * Presents as a bottom sheet rather than a web-style select, and reveals a
 * search field once the list is long enough to scroll.
 */

const SEARCH_THRESHOLD = 12;

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: CatalogueOption[];
  /** Values currently selected — one entry for single-select. */
  selected: string[];
  onPick: (value: string) => void;
  multiple?: boolean;
  allowCustom?: boolean;
  customHint?: string;
};

function tap(): void {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

function PickerSheet({
  visible,
  onClose,
  title,
  options,
  selected,
  onPick,
  multiple,
  allowCustom,
  customHint,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>("");
  const searchable = options.length >= SEARCH_THRESHOLD;

  const filtered = useMemo<CatalogueOption[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const exactExists = useMemo<boolean>(() => {
    const q = query.trim().toLowerCase();
    return options.some((o) => o.label.toLowerCase() === q || o.value.toLowerCase() === q);
  }, [options, query]);

  const close = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  const choose = useCallback(
    (value: string) => {
      tap();
      onPick(value);
      if (!multiple) close();
      else setQuery("");
    },
    [multiple, onPick, close]
  );

  const custom = query.trim();
  const showCustom = Boolean(allowCustom) && custom.length > 0 && !exactExists;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={sheet.backdrop} onPress={close} />
      <View style={[sheet.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={sheet.grabber} />
        <View style={sheet.head}>
          <Text style={sheet.title}>{title}</Text>
          <Pressable
            onPress={close}
            hitSlop={12}
            style={({ pressed }) => [sheet.close, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Close"
          >
            <X size={16} color={brand.textOnDarkMuted} strokeWidth={2} />
          </Pressable>
        </View>

        {searchable || allowCustom ? (
          <View style={sheet.searchRow}>
            <Search size={14} color={brand.textOnDarkDim} strokeWidth={1.8} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={allowCustom ? "Search, or type your own" : "Search"}
              placeholderTextColor={brand.textOnDarkDim}
              style={sheet.searchInput}
              autoCorrect={false}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <X size={13} color={brand.textOnDarkDim} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showCustom ? (
          <Pressable
            onPress={() => choose(custom)}
            style={({ pressed }) => [sheet.customRow, pressed && { opacity: 0.85 }]}
          >
            <Plus size={14} color={brand.goldLight} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={sheet.customText}>Use &ldquo;{custom}&rdquo;</Text>
              {customHint ? <Text style={sheet.optionSub}>{customHint}</Text> : null}
            </View>
          </Pressable>
        ) : null}

        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          style={sheet.list}
          renderItem={({ item }) => {
            const on = selected.includes(item.value);
            return (
              <Pressable
                onPress={() => choose(item.value)}
                style={({ pressed }) => [
                  sheet.option,
                  on && sheet.optionOn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[sheet.optionLabel, on && { color: brand.goldLight }]}>
                    {item.label}
                  </Text>
                  {item.sub ? <Text style={sheet.optionSub}>{item.sub}</Text> : null}
                </View>
                {on ? <Check size={15} color={brand.goldLight} strokeWidth={2.2} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={sheet.empty}>
              {allowCustom ? "Nothing matches — type it above to add your own." : "Nothing matches."}
            </Text>
          }
        />

        {multiple ? (
          <Pressable
            onPress={close}
            style={({ pressed }) => [sheet.done, pressed && { opacity: 0.85 }]}
          >
            <Text style={sheet.doneText}>DONE</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

/* ------------------------------- Single ------------------------------- */

export function PickerField({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  small,
  allowCustom,
  customHint,
  sheetTitle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: CatalogueOption[];
  placeholder?: string;
  hint?: string;
  small?: boolean;
  /** Lets the realtor type a value that isn't in the list. */
  allowCustom?: boolean;
  customHint?: string;
  sheetTitle?: string;
}) {
  const [open, setOpen] = useState<boolean>(false);

  const display = useMemo<string>(() => {
    if (!value) return "";
    const hit = options.find((o) => o.value === value);
    return hit?.label ?? value;
  }, [options, value]);

  return (
    <View style={[field.wrap, small && { flex: 1 }]}>
      <Text style={field.label}>{label}</Text>
      <Pressable
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={({ pressed }) => [field.control, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${display || "Not set"}`}
      >
        <Text
          style={[field.value, !display && { color: brand.textOnDarkDim }]}
          numberOfLines={1}
        >
          {display || placeholder || "Choose"}
        </Text>
        <ChevronDown size={15} color={brand.textOnDarkMuted} strokeWidth={1.8} />
      </Pressable>
      {hint ? <Text style={field.hint}>{hint}</Text> : null}

      <PickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label}
        options={options}
        selected={value ? [value] : []}
        onPick={onChange}
        allowCustom={allowCustom}
        customHint={customHint}
      />
    </View>
  );
}

/* -------------------------------- Multi -------------------------------- */

export function MultiPickerField({
  label,
  values,
  onChange,
  options,
  emptyText,
  hint,
  allowCustom,
  customHint,
  sheetTitle,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: CatalogueOption[];
  emptyText?: string;
  hint?: string;
  allowCustom?: boolean;
  customHint?: string;
  sheetTitle?: string;
}) {
  const [open, setOpen] = useState<boolean>(false);

  const toggle = useCallback(
    (v: string) => {
      onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
    },
    [values, onChange]
  );

  const labelFor = useCallback(
    (v: string) => options.find((o) => o.value === v)?.label ?? v,
    [options]
  );

  return (
    <View style={field.wrap}>
      <Text style={field.label}>{label}</Text>

      {values.length > 0 ? (
        <View style={field.chips}>
          {values.map((v) => (
            <Pressable
              key={v}
              onPress={() => {
                tap();
                toggle(v);
              }}
              style={({ pressed }) => [field.chip, pressed && { opacity: 0.8 }]}
              accessibilityLabel={`Remove ${labelFor(v)}`}
            >
              <Text style={field.chipText}>{labelFor(v)}</Text>
              <X size={11} color={brand.goldLight} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={({ pressed }) => [field.addChip, pressed && { opacity: 0.85 }]}
      >
        <Plus size={13} color={brand.goldLight} strokeWidth={2} />
        <Text style={field.addChipText}>
          {values.length > 0 ? "ADD MORE" : (emptyText ?? "CHOOSE")}
        </Text>
      </Pressable>

      {hint ? <Text style={field.hint}>{hint}</Text> : null}

      <PickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label}
        options={options}
        selected={values}
        onPick={toggle}
        multiple
        allowCustom={allowCustom}
        customHint={customHint}
      />
    </View>
  );
}

const field = StyleSheet.create({
  wrap: { paddingHorizontal: 24, marginTop: 18 },
  label: {
    fontFamily: fonts.sansSemi,
    color: brand.textOnDarkMuted,
    fontSize: 9.5,
    letterSpacing: 2,
    marginBottom: 9,
  },
  control: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
  },
  value: { flex: 1, fontFamily: fonts.sans, color: brand.textOnDark, fontSize: 14 },
  hint: { fontFamily: fonts.sans, color: brand.textOnDarkDim, fontSize: 11, marginTop: 7 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.42)",
    backgroundColor: "rgba(210,163,67,0.08)",
  },
  chipText: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 11.5 },
  addChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
  },
  addChipText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 1.8,
  },
});

const sheet = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,5,7,0.72)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "78%",
    backgroundColor: brand.night,
    borderTopWidth: 1,
    borderTopColor: brand.nightLine,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(241,236,226,0.22)",
    marginTop: 10,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.textOnDark,
    fontSize: 19,
    letterSpacing: 0.2,
  },
  close: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 20,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    color: brand.textOnDark,
    fontSize: 14,
    padding: 0,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.32)",
    backgroundColor: "rgba(210,163,67,0.07)",
  },
  customText: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 13.5 },
  list: { marginTop: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: brand.nightLineSoft,
  },
  optionOn: { backgroundColor: "rgba(210,163,67,0.07)" },
  optionLabel: { fontFamily: fonts.sansMedium, color: brand.textOnDark, fontSize: 14 },
  optionSub: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11.5,
    marginTop: 2,
  },
  empty: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 12.5,
    textAlign: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  done: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.35)",
    backgroundColor: "rgba(210,163,67,0.08)",
  },
  doneText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10.5,
    letterSpacing: 2,
  },
});
