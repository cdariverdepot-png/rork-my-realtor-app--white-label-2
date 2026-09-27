import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  classifyAuthCallbackType,
  needsSetPassword,
  readAuthCallbackType,
} from "@/lib/authCallback";

function hashParams(): URLSearchParams {
  if (Platform.OS !== "web" || typeof window === "undefined") return new URLSearchParams();
  const raw = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : window.location.hash || "";
  return new URLSearchParams(raw);
}

function queryParams(): URLSearchParams {
  if (Platform.OS !== "web" || typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search || "");
}

/** Establish a Supabase session from PKCE code, implicit hash tokens, or an existing web detect. */
async function establishSession(code?: string) {
  if (!supabase) throw new Error("invalid callback");

  const fromParams = typeof code === "string" && code.length > 0 ? code : null;
  const fromQuery = Platform.OS === "web" ? queryParams().get("code") : null;
  const authCode = fromParams || fromQuery;

  if (authCode) {
    const result = await supabase.auth.exchangeCodeForSession(authCode);
    if (result.error) throw result.error;
    return;
  }

  if (Platform.OS === "web") {
    const hash = hashParams();
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (access_token && refresh_token) {
      const result = await supabase.auth.setSession({ access_token, refresh_token });
      if (result.error) throw result.error;
      return;
    }
    const err = hash.get("error_description") || queryParams().get("error_description");
    if (err) throw new Error(err);
  }

  // detectSessionInUrl may already have persisted a session before this route mounts.
  const existing = await supabase.auth.getSession();
  if (existing.data.session) return;

  throw new Error("invalid callback");
}

export default function AuthCallback() {
  const { code, type: typeParam } = useLocalSearchParams<{ code?: string; type?: string }>();
  const started = useRef(false);
  const router = useRouter();
  const { completeRealtorSignIn } = useAuth();
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // Capture type before establishSession / URL cleanup consumes the hash.
      const fromUrl = readAuthCallbackType(hashParams(), queryParams());
      const fromRoute = typeof typeParam === "string" ? typeParam.toLowerCase() : null;
      const kind = classifyAuthCallbackType(fromUrl || fromRoute);
      let recoveryEvent = false;

      const authListener =
        supabase?.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") recoveryEvent = true;
        }) ?? null;

      try {
        await establishSession(typeof code === "string" ? code : undefined);
      } finally {
        authListener?.data.subscription.unsubscribe();
      }

      if (needsSetPassword(kind) || recoveryEvent) {
        setMessage("Open the set-password screen to finish…");
        router.replace("/reset-password?mode=set&from=link");
        return;
      }

      const opened = await completeRealtorSignIn();
      if (!opened.ok) {
        setMessage(
          opened.error ??
            "Your email is confirmed. Open the My Realtor App on your phone and sign in with your email and password to continue."
        );
        return;
      }
      router.replace("/admin");
    })().catch(() =>
      setMessage(
        "This link could not finish here (expired, already used, or password still required). Open My Realtor App and sign in with your email and password, or request a new reset link from the portal on this site."
      )
    );
  }, [code, typeParam, completeRealtorSignIn, router]);

  return (
    <View style={{ flex: 1, backgroundColor: "#171717", padding: 30, justifyContent: "center", gap: 24 }}>
      <Text style={{ color: "white", fontSize: 20 }}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace("/portal?entry=realtor")}>
        <Text style={{ color: "#e0bc72" }}>Return to sign-in</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.replace("/reset-password")}>
        <Text style={{ color: "#e0bc72" }}>Forgot password? Request a new link</Text>
      </Pressable>
    </View>
  );
}
