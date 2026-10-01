import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { sendAccountCode, verifyAccountCode } from "@/lib/emailSignIn";
import PressableScale from "@/components/PressableScale";

export default function EmailCodeSignIn({ email, confirmation }: { email: string; confirmation: boolean }) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  const { completeRealtorSignIn } = useAuth();
  const router = useRouter();
  useEffect(() => { generation.current++; setToken(""); setSent(false); setMessage(""); }, [email, confirmation]);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const run = async (verify: boolean) => {
    if (lock.current || (!verify && remaining > 0)) return;
    const current = generation.current;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const result = verify ? await verifyAccountCode(email, token, confirmation) : await sendAccountCode(email, confirmation);
      if (current !== generation.current) return;
      if (!result.ok) { setMessage(result.error ?? "Please try again shortly."); return; }
      if (!verify) { setSent(true); setRemaining(60); setMessage("Check your email for a code. Enter it here to continue."); return; }
      const opened = await completeRealtorSignIn();
      if (!opened.ok) { setMessage(opened.error ?? "Couldn't open your account. Please try again shortly."); return; }
      router.replace("/admin");
    } catch { setMessage("We couldn't complete sign-in. Please try again shortly."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ gap: 14, marginTop: 24, marginBottom: 8 }}>
    <PressableScale
      accessibilityRole="button"
      disabled={busy || remaining > 0}
      haptic="selection"
      scaleTo={0.97}
      hitSlop={12}
      style={{ minHeight: 44, justifyContent: "center", opacity: (busy || remaining > 0) ? 0.55 : 1 }}
      onPress={() => void run(false)}
    >
      <Text style={{ color: "#e0bc72", textAlign: "center", paddingVertical: 14, fontSize: 14 }}>
        {remaining ? `Resend in ${remaining}s` : confirmation ? "Resend confirmation code" : sent ? "Resend sign-in code" : "Sign in with an email code"}
      </Text>
    </PressableScale>
    {(sent || confirmation) && <>
      <TextInput accessibilityLabel="Email confirmation code" placeholder="Code from your email" placeholderTextColor="#bbb" value={token} onChangeText={setToken} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={8} style={{ color: "white", borderWidth: 1, borderColor: "#b99960", padding: 15, minHeight: 52, borderRadius: 8 }} />
      <PressableScale accessibilityRole="button" disabled={busy} haptic="medium" scaleTo={0.97} hitSlop={12} style={{ minHeight: 44, justifyContent: "center" }} onPress={() => void run(true)}>
        <Text style={{ color: "#e0bc72", textAlign: "center", paddingVertical: 14 }}>{busy ? "Please wait…" : "Confirm and continue"}</Text>
      </PressableScale>
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: "#f3ead9", textAlign: "center", paddingVertical: 10, lineHeight: 20 }}>{message}</Text>}
  </View>;
}
