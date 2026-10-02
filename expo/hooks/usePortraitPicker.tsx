import React, { useCallback, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import ProfileImageCropper from "@/components/ProfileImageCropper";
import { toPortableImage } from "@/lib/portableImage";

type Source = "library" | "camera";

async function chooseSource(): Promise<Source | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "Profile photo",
      "Take a new photo or choose one you already have.",
      [
        { text: "Take photo", onPress: () => resolve("camera") },
        { text: "Choose from library", onPress: () => resolve("library") },
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function launchSource(source: Source): Promise<string | null> {
  if (source === "camera") {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert("Camera permission needed", "Allow camera access to take a profile photo.");
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (res.canceled || !res.assets[0]) return null;
    return res.assets[0].uri;
  }

  if (Platform.OS !== "web") {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      Alert.alert("Photo access needed", "Allow photo library access to choose a profile photo.");
      return null;
    }
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });
  if (res.canceled || !res.assets[0]) return null;
  return res.assets[0].uri;
}

/**
 * Shared realtor portrait flow.
 * - With an existing photo: tap opens crop/reposition (industry-standard), Replace is secondary.
 * - Without: pick/take → full photo by default (optional explicit crop) → portable URI for portraitUrl.
 * Render `cropper` once near the screen root.
 */
export function usePortraitPicker(options?: {
  maxWidth?: number;
  cropOutputSize?: number;
}) {
  const maxWidth = options?.maxWidth ?? 800;
  const cropOutputSize = options?.cropOutputSize ?? 800;
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const resolveRef = useRef<((uri: string | null) => void) | null>(null);
  const replacingRef = useRef(false);

  const settle = useCallback((uri: string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPendingUri(null);
    resolve?.(uri);
  }, []);

  const openCropper = useCallback((raw: string) => new Promise<string | null>((resolve) => {
    resolveRef.current = resolve;
    setPendingUri(raw);
  }), []);

  /** Pick or take a photo; the confirmation keeps its entire image by default. */
  const pickPortable = useCallback(async (): Promise<string | null> => {
    if (opening || pendingUri || resolveRef.current) return null;
    setOpening(true);
    try {
      const source = await chooseSource();
      if (!source) return null;
      const raw = await launchSource(source);
      if (!raw) return null;
      return await openCropper(raw);
    } catch {
      Alert.alert("Couldn’t load image", "Please try another photo.");
      return null;
    } finally {
      setOpening(false);
    }
  }, [opening, pendingUri, openCropper]);

  /**
   * Industry-standard avatar tap: if a portrait already exists, open crop/reposition
   * on that photo. Otherwise start a new pick. Replace stays available inside the cropper.
   */
  const editPortrait = useCallback(async (currentUri?: string | null): Promise<string | null> => {
    if (opening || pendingUri || resolveRef.current) return null;
    const existing = (currentUri ?? "").trim();
    if (existing) {
      setOpening(true);
      try {
        return await openCropper(existing);
      } finally {
        setOpening(false);
      }
    }
    return pickPortable();
  }, [opening, pendingUri, openCropper, pickPortable]);

  const onCropDone = useCallback(async (croppedLocal: string) => {
    try {
      const portable = await toPortableImage(croppedLocal, maxWidth);
      settle(portable);
    } catch {
      Alert.alert("Couldn’t load image", "Please try another photo.");
      settle(null);
    }
  }, [maxWidth, settle]);

  const onReplace = useCallback(() => {
    if (replacingRef.current) return;
    replacingRef.current = true;
    void (async () => {
      try {
        const source = await chooseSource();
        if (!source) return;
        const raw = await launchSource(source);
        if (!raw) return;
        // Keep the same pending promise; swap the source under the cropper.
        setPendingUri(raw);
      } catch {
        Alert.alert("Couldn’t load image", "Please try another photo.");
      } finally {
        replacingRef.current = false;
      }
    })();
  }, []);

  const cropper = (
    <ProfileImageCropper
      visible={!!pendingUri}
      uri={pendingUri ?? ""}
      outputSize={cropOutputSize}
      onDone={(cropped) => { void onCropDone(cropped); }}
      onCancel={() => settle(null)}
      onReplace={onReplace}
    />
  );

  return {
    pickPortable,
    editPortrait,
    cropper,
    busy: opening || !!pendingUri,
  };
}
