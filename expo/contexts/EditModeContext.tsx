import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand, type Brand, type RealtorProfile, type PersonalNote } from "@/contexts/BrandContext";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";

/**
 * EditModeContext — lets a signed-in realtor edit their app content inline,
 * directly on the client-facing preview, without going back to the dashboard.
 *
 * Edits accumulate in a local draft (brand + listings). Nothing is published
 * until the realtor taps Save, at which point the changes are committed to the
 * live brand/listings stores — which broadcast to connected client devices in
 * real time. A dirty flag drives the Save bar and an unsaved-changes guard so
 * edits are never lost on exit.
 */

type Draft = {
  brand: Brand;
  listings: ManagedListing[];
};

export const [EditModeProvider, useEditMode] = createContextHook(() => {
  const { isAdmin, viewAsClient, demoViewMode } = useAuth();
  const { brand, update: commitBrand } = useBrand();
  const { all: listings, update: commitListings } = useListings();

  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  /** A realtor previewing their OWN template is the only one who can edit inline.
   *  The Eliza Vance demo is a frozen showcase — never editable, even for an admin. */
  const canEdit = Boolean(isAdmin && viewAsClient && !demoViewMode);

  const begin = useCallback(() => {
    if (!canEdit) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setDraft({
      brand: JSON.parse(JSON.stringify(brand)) as Brand,
      listings: JSON.parse(JSON.stringify(listings)) as ManagedListing[],
    });
    setEditing(true);
  }, [canEdit, brand, listings]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return (
      JSON.stringify(draft.brand) !== JSON.stringify(brand) ||
      JSON.stringify(draft.listings) !== JSON.stringify(listings)
    );
  }, [draft, brand, listings]);

  const setRealtor = useCallback((patch: Partial<RealtorProfile>) => {
    setDraft((d) =>
      d ? { ...d, brand: { ...d.brand, realtor: { ...d.brand.realtor, ...patch } } } : d
    );
  }, []);

  const setNote = useCallback((patch: Partial<PersonalNote>) => {
    setDraft((d) => (d ? { ...d, brand: { ...d.brand, note: { ...d.brand.note, ...patch } } } : d));
  }, []);

  const setNoteBody = useCallback((index: number, value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const body = [...d.brand.note.body];
      body[index] = value;
      return { ...d, brand: { ...d.brand, note: { ...d.brand.note, body } } };
    });
  }, []);

  const setListing = useCallback((id: string, patch: Partial<ManagedListing>) => {
    setDraft((d) =>
      d
        ? { ...d, listings: d.listings.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
        : d
    );
  }, []);

  const finish = useCallback(() => {
    setEditing(false);
    setDraft(null);
  }, []);

  const save = useCallback(() => {
    if (!draft) {
      finish();
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    commitBrand(() => draft.brand);
    commitListings(draft.listings);
    finish();
  }, [draft, commitBrand, commitListings, finish]);

  /** Discard the draft. Confirms first if there are unsaved edits. */
  const cancel = useCallback(() => {
    const drop = () => {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      finish();
    };
    if (!dirty) {
      finish();
      return;
    }
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Discard your unsaved edits?")) drop();
      return;
    }
    Alert.alert("Discard edits?", "Your unsaved changes will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: drop },
    ]);
  }, [dirty, finish]);

  /**
   * Guards an action (like leaving the screen) when there are unsaved edits.
   * Prompts the realtor to save, discard, or stay. Returns true if it handled
   * the prompt (caller should not proceed yet); false if it's safe to proceed.
   */
  const guardExit = useCallback(
    (onProceed: () => void): boolean => {
      if (!editing || !dirty) {
        finish();
        onProceed();
        return false;
      }
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.confirm("Save your changes before leaving?")) {
          save();
        } else {
          finish();
        }
        onProceed();
        return true;
      }
      Alert.alert(
        "Unsaved changes",
        "You have unsaved edits. Save them before leaving.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              finish();
              onProceed();
            },
          },
          {
            text: "Save & leave",
            onPress: () => {
              save();
              onProceed();
            },
          },
        ]
      );
      return true;
    },
    [editing, dirty, save, finish]
  );

  /** The brand/listings the preview should render — draft while editing, else live. */
  const previewBrand = editing && draft ? draft.brand : brand;
  const previewListings = editing && draft ? draft.listings : listings;

  return useMemo(
    () => ({
      canEdit,
      editing,
      dirty,
      previewBrand,
      previewListings,
      begin,
      cancel,
      save,
      guardExit,
      setRealtor,
      setNote,
      setNoteBody,
      setListing,
    }),
    [
      canEdit,
      editing,
      dirty,
      previewBrand,
      previewListings,
      begin,
      cancel,
      save,
      guardExit,
      setRealtor,
      setNote,
      setNoteBody,
      setListing,
    ]
  );
});
