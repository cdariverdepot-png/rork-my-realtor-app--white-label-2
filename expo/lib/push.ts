import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { supabase } from "@/lib/supabase";

/**
 * Expo push registration + delivery.
 *
 * Until now the app only ever called `scheduleNotificationAsync` with a null
 * trigger, which posts a local notification on a device that is already awake
 * and running the app. That means a realtor pushing a new listing reached only
 * the clients who happened to have the app open — for a product whose promise
 * is "your realtor's private line", the feature was effectively not working.
 *
 * This module registers a real device token and hands sending off to a server
 * function, so an alert reaches a phone that is locked and in a pocket.
 */

export type PushRole = "admin" | "client";

/** Resolve the EAS project id the push service needs to mint a token. */
function projectId(): string | undefined {
  const fromEas = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  return (
    fromEas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId ??
    process.env.EXPO_PUBLIC_PROJECT_ID
  );
}

/**
 * Ask for permission (if not already settled) and return the Expo push token.
 * Returns null on web, on simulators, or when the user declines — all normal
 * outcomes that callers should treat as "no push for this device", never as
 * errors worth surfacing.
 */
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  // Expo Go does not support remote push registration; development builds do.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  if (!Device.isDevice) return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return null;

    if (Platform.OS === "android") {
      // Android needs an explicit channel or notifications arrive silently.
      await Notifications.setNotificationChannelAsync("default", {
        name: "Updates",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 220, 120, 220],
        lightColor: "#D2A343",
      });
    }

    const pid = projectId();
    const token = await Notifications.getExpoPushTokenAsync(pid ? { projectId: pid } : undefined);
    return token.data ?? null;
  } catch (e) {
    console.log("[push] token failed", e);
    return null;
  }
}

/**
 * Store this device's token against whoever is signed in, so the sender knows
 * which phones to reach. Safe to call on every launch — the server upserts.
 */
export async function registerDevice(input: {
  realtorId: string;
  role: PushRole;
  email: string;
  clientId?: string;
}): Promise<string | null> {
  const token = await getPushToken();
  if (!token || !supabase || !input.realtorId) return null;

  try {
    const { error } = await supabase.rpc("register_push_token", {
      p_token: token,
      p_realtor_id: input.realtorId,
      p_role: input.role,
      p_owner_key: input.email.trim().toLowerCase(),
      p_client_id: input.clientId ?? null,
      p_platform: Platform.OS,
    });
    if (error) {
      console.log("[push] register error", error.message);
      return null;
    }
    return token;
  } catch (e) {
    console.log("[push] register exception", e);
    return null;
  }
}

/** Drop this device's token — called on sign-out and account deletion. */
export async function unregisterDevice(token: string | null): Promise<void> {
  if (!token || !supabase) return;
  try {
    await supabase.from("push_tokens").delete().eq("token", token);
  } catch (e) {
    console.log("[push] unregister failed", e);
  }
}

export type PushAudience =
  | { kind: "all-clients" }
  | { kind: "clients"; clientIds: string[] }
  | { kind: "realtor" };

/**
 * Send a real push through the `send-push` Edge Function.
 *
 * Fire-and-forget by design: the in-app notification list is already updated
 * and broadcast over realtime by the caller, so a failed push degrades to
 * "they see it next time they open the app" rather than losing the message.
 */
export async function sendPush(input: {
  realtorId: string;
  audience: PushAudience;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  if (!supabase || !input.realtorId) return false;
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        realtorId: input.realtorId,
        audience: input.audience,
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      },
    });
    if (error) {
      console.log("[push] send error", error.message);
      return false;
    }
    return (data as { ok?: boolean } | null)?.ok === true;
  } catch (e) {
    console.log("[push] send exception", e);
    return false;
  }
}
