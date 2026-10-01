import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput } from "react-native";
import { useURL } from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createClientRecoverySession } from "@/lib/supabase";
import { hashPassword } from "@/lib/passwordHash";
import { isRealtorRef } from "@/lib/leadBooking";
import { signupEmailRedirect, webOriginForRedirect } from "@/lib/authRedirect";

/** Client credentials are separate from realtor Auth passwords. */
export default function ClientRecovery() {
  const { realtorId, invite, email: initialEmail } = useLocalSearchParams<{ realtorId?: string; invite?: string; email?: string }>();
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"request" | "verify" | "password" | "done">("request");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [client] = useState(createClientRecoverySession);
  const incomingUrl = useURL();
  const consumed = useRef(false);
  useEffect(() => {
    const raw = Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : incomingUrl;
    if (!raw || consumed.current) return;
    const fragment = new URLSearchParams(raw.split("#")[1] ?? "");
    const access_token = fragment.get("access_token"), refresh_token = fragment.get("refresh_token");
    if (!access_token || !refresh_token) return;
    consumed.current = true; setBusy(true); inFlight.current = true;
    // The callback wrapper selects client recovery before any realtor sign-in.
    void client.auth.setSession({ access_token, refresh_token }).then(async ({ error }) => {
      if (error) throw error;
      const result = await client.auth.getUser();
      if (result.error || !result.data.user?.email_confirmed_at || !result.data.user.email) throw new Error("Invalid email link");
      setEmail(result.data.user.email.toLowerCase()); setStage("password");
    }).catch(() => setError("This recovery link is invalid or expired. Request a new email."))
      .finally(() => {
        setBusy(false); inFlight.current = false;
        if (Platform.OS === "web") window.history.replaceState(null, "", window.location.pathname + window.location.search);
      });
  }, [client, incomingUrl]);
  useEffect(() => () => { void client.auth.signOut({ scope: "local" }); }, [client]);
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const send = () => run(async () => {
    if (!isRealtorRef(realtorId)) throw new Error("Open recovery from your realtor's client sign-in page.");
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Enter your account email.");
    // A legacy client may not have an Auth identity yet. This creates only the
    // email-verification identity, never a realtor record or a new client profile.
    const redirect = new URL(signupEmailRedirect(webOriginForRedirect()));
    redirect.searchParams.set("client_recovery", "1");
    redirect.searchParams.set("realtorId", realtorId);
    if (invite) redirect.searchParams.set("invite", invite);
    const { error } = await client.auth.signInWithOtp({ email: address,
      options: { shouldCreateUser: true, emailRedirectTo: redirect.toString() } });
    if (error) throw new Error("We couldn't send the email code. Wait a minute and retry, or contact your realtor.");
    setEmail(address); setStage("verify");
  });
  const verify = () => run(async () => {
    if (!/^\d{6,8}$/.test(code.trim())) throw new Error("Enter the code from your email.");
    const { error } = await client.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) throw new Error("That code is invalid or expired. Try again or request a new code.");
    setStage("password");
  });
  const save = () => run(async () => {
    if (password.length < 6) throw new Error("Use at least 6 characters.");
    if (password !== confirm) throw new Error("Passwords don't match.");
    const { data, error } = await client.rpc("recover_client_password", {
      p_realtor_id: realtorId, p_pw_hash: await hashPassword(email, password),
    });
    if (error) throw new Error("We couldn't reset your password. Retry or contact your realtor for help.");
    if (data?.ok !== true) throw new Error("No account was found for this email and realtor. Check your invitation and email.");
    await client.auth.signOut({ scope: "local" });
    setPassword(""); setConfirm(""); setStage("done");
  });
  const back = () => router.replace({ pathname: "/portal", params: { entry: "client", invite: invite ?? "", signin: "1" } });
  const field = (label: string, value: string, change: (v: string) => void, secure = false) => <>
    <Text style={{ color: "white", marginTop: 16 }}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={change} secureTextEntry={secure}
      editable={!busy} autoCapitalize="none" autoCorrect={false}
      style={{ color: "white", padding: 14, borderWidth: 1, borderColor: "#657079", borderRadius: 10 }} />
  </>;
  return <ScrollView style={{ backgroundColor: "#101419" }} contentContainerStyle={{ padding: 28, paddingTop: 70, gap: 16 }} keyboardShouldPersistTaps="handled">
    <Text style={{ color: "white", fontSize: 28 }}>{stage === "done" ? "Password reset" : "Recover your client account"}</Text>
    <Text style={{ color: "#CBD0D6", lineHeight: 23 }}>Verify your account email to reset your password. Your profile and history stay with your existing account.</Text>
    {stage === "request" && field("Account email", email, setEmail)}
    {stage === "verify" && <><Text style={{ color: "white" }}>Open the recovery link sent to {email}, or enter the code if your email includes one.</Text>{field("Email code", code, setCode)}
      <Pressable disabled={busy} onPress={() => { setCode(""); setStage("request"); }}><Text style={{ color: "#E0BC72" }}>Change email or request a new code</Text></Pressable></>}
    {stage === "password" && <>{field("New password", password, setPassword, true)}{field("Confirm password", confirm, setConfirm, true)}</>}
    {error ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9" }}>{error}</Text> : null}
    <Pressable disabled={busy} accessibilityRole="button" onPress={stage === "request" ? send : stage === "verify" ? verify : stage === "password" ? save : back}
      style={{ padding: 18, backgroundColor: "#C2A276", borderRadius: 12, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ textAlign: "center" }}>{busy ? "Please wait…" : stage === "request" ? "Send email code" : stage === "verify" ? "Verify email" : stage === "password" ? "Reset password" : "Back to client sign-in"}</Text>
    </Pressable>
    {stage !== "done" && <Pressable disabled={busy} onPress={back}><Text style={{ color: "white" }}>Back to client sign-in</Text></Pressable>}
  </ScrollView>;
}
