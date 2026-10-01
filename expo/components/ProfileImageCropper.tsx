import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
  clampCropFocus,
  cropImageLayout,
  cropProfileImage,
  getImageSize,
  proposeCropFocus,
  type CropFocus,
} from "@/lib/profileImageCrop";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Square pan/zoom cropper for realtor portraits.
 * Opens on an existing photo (adjust) or a freshly picked one; proposes a
 * sensible default crop, then lets the user tweak. Optional Replace swaps the
 * source without forcing a new pick up front.
 */
export default function ProfileImageCropper({
  visible,
  uri,
  outputSize = 800,
  onDone,
  onCancel,
  onReplace,
}: {
  visible: boolean;
  uri: string;
  outputSize?: number;
  onDone: (croppedUri: string) => void;
  onCancel: () => void;
  /** Secondary action: pick a different photo while keeping the cropper flow. */
  onReplace?: () => void;
}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewSize = Math.min(window.width - 36, 360);
  const [focus, setFocus] = useState<CropFocus>({ x: 50, y: 50, zoom: 1 });
  const [proposed, setProposed] = useState<CropFocus>({ x: 50, y: 50, zoom: 1 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = useRef<CropFocus>({ x: 50, y: 50, zoom: 1 });

  useEffect(() => {
    if (!visible || !uri) return;
    setNatural(null);
    setError("");
    setBusy(false);
    let alive = true;
    void getImageSize(uri)
      .then((size) => {
        if (!alive) return;
        const smart = proposeCropFocus(size.width, size.height);
        setProposed(smart);
        setFocus(smart);
        start.current = smart;
        setNatural(size);
      })
      .catch(() => { if (alive) setError("Couldn’t open that photo. Try another."); });
    return () => { alive = false; };
  }, [visible, uri]);

  const layout = useMemo(() => {
    if (!natural) return null;
    return cropImageLayout(natural.width, natural.height, viewSize, focus);
  }, [natural, viewSize, focus]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().runOnJS(true)
      .onBegin(() => { start.current = focus; })
      .onUpdate((e) => {
        const factor = 100 / (viewSize * 0.85) / start.current.zoom;
        setFocus((current) => clampCropFocus({
          ...current,
          x: clamp(start.current.x - e.translationX * factor, 0, 100),
          y: clamp(start.current.y - e.translationY * factor, 0, 100),
        }));
      });
    const pinch = Gesture.Pinch().runOnJS(true)
      .onBegin(() => { start.current = focus; })
      .onUpdate((e) => setFocus((current) => clampCropFocus({
        ...current,
        zoom: clamp(start.current.zoom * e.scale, MIN_CROP_ZOOM, MAX_CROP_ZOOM),
      })));
    return Gesture.Simultaneous(pan, pinch);
  }, [focus, viewSize]);

  const finish = async () => {
    if (!uri || busy) return;
    setBusy(true);
    setError("");
    try {
      const cropped = await cropProfileImage(uri, focus, outputSize);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      onDone(cropped);
    } catch {
      setError("Couldn’t crop that photo. Try another.");
      setBusy(false);
    }
  };

  const reset = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setFocus(proposed);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0B0D0C" }}>
        <View style={{
          paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 12,
          flexDirection: "row", alignItems: "center",
        }}>
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={10} disabled={busy} style={{ padding: 8 }}>
            <Text style={{ color: "#C8C2B4", fontSize: 16 }}>Cancel</Text>
          </Pressable>
          <Text style={{ flex: 1, color: "#F5EFE5", textAlign: "center", fontSize: 16, fontWeight: "600" }}>
            Position your photo
          </Text>
          <Pressable
            onPress={() => void finish()}
            accessibilityRole="button"
            hitSlop={10}
            disabled={busy || !natural}
            style={({ pressed }) => ({
              paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
              backgroundColor: "#D4B989",
              opacity: busy || !natural ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Text style={{ color: "#171713", fontSize: 16, fontWeight: "700" }}>
              {busy ? "Saving…" : "Done"}
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {error ? (
            <Text style={{ color: "#FFBAA9", paddingHorizontal: 24, textAlign: "center" }}>{error}</Text>
          ) : !natural || !layout ? (
            <ActivityIndicator color="#D4B989" />
          ) : (
            <GestureDetector gesture={gesture}>
              <View
                style={{
                  width: viewSize, height: viewSize, borderRadius: 18,
                  overflow: "hidden", backgroundColor: "#1A1C1B",
                }}
                collapsable={false}
                accessibilityLabel="Drag to move, pinch to zoom"
              >
                <Image
                  source={{ uri }}
                  style={{
                    position: "absolute",
                    width: layout.width,
                    height: layout.height,
                    left: layout.left,
                    top: layout.top,
                  }}
                  contentFit="fill"
                  pointerEvents="none"
                />
              </View>
            </GestureDetector>
          )}
        </View>

        <View style={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 24, alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#C8C2B4", textAlign: "center" }}>Drag to move · Pinch to zoom</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 22 }}>
            <Pressable onPress={reset} accessibilityRole="button" hitSlop={8} disabled={busy}>
              <Text style={{ color: "#D4B989" }}>Reset</Text>
            </Pressable>
            {onReplace ? (
              <Pressable
                onPress={() => {
                  if (busy) return;
                  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  onReplace();
                }}
                accessibilityRole="button"
                hitSlop={8}
                disabled={busy}
              >
                <Text style={{ color: "#D4B989" }}>Replace photo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
