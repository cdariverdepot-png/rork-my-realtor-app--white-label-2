import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { completeAuthCallback } from "@/lib/completeAuthCallback";
import {
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
      const hash = hashParams();
      const query = queryParams();
      const kind = await completeAuthCallback({
        code: typeof code === "string" ? code : query.get("code") ?? undefined,
        type: fromUrl || fromRoute,
        error: hash.get("error") || query.get("error") || hash.get("error_description") || query.get("error_description"),
        accessToken: hash.get("access_token"), refreshToken: hash.get("refresh_token"),
      });
      if (Platform.OS === "web") window.history.replaceState(null, "", window.location.pathname);

      if (needsSetPassword(kind)) {
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
