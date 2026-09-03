import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Check, Pencil, X } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";

/**
 * EditableText — renders plain text normally, but when the realtor is in inline
 * edit mode it becomes a tappable field with a subtle gold affordance. Tapping
 * opens a focused editor sheet to change just that field. Saving writes to the
 * edit draft (published later via the Save bar).
 */
interface Props {
  value: string;
  onSave: (next: string) => void;
  editing: boolean;
  style?: StyleProp<TextStyle>;
  /** Optional accent for the edit outline (defaults to gold). */
  accent?: string;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  /** Render children verbatim instead of <Text>{value}</Text> in display mode. */
  children?: React.ReactNode;
}

export default function EditableText({
  value,
  onSave,
  editing,
  style,
  accent = brand.gold,
  label,
  placeholder,
  multiline = false,
  numberOfLines,
  children,
}: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>(value);

  const display = children ?? (
    <Text style={style} numberOfLines={numberOfLines}>
      {value}
    </Text>
  );

  if (!editing) return <>{display}</>;

  const onOpen = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setDraft(value);
    setOpen(true);
  };

  const commit = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    onSave(draft.trim());
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [
          editStyles.wrap,
          { borderColor: accent },
          pressed && { opacity: 0.7 },
        ]}
      >
        {display}
        <View style={[editStyles.badge, { backgroundColor: accent }]}>
          <Pencil size={10} color={brand.nightDeep} strokeWidth={2} />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={editStyles.backdrop} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={editStyles.center}
          pointerEvents="box-none"
        >
          <View style={editStyles.sheet}>
            <View style={editStyles.sheetHead}>
              <Text style={editStyles.sheetLabel}>{(label ?? "EDIT").toUpperCase()}</Text>
              <Pressable hitSlop={10} onPress={() => setOpen(false)}>
                <X size={18} color={brand.muted} strokeWidth={1.8} />
              </Pressable>
            </View>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={placeholder}
              placeholderTextColor="rgba(45,52,53,0.35)"
              style={[editStyles.input, multiline && editStyles.inputMultiline]}
              multiline={multiline}
              autoFocus
              selectTextOnFocus
              returnKeyType={multiline ? "default" : "done"}
              onSubmitEditing={multiline ? undefined : commit}
            />
            <Pressable
              onPress={commit}
              style={({ pressed }) => [editStyles.saveBtn, pressed && { opacity: 0.88 }]}
            >
              <Check size={15} color={brand.ivory} strokeWidth={2} />
              <Text style={editStyles.saveBtnText}>DONE</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const editStyles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginVertical: -3,
    marginHorizontal: -6,
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,9,12,0.6)" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  sheet: {
    backgroundColor: brand.paper,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: brand.hairline,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 10,
    letterSpacing: 2.5,
  },
  input: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: brand.ink,
    borderWidth: 1,
    borderColor: brand.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  inputMultiline: { minHeight: 120, textAlignVertical: "top" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: brand.forest,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 16,
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 2,
  },
});
