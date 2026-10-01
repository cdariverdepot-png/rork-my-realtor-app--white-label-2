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
 * Shared realtor portrait flow: pick/take → pan/zoom crop → portable URI for portraitUrl.
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

  const settle = useCallback((uri: string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPendingUri(null);
    resolve?.(uri);
  }, []);

  const pickPortable = useCallback(async (): Promise<string | null> => {
    if (opening || pendingUri || resolveRef.current) return null;
    setOpening(true);
    try {
      const source = await chooseSource();
      if (!source) return null;
      const raw = await launchSource(source);
      if (!raw) return null;
      return await new Promise<string | null>((resolve) => {
        resolveRef.current = resolve;
        setPendingUri(raw);
      });
    } catch {
      Alert.alert("Couldn’t load image", "Please try another photo.");
      return null;
    } finally {
      setOpening(false);
    }
  }, [opening, pendingUri]);

  const onCropDone = useCallback(async (croppedLocal: string) => {
    try {
      const portable = await toPortableImage(croppedLocal, maxWidth);
      settle(portable);
    } catch {
      Alert.alert("Couldn’t load image", "Please try another photo.");
      settle(null);
    }
  }, [maxWidth, settle]);

  const cropper = (
    <ProfileImageCropper
      visible={!!pendingUri}
      uri={pendingUri ?? ""}
      outputSize={cropOutputSize}
      onDone={(cropped) => { void onCropDone(cropped); }}
      onCancel={() => settle(null)}
    />
  );

  return {
    pickPortable,
    cropper,
    busy: opening || !!pendingUri,
  };
}
