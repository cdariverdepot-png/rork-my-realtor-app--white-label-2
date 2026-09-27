import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ArrowLeft, ArrowRight, Check, MailCheck } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { requestResetLink, setNewPasswordWhileAuthenticated } from "@/lib/passwordReset";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Realtor password reset / set-password.
 *
 * Primary path: email a recovery **link** → /auth/callback (type=recovery) →
 * this screen with mode=set → updateUser password → completeRealtorSignIn.
 *
 * Also accepts an existing recovery session on mount (link already established).
 */
type Stage = "request" | "sent" | "set" | "done";

export default function ResetPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { completeRealtorSignIn } = useAuth();

  const linkSetMode = mode === "set";
  const [stage, setStage] = useState<Stage>(linkSetMode ? "set" : "request");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const sessionChecked = useRef(false);

  const shake = useRef(new Animated.Value(0)).current;

  // If a recovery session already exists (callback routed here, or hash consumed),
  // skip email entry and show set-password UI.
  useEffect(() => {
    if (sessionChecked.current) return;
    sessionChecked.current = true;
    if (linkSetMode) {
      setStage("set");
      return;
    }
    void (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) setStage("set");
    })();
  }, [linkSetMode]);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 60, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 60, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      ]).start();
    },
    [shake]
  );

  const sendLink = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await requestResetLink(email);
    setBusy(false);
    if (!res.ok) {
      fail(res.error ?? "Something went wrong.");
      return;
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setStage("sent");
  }, [busy, email, fail]);

  const savePassword = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (password !== confirm) {
      setBusy(false);
      fail("Passwords don't match.");
      return;
    }
    const res = await setNewPasswordWhileAuthenticated(password);
    if (!res.ok) {
      setBusy(false);
      fail(res.error ?? "Something went wrong.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const opened = await completeRealtorSignIn();
    setBusy(false);
    if (opened.ok) {
      router.replace("/admin");
      return;
    }
    setStage("done");
  }, [busy, confirm, completeRealtorSignIn, fail, password, router]);

  const shakeStyle = {
    transform: [
      {
        translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }),
      },
    ],
  };

  const back = () => {
    if (stage === "sent") setStage("request");
    else router.back();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={back} hitSlop={14} style={styles.iconBtn} accessibilityLabel="Back">
          <ArrowLeft size={17} color={brand.ivory} strokeWidth={1.6} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.kbd}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rule} />

          {stage === "done" ? (
            <View>
              <View style={styles.doneIcon}>
                <Check size={22} color={brand.goldLight} strokeWidth={2} />
              </View>
              <Text style={styles.title}>Password saved.</Text>
              <Text style={styles.sub}>
                Sign in with your email and new password to open your realtor account.
              </Text>
              <Pressable
                onPress={() => router.replace("/portal?entry=realtor")}
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.ctaText}>BACK TO SIGN IN</Text>
                <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
              </Pressable>
            </View>
          ) : stage === "sent" ? (
            <View>
              <View style={styles.sentBadge}>
                <MailCheck size={13} color={brand.goldLight} strokeWidth={1.6} />
                <Text style={styles.sentText}>LINK SENT</Text>
              </View>
              <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
              <Text style={styles.title}>Check your email.</Text>
              <Text style={styles.sub}>
                We sent a reset link to {email}. Open it on this same device/browser so we can finish
                setting your password here. The link expires in about an hour.
              </Text>
              <Pressable
                onPress={sendLink}
                disabled={busy}
                hitSlop={10}
                style={styles.resend}
              >
                <Text style={styles.resendText}>Didn&apos;t arrive? Send another</Text>
              </Pressable>
              <Pressable
                onPress={() => router.replace("/portal?entry=realtor")}
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.ctaText}>BACK TO SIGN IN</Text>
                <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
              </Pressable>
            </View>
          ) : (
            <Animated.View style={shakeStyle}>
              <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
              <Text style={styles.title}>
                {stage === "set" ? "Choose a new password." : "Forgot your password?"}
              </Text>
              <Text style={styles.sub}>
                {stage === "set"
                  ? "You're signed in from the email link. Set a new password to finish, then we'll open your account."
                  : "We'll email you a link. Open it here to set a new password — no code to type."}
              </Text>

              {stage === "request" ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>EMAIL</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(244,239,230,0.3)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="send"
                    onSubmitEditing={sendLink}
                    style={styles.input}
                  />
                </View>
              ) : (
                <View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="At least 6 characters"
                      placeholderTextColor="rgba(244,239,230,0.3)"
                      secureTextEntry
                      returnKeyType="next"
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
                    <TextInput
                      value={confirm}
                      onChangeText={setConfirm}
                      placeholder="Type it again"
                      placeholderTextColor="rgba(244,239,230,0.3)"
                      secureTextEntry
                      returnKeyType="done"
                      onSubmitEditing={savePassword}
                      style={styles.input}
                    />
                  </View>
                </View>
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={stage === "request" ? sendLink : savePassword}
                disabled={busy}
                style={({ pressed }) => [
                  styles.cta,
                  busy && { opacity: 0.5 },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={styles.ctaText}>
                  {busy
                    ? "WORKING…"
                    : stage === "request"
                      ? "EMAIL ME A LINK"
                      : "SAVE PASSWORD"}
                </Text>
                <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  topBar: { paddingHorizontal: 22, paddingBottom: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  kbd: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28 },
  rule: { width: 30, height: 1, backgroundColor: brand.gold, marginBottom: 20 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3.4,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  sub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 13.5,
    lineHeight: 21,
    marginBottom: 28,
  },
  doneIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.5)",
    backgroundColor: "rgba(210,163,67,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  sentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    backgroundColor: "rgba(210,163,67,0.1)",
    marginBottom: 20,
  },
  sentText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  field: { marginBottom: 18 },
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.45)",
    fontSize: 9,
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.sans,
    color: brand.ivory,
    fontSize: 15,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.2)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  error: {
    fontFamily: fonts.sans,
    color: "#E06E5A",
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 14,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    backgroundColor: brand.gold,
    marginTop: 6,
  },
  ctaText: {
    fontFamily: fonts.sansSemi,
    color: brand.forestDeep,
    fontSize: 11,
    letterSpacing: 2.4,
  },
  resend: { alignItems: "center", paddingVertical: 18 },
  resendText: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.55)",
    fontSize: 12,
  },
});
