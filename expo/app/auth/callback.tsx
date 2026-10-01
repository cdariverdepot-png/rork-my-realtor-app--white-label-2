import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { AuthCallbackError, completeAuthCallback } from "@/lib/completeAuthCallback";
import {
  needsSetPassword,
  readAuthCallbackType,
} from "@/lib/authCallback";
import { completeGoogleIdTokenCallback } from "@/lib/socialSignIn";
import ClientRecovery from "@/app/client-recovery";

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
  const { client_recovery } = useLocalSearchParams<{ client_recovery?: string }>();
  return client_recovery === "1" ? <ClientRecovery /> : <RealtorAuthCallback />;
}

function RealtorAuthCallback() {
  const { code, type: typeParam, token_hash: tokenHashParam } = useLocalSearchParams<{ code?: string; type?: string; token_hash?: string }>();
  const started = useRef(false);
  const router = useRouter();
  const { completeRealtorSignIn } = useAuth();
  const [message, setMessage] = useState("Completing sign-in…");
  /** After email is confirmed but session could not be established here (PKCE / other device). */
  const [confirmedContinue, setConfirmedContinue] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // Google ID-token return (full-page redirect or popup child).
      // Must run before email/OAuth callback parsing — hash has id_token, not code.
      const google = await completeGoogleIdTokenCallback();
      if (google) {
        if (Platform.OS === "web") window.history.replaceState(null, "", window.location.pathname);
        if (google.ok && google.redirecting) {
          // Popup child handed the URL to the opener; nothing else to do here.
          setMessage("You can close this window and return to the app.");
          return;
        }
        if (!google.ok) {
          setMessage(google.error || "Couldn't complete Google sign-in. Please try again.");
          return;
        }
        const opened = await completeRealtorSignIn();
        if (!opened.ok) {
          setConfirmedContinue(true);
          setMessage(opened.error ?? "Signed in with Google. Continue to open your account.");
          return;
        }
        router.replace("/admin");
        return;
      }

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
        tokenHash: typeof tokenHashParam === "string" ? tokenHashParam : query.get("token_hash"),
      });
      if (Platform.OS === "web") window.history.replaceState(null, "", window.location.pathname);

      if (needsSetPassword(kind)) {
        setMessage("Open the set-password screen to finish…");
        router.replace("/reset-password?mode=set&from=link");
        return;
      }

      const opened = await completeRealtorSignIn();
      if (!opened.ok) {
        setConfirmedContinue(true);
        setMessage(
          opened.error ??
            "Your email is confirmed. Sign in with your email and password, or use an email code on the portal."
        );
        return;
      }
      router.replace("/admin");
    })().catch((e: unknown) => {
      if (Platform.OS === "web" && typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
      if (e instanceof AuthCallbackError && e.reason === "other-device") {
        setConfirmedContinue(true);
        setMessage(
          "Your email is confirmed. This link opened in a different browser or app than the one you signed up in. Sign in with your email and password, or request an email code on the portal. If you were resetting your password, request the reset link again from this device."
        );
        return;
      }
      setMessage(
        "This link has expired or was already used. Sign in with your email and password, or request a new link below."
      );
    });
  }, [code, typeParam, tokenHashParam, completeRealtorSignIn, router]);

  const goPortalSignIn = () => {
    router.replace(confirmedContinue ? "/portal?entry=realtor&confirmed=1" : "/portal?entry=realtor");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#171717", padding: 30, justifyContent: "center", gap: 24 }}>
      <Text style={{ color: "white", fontSize: 20 }}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={goPortalSignIn}>
        <Text style={{ color: "#e0bc72" }}>
          {confirmedContinue ? "Continue to sign-in (password or email code)" : "Return to sign-in"}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.replace("/reset-password")}>
        <Text style={{ color: "#e0bc72" }}>Forgot password? Request a new link</Text>
      </Pressable>
    </View>
  );
}
