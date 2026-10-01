import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { SOCIAL_PROVIDERS, startSocialSignIn } from "@/lib/socialSignIn";
import PressableScale from "@/components/PressableScale";

export default function SocialSignIn() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const router = useRouter();
  const { completeRealtorSignIn } = useAuth();
  const providers = SOCIAL_PROVIDERS.filter(p => p.enabled);
  if (!providers.length) return null;
  return <View style={{ gap: 12, marginTop: 20 }}>
    {providers.map(p => (
      <PressableScale
        key={p.id}
        accessibilityRole="button"
        disabled={busy}
        haptic="selection"
        scaleTo={0.97}
        hitSlop={10}
        style={{
          borderWidth: 1,
          borderColor: "#b99960",
          paddingVertical: 16,
          paddingHorizontal: 16,
          minHeight: 52,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          opacity: busy ? 0.55 : 1,
        }}
        onPress={async () => {
          if (lock.current) return;
          lock.current = true; setBusy(true); setMessage("");
          try {
            const result = await startSocialSignIn(p.id);
            if (!result.ok) { setMessage(result.error ?? "Please try again."); return; }
            if (result.redirecting) return;
            const opened = await completeRealtorSignIn();
            if (!opened.ok) { setMessage(opened.error ?? "Couldn't open your account."); return; }
            router.replace("/admin");
          } catch { setMessage("Couldn't complete sign-in. Please try again."); }
          finally { lock.current = false; setBusy(false); }
        }}
      >
        <Text style={{ color: "#f3ead9", textAlign: "center", fontSize: 15, letterSpacing: 0.3 }}>Continue with {p.label}</Text>
      </PressableScale>
    ))}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: "#f3ead9", textAlign: "center", marginTop: 4, paddingBottom: 8 }}>{message}</Text>}
  </View>;
}
