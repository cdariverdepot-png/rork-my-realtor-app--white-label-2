import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

function hashParams(): URLSearchParams {
  if (Platform.OS !== "web" || typeof window === "undefined") return new URLSearchParams();
  const raw = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : window.location.hash || "";
  return new URLSearchParams(raw);
}

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const started = useRef(false);
  const router = useRouter();
  const { completeRealtorSignIn } = useAuth();
  const [message, setMessage] = useState("Completing sign-in…");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      if (!supabase) throw new Error("invalid callback");
      if (code && typeof code === "string") {
        const result = await supabase.auth.exchangeCodeForSession(code);
        if (result.error) throw result.error;
      } else if (Platform.OS === "web") {
        const hash = hashParams();
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        if (access_token && refresh_token) {
          const result = await supabase.auth.setSession({ access_token, refresh_token });
          if (result.error) throw result.error;
        } else {
          throw new Error("invalid callback");
        }
      } else {
        throw new Error("invalid callback");
      }
      const opened = await completeRealtorSignIn();
      if (!opened.ok) { setMessage(opened.error ?? "Couldn't open your account."); return; }
      router.replace("/admin");
    })().catch(() => setMessage("This sign-in link is no longer usable here. Return to sign-in and try again, or use an email code."));
  }, [code, completeRealtorSignIn, router]);
  return <View style={{ flex: 1, backgroundColor: "#171717", padding: 30, justifyContent: "center", gap: 24 }}>
    <Text style={{ color: "white", fontSize: 20 }}>{message}</Text>
    <Pressable accessibilityRole="button" onPress={() => router.replace("/portal?entry=realtor")}><Text style={{ color: "#e0bc72" }}>Return to sign-in</Text></Pressable>
  </View>;
}
