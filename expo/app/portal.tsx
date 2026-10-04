import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Linking,
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
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { ArrowRight, ChevronLeft, Lock, Building2, DoorClosed } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import EmailCodeSignIn from "@/components/EmailCodeSignIn";
import SocialSignIn from "@/components/SocialSignIn";
import AccessCodeContinue from "@/components/AccessCodeContinue";
import PressableScale from "@/components/PressableScale";
import { isClientAccessCode, isRealtorAccessCode } from "@/constants/access";
import { useOnboarding } from "@/contexts/OnboardingContext";
import OnboardingCarousel from '@/components/OnboardingCarousel';
import InvitationInstall from '@/components/InvitationInstall';
import { supabase } from '@/lib/supabase';

type Stage =
  | "entry"
  | "code"
  | "realtor-setup"
  | "realtor-signin"
  | "client-setup"
  | "client-signin"
  /** The realtor has no free client seats. Deliberately says nothing about
   *  limits, plans or money — a buyer should never see their agent's billing
   *  status. */
  | "client-full";

export default function Portal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand: b } = useBrand();
  const {
    hydrated: authHydrated,
    isAuthenticated,
    isAdmin,
    realtorId,
    currentClientId,
    logout,
    isPreviewAdmin,
    authBypassEnabled,
    enterAuthBypass,
    realtorSignup,
    realtorLogin,
    clientSignup,
    clientLogin,
    enterGuestClient,
    enterGuestRealtor,
    lookupRealtorByCode,
  } = useAuth();
  const { prepareNewClientTour, prepareNewRealtorTour, completeInvitedClientTour } = useOnboarding();
  const [inviteTourSeen, setInviteTourSeen] = useState(false);

  const { entry: entryRaw, invite, confirmed: confirmedParam, signin } = useLocalSearchParams<{ entry?: string | string[]; invite?: string; confirmed?: string; signin?: string }>();
  // Expo Router may hand back string[]; only an explicit single "client" opens the code stage.
  // Default (missing / unknown) is the welcome gateway — never client code.
  const entryParam = Array.isArray(entryRaw) ? entryRaw[0] : entryRaw;
  const emailAlreadyConfirmed =
    confirmedParam === "1" || confirmedParam === "true" || String(confirmedParam ?? "").toLowerCase() === "yes";
  const initialStage: Stage = entryParam === "realtor" ? "realtor-signin" : entryParam === "client" ? "code" : "entry";

  const [stage, setStage] = useState<Stage>(initialStage);

  const [code, setCode] = useState<string>(invite ?? "");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [resolvedRealtorId, setResolvedRealtorId] = useState<string>("");
  const [resolvedRealtorName, setResolvedRealtorName] = useState<string>("");
  const [resolvedBrandName, setResolvedBrandName] = useState<string>("");
  const [resolvedMonogram, setResolvedMonogram] = useState<string>("");
  const [activeInviteMessage, setActiveInviteMessage] = useState('');

  /** Return to the welcome gateway and drop sticky ?entry=client so refresh cannot force the code screen. */
  const goWelcome = () => {
    setCode("");
    setEmail("");
    setPassword("");
    setName("");
    setError(null);
    setConfirmationEmail("");
    void AsyncStorage.removeItem("onboarding.pendingInvite.v1").catch(() => {});
    setStage("entry");
    router.replace("/portal");
  };

  useEffect(() => {
    let mounted = true;
    if (isAuthenticated || entryParam === "realtor") return;
    void (async () => {
      const pending = await AsyncStorage.getItem("onboarding.pendingInvite.v1");
      const accepted = invite ? { code: invite } : pending ? JSON.parse(pending) as { code: string } : null;
      if (!accepted) return;
      const record = await lookupRealtorByCode(accepted.code);
      if (!mounted || !record || !record.client_code_enabled) return;
      setResolvedRealtorId(record.id);
      setResolvedRealtorName(record.name);
      setResolvedBrandName(record.brand_name);
      setResolvedMonogram(record.monogram);
      await AsyncStorage.setItem("onboarding.pendingInvite.v1", JSON.stringify(accepted));
      setCode(accepted.code);
      const tour = await AsyncStorage.getItem(`onboarding.inviteTour.v1:${record.id}`);
      if (!mounted) return;
      setInviteTourSeen(tour === 'seen');
      setStage(signin === "1" ? "client-signin" : "client-setup");
    })().catch(() => {});
    return () => { mounted = false; };
  }, [isAuthenticated, entryParam, invite, signin, lookupRealtorByCode]);

  // Temporary AUTH_BYPASS: auto-enter admin preview when unauthenticated.
  // Do not cancel the replace when isAuthenticated flips (effect cleanup race).
  useEffect(() => {
    if (!authHydrated || !authBypassEnabled) return;
    if (isAuthenticated) {
      router.replace("/admin/");
      return;
    }
    (async () => {
      await enterAuthBypass();
      router.replace("/admin/");
    })().catch(() => {});
  }, [authHydrated, authBypassEnabled, isAuthenticated, enterAuthBypass, router]);

  // Auto-route if already authenticated (normal login — not AUTH_BYPASS).
  useEffect(() => {
    if (!authHydrated || authBypassEnabled) return;
    if (!isAuthenticated) return;
    if (isPreviewAdmin) return;
    if (entryParam === 'client' && invite) {
      let active = true;
      void lookupRealtorByCode(invite).then(async record => {
        if (!active) return;
        if (isAdmin) { setActiveInviteMessage('You are signed in as a realtor. Open this invitation in a separate browser session to view the client experience.'); return; }
        if (!record || !record.client_code_enabled) { setActiveInviteMessage('This invitation is unavailable. Your existing client account is still available.'); return; }
        if (record.id !== realtorId) { setActiveInviteMessage('This invitation belongs to a different realtor. Your current account stays connected to its realtor. Sign out to open the new invitation.'); return; }
        if (currentClientId) await completeInvitedClientTour(record.id, currentClientId);
        if (active) router.replace('/');
      }).catch(() => { if (active) setActiveInviteMessage('Could not check this invitation. Your existing account is still available.'); });
      return () => { active = false; };
    }
    if (entryParam && !(entryParam === 'client' && !isAdmin)) return;
    router.replace(isAdmin ? "/admin/" : "/");
  }, [authHydrated, authBypassEnabled, entryParam, invite, isAuthenticated, isAdmin, isPreviewAdmin, realtorId, currentClientId, lookupRealtorByCode, completeInvitedClientTour, router]);

  // Animations
  const entrance = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const stageFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [entrance]);

  const transitionTo = (next: Stage) => {
    Animated.timing(stageFade, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      setStage(next); setError(null);
      Animated.timing(stageFade, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };

  const triggerShake = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  // Submit code — guest realtor/client mint, or look up a real realtor invite
  const submitCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isRealtorAccessCode(code)) {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        const res = await enterGuestRealtor();
        if (!res.ok) {
          setError(res.error ?? "Couldn't start a guest realtor session. Please try again.");
          triggerShake();
          return;
        }
        prepareNewRealtorTour();
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Admin home → walkthrough overlay → finish routes to /admin/build.
        router.replace("/admin/");
        return;
      }
      if (isClientAccessCode(code)) {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        const res = await enterGuestClient();
        if (!res.ok) {
          setError(res.error ?? "Couldn't start a guest session. Please try again.");
          triggerShake();
          return;
        }
        prepareNewClientTour();
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Land on home so the 5-page walkthrough runs, then profile build.
        router.replace("/");
        return;
      }
      const record = await lookupRealtorByCode(code);
      if (!record || record.client_code_enabled !== true) {
        setError(record ? "This app is still being set up by your realtor." : "That code isn't recognized. Check and try again.");
        setCode(""); triggerShake(); return;
      }
      if (Platform.OS !== "web") Haptics.selectionAsync();
      await AsyncStorage.setItem("onboarding.pendingInvite.v1", JSON.stringify({ code }));
      setResolvedRealtorId(record.id);
      setResolvedRealtorName(record.name);
      setResolvedBrandName(record.brand_name || record.name.split(" ").pop()?.toUpperCase() || "");
      setResolvedMonogram(record.monogram || (record.name.split(" ")[0]?.charAt(0) ?? "") + (record.name.split(" ").pop()?.charAt(0) ?? ""));
      setInviteTourSeen((await AsyncStorage.getItem(`onboarding.inviteTour.v1:${record.id}`)) === 'seen');
      transitionTo("client-setup");
      setEmail(""); setPassword(""); setName("");
    } catch {
      setError("We couldn't check that code. Please try again.");
      triggerShake();
    } finally { setBusy(false); }
  };

  // Submit account (realtor or client)
  const submitAccount = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const success = () => { if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };

      if (stage === "realtor-setup") {
        const res = await realtorSignup({ name, email, password });
        if (!res.ok) { if (res.verificationRequired) setConfirmationEmail(email.trim().toLowerCase()); setError(res.error ?? "Couldn't create your account."); if (!res.verificationRequired) triggerShake(); return; }
        // Real realtor: signup → walkthrough → build (never land on Step 1 before tour).
        prepareNewRealtorTour();
        success(); router.replace("/admin/");
      } else if (stage === "realtor-signin") {
        const res = await realtorLogin(email, password);
        if (!res.ok) { if (res.verificationRequired) setConfirmationEmail(email.trim().toLowerCase()); setError(res.error ?? "Sign-in failed."); triggerShake(); return; }
        success(); router.replace("/admin/");
      } else if (stage === "client-setup") {
        if (!resolvedRealtorId) { setError("Please go back and enter your code first."); return; }
        const res = await clientSignup({ name, email, password, realtorId: resolvedRealtorId });
        if (res.atCapacity) { transitionTo("client-full"); return; }
        if (!res.ok || !res.clientId) { setError(res.error ?? "Couldn't create your account."); triggerShake(); return; }
        // clientSignup writes the client onto the realtor's roster keyed to the
        // resolved realtorId, so there's no session-scope race to worry about.
        //
        // Same path as guest access-code signup: 5-page walkthrough first, then
        // profile build ("How should we reach you?").
        await completeInvitedClientTour(resolvedRealtorId, res.clientId);
        success(); router.replace("/");
      } else if (stage === "client-signin") {
        if (!resolvedRealtorId) { setError("Please go back and enter your code first."); return; }
        const res = await clientLogin(email, password, resolvedRealtorId);
        if (res.atCapacity) { transitionTo("client-full"); return; }
        if (!res.ok) { setError(res.error ?? "Sign-in failed."); triggerShake(); return; }
        if (res.clientId) await completeInvitedClientTour(resolvedRealtorId, res.clientId);
        success(); router.replace("/");
      }
    } catch {
      setError("We couldn't complete sign-in. Please check your connection and try again.");
    } finally { setBusy(false); }
  };

  // Derived UI
  // App-level entry stays generic until a code resolves a specific realtor.
  const displayBrand = resolvedBrandName || "MY REALTOR";
  const displayMono = resolvedMonogram || "MR";

  const heroEyebrow =
    stage === "entry" ? "MY REALTOR APP"
    : stage === "code" ? `${displayBrand} · MEMBER`
    : stage.startsWith("realtor") ? `${displayBrand} · ADMIN`
    : `${displayBrand} · MEMBER`;

  const heroTitle =
    stage === "entry" ? "Welcome"
    : stage === "code" ? "Enter your code"
    : stage === "realtor-setup" ? "Set up your studio."
    : stage === "realtor-signin" ? "Welcome back."
    : stage === "client-setup" ? `Welcome to ${resolvedRealtorName || b.realtor.name} Realty.`
    : stage === "client-full" ? "Not open right now."
    : "Welcome back.";

  const heroSub =
    stage === "entry" ? "Choose how you'd like to continue."
    : stage === "code" ? "Enter the 6-character code your realtor shared with you."
    : stage === "realtor-setup" ? "Create your private builder account, then check your email for the confirmation link. If you already used this app, use the same email to keep your profile and clients."
    : stage === "realtor-signin" ? "Use your email and password. Prefer the confirmation link from email when signing up; an email code is available as a fallback."
    : stage === "client-setup" ? `Create your private profile. ${resolvedRealtorName?.split(" ")[0] || "Your realtor"} will see you on the roster.`
    : stage === "client-full" ? `Please contact ${resolvedRealtorName || "your agent"} about access to their app.`
    : "Sign in to your private profile.";

  const shakeStyle = { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }] };
  const heroOpacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const heroTranslate = entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  const hydrated = authHydrated;
  if (!hydrated) return <View style={[styles.root, { backgroundColor: dark.bg }]} />;
  // AUTH_BYPASS: never paint entry gateway while entering admin preview.
  if (authBypassEnabled && !isAuthenticated) {
    return <View style={[styles.root, { backgroundColor: dark.bg }]} />;
  }

  const showBack = stage !== "entry";
  const onBack = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    // Code / realtor → welcome gateway with a clean URL (no sticky entry=client).
    if (stage === "code" || stage.startsWith("realtor")) { goWelcome(); return; }
    if (stage.startsWith("client")) { transitionTo("code"); setEmail(""); setPassword(""); setName(""); return; }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View style={styles.root}>
      {/* A softly lit front door at dusk — arriving home closes the loop the
          onboarding backgrounds began, right where you sign in. */}
      <Image
        source={require("@/assets/images/login-bg-door.jpg")}
        style={styles.bgImage}
        contentFit="cover"
        contentPosition="center"
        transition={420}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        {showBack ? (
          <Pressable hitSlop={14} onPress={onBack} style={styles.iconBtn}>
            <ChevronLeft size={18} color={brand.ivory} strokeWidth={1.5} />
          </Pressable>
        ) : <View style={styles.iconBtn} />}
        <View style={{ alignItems: "center" }}>
          <Text style={styles.brandWord}>{displayBrand}</Text>
          <Text style={styles.brandSub}>PRIVATE</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <Modal visible={!!activeInviteMessage && isAuthenticated} animationType="fade" onRequestClose={() => router.replace(isAdmin ? '/admin' : '/')}>
        <View style={{ flex: 1, backgroundColor: '#080D12', padding: 28, justifyContent: 'center', gap: 24 }}>
          <Text style={{ color: '#F5EFE5', fontSize: 20, lineHeight: 30 }}>{activeInviteMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace(isAdmin ? '/admin' : '/')} style={{ padding: 16, backgroundColor: '#D4B989', borderRadius: 12 }}><Text style={{ color: '#111820' }}>Return to my account</Text></Pressable>
          {!isAdmin && <Pressable accessibilityRole="button" onPress={() => { void logout().then(() => setActiveInviteMessage('')); }} style={{ padding: 16 }}><Text style={{ color: '#D4B989' }}>Sign out and open this invitation</Text></Pressable>}
        </View>
      </Modal>
      <Modal visible={stage === 'client-setup' && !!resolvedRealtorId && !inviteTourSeen && !isAuthenticated} animationType="fade" onRequestClose={() => transitionTo('client-signin')}>
        <View style={{ flex: 1, backgroundColor: '#080D12' }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}>
            <Text style={{ color: '#F5EFE5', fontSize: 16 }}>{resolvedRealtorName} welcomes you</Text>
            <Pressable accessibilityRole="button" onPress={() => transitionTo('client-signin')} style={{ paddingVertical: 12 }}><Text style={{ color: '#D4B989' }}>Already a client? Sign in</Text></Pressable>
          </View>
          <OnboardingCarousel audience="client" onFinish={() => {
            void AsyncStorage.setItem(`onboarding.inviteTour.v1:${resolvedRealtorId}`, 'seen').then(() => setInviteTourSeen(true));
          }} />
        </View>
      </Modal>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kbd}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 20) + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          style={Platform.OS === "web" ? ({ overscrollBehaviorY: "contain" } as object) : undefined}
        >
          <Animated.View style={[styles.center, { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }]}>
            <View style={styles.monogramWrap}>
              <View style={styles.monogramRing} />
              <Text style={styles.monogram}>{displayMono}</Text>
            </View>

            <Animated.View style={{ opacity: stageFade, width: "100%" }}>
              {resolvedRealtorId && <InvitationInstall code={code} realtorName={resolvedRealtorName} />}
              <Text style={styles.eyebrow}>{heroEyebrow}</Text>
              <Text style={styles.title}>{heroTitle}</Text>
              <Text style={styles.sub}>{heroSub}</Text>

              <Animated.View style={shakeStyle}>
                {stage === "entry" ? (
                  <EntryForm
                    onRealtor={() => {
                      // Explicit realtor entry — replace sticky ?entry=client if present.
                      router.replace({ pathname: "/portal", params: { entry: "realtor" } });
                      transitionTo("realtor-signin");
                    }}
                    onClient={() => {
                      router.replace({ pathname: "/portal", params: { entry: "client" } });
                      transitionTo("code");
                    }}
                    busy={busy}
                    error={error}
                    code={code}
                    onChangeCode={setCode}
                    onSubmitCode={submitCode}
                  />
                ) : stage === "code" ? (
                  <CodeForm code={code} onChange={setCode} onSubmit={submitCode} error={error} busy={busy} />
                ) : stage === "client-full" ? (
                  <AtCapacity
                    realtorName={resolvedRealtorName}
                    realtorId={resolvedRealtorId}
                    onBack={() => { transitionTo("client-signin"); setPassword(""); }}
                  />
                ) : (
                  <><AccountForm
                    stage={stage} name={name} email={email} password={password}
                    onChangeName={setName} onChangeEmail={setEmail} onChangePassword={setPassword}
                    onSubmit={submitAccount} error={error} busy={busy}
                    onForgot={() => stage === "client-signin"
                      ? router.push({ pathname: "/client-recovery", params: { realtorId: resolvedRealtorId, invite: code, email } })
                      : router.push("/reset-password")}
                    onToggleMode={() => {
                      if (stage === "client-setup") transitionTo("client-signin");
                      else if (stage === "client-signin") transitionTo("client-setup");
                      else if (stage === "realtor-signin") transitionTo("realtor-setup");
                      else if (stage === "realtor-setup") transitionTo("realtor-signin");
                    }}
                  />
                  {stage.startsWith("realtor") && <SocialSignIn />}
                  {stage.startsWith("realtor") ? (
                    <View style={{ marginTop: 12 }}>
                      <AccessCodeContinue
                        code={code}
                        onChangeCode={setCode}
                        onSubmit={() => { void submitCode(); }}
                        busy={busy}
                        error={error}
                      />
                    </View>
                  ) : null}
                  {stage.startsWith("realtor") && emailAlreadyConfirmed ? (
                    <Text style={{ color: "#f3ead9", textAlign: "center", marginTop: 18, lineHeight: 22 }}>
                      Your email is confirmed. Sign in with your password, or request an email code below.
                    </Text>
                  ) : stage.startsWith("realtor") && (!!confirmationEmail && confirmationEmail === email.trim().toLowerCase() || stage === "realtor-setup") ? (
                    <Text style={{ color: "#f3ead9", textAlign: "center", marginTop: 18, lineHeight: 22 }}>
                      Check your email for the confirmation link. Open it on this device to finish sign-in. If the link opened elsewhere, return here and use your password or an email code.
                    </Text>
                  ) : null}
                  {stage.startsWith("realtor") && <EmailCodeSignIn email={email} confirmation={emailAlreadyConfirmed || stage === "realtor-setup" || (!!confirmationEmail && confirmationEmail === email.trim().toLowerCase())} />}
                  </>
                )}
              </Animated.View>
            </Animated.View>
          </Animated.View>

          <View style={[styles.footerInflow, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            <Text style={styles.footerText}>MY REALTOR APP · PRIVATE</Text>
            <View style={styles.footerLegal}>
              <Pressable onPress={() => router.push({ pathname: "/legal", params: { doc: "privacy" } })} hitSlop={10}>
                <Text style={styles.footerLink}>Privacy</Text>
              </Pressable>
              <Text style={styles.footerLink}>·</Text>
              <Pressable onPress={() => router.push({ pathname: "/legal", params: { doc: "terms" } })} hitSlop={10}>
                <Text style={styles.footerLink}>Terms</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Entry form: choose realtor or client ─────────────────────────────
function EntryForm({
  onRealtor, onClient, busy, error,
  code, onChangeCode, onSubmitCode,
}: {
  onRealtor: () => void;
  onClient: () => void;
  busy: boolean;
  error: string | null;
  code: string;
  onChangeCode: (v: string) => void;
  onSubmitCode: () => void;
}) {
  return (
    <View style={{ width: "100%", gap: 14 }}>
      <PressableScale onPress={onRealtor} haptic="selection" scaleTo={0.97} hitSlop={12} style={[styles.roleBtn, styles.roleBtnRealtor]}>
        <Building2 size={20} color={brand.goldLight} strokeWidth={1.6} />
        <View style={{ flex: 1 }}>
          <Text style={styles.roleBtnTitle}>Realtor Login</Text>
          <Text style={styles.roleBtnSub}>Create your branded app experience</Text>
        </View>
        <ArrowRight size={16} color={brand.goldLight} strokeWidth={1.8} />
      </PressableScale>
      <Text style={{ color: "rgba(244,239,230,0.55)", fontSize: 12, textAlign: "center", letterSpacing: 1.2, marginTop: 6 }}>Or continue with</Text>
      <SocialSignIn />
      <AccessCodeContinue
        code={code}
        onChangeCode={onChangeCode}
        onSubmit={onSubmitCode}
        busy={busy}
        error={error}
      />
      <PressableScale onPress={onClient} haptic="selection" scaleTo={0.98} hitSlop={10} style={{ paddingVertical: 12, alignItems: "center", minHeight: 44, justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.sansMedium, color: "rgba(244,239,230,0.45)", fontSize: 12, letterSpacing: 1 }}>Open full client sign-in</Text>
      </PressableScale>

    </View>
  );
}


// ── Code form ────────────────────────────────────────────────────────
function CodeForm({ code, onChange, onSubmit, error, busy }: { code: string; onChange: (v: string) => void; onSubmit: () => void; error: string | null; busy: boolean }) {
  return (
    <View style={{ width: "100%" }}>
      <View style={styles.codeInputWrap}>
        <Lock size={14} color={brand.goldLight} strokeWidth={1.6} />
        <TextInput value={code} onChangeText={(v) => onChange(v.toUpperCase())} placeholder="CLIENT CODE" placeholderTextColor="rgba(244,239,230,0.28)" autoCapitalize="characters" autoCorrect={false} autoComplete="off" autoFocus={Platform.OS !== "web"} returnKeyType="go" onSubmitEditing={onSubmit} style={styles.codeInput} maxLength={12} accessibilityLabel="Access code" />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PressableScale onPress={onSubmit} disabled={busy || !code.trim()} haptic="medium" scaleTo={0.97} hitSlop={12} style={[styles.cta, (busy || !code.trim()) && { opacity: 0.4 }]}>
        <Text style={styles.ctaText}>CONTINUE</Text>
        <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
      </PressableScale>
    </View>
  );
}

// ── At capacity ────────────────────────────────────────────────
function AtCapacity({ realtorName, realtorId, onBack }: { realtorName: string; realtorId: string | null; onBack: () => void }) {
  const first = realtorName?.split(" ")[0] || "They";
  const [contact, setContact] = useState<{email?:string;phone?:string}>({});
  useEffect(() => {
    let alive = true;
    if(realtorId && supabase) void supabase.rpc('experience_access',{p_realtor_id:realtorId}).then(({data,error}) => { if(alive && !error) setContact(data?.contact ?? {}); });
    return () => { alive = false; };
  }, [realtorId]);
  return (
    <View style={{ width: "100%" }}>
      <View style={styles.calmCard}>
        <View style={styles.calmIcon}>
          <DoorClosed size={18} color={brand.goldLight} strokeWidth={1.5} />
        </View>
        <Text style={styles.calmBody}>
          This app is currently unavailable. Please contact {first} directly
          about access. Your invitation is saved so you can try signing in again.
        </Text>
      </View>
      {contact.email ? <Pressable onPress={() => void Linking.openURL(`mailto:${contact.email}`)} style={styles.forgotRow}><Text style={styles.switchLink}>{contact.email}</Text></Pressable> : null}
      {contact.phone ? <Pressable onPress={() => void Linking.openURL(`tel:${contact.phone.replace(/[^+\d]/g,'')}`)} style={styles.forgotRow}><Text style={styles.switchLink}>{contact.phone}</Text></Pressable> : null}
      <PressableScale onPress={onBack} haptic="medium" scaleTo={0.97} hitSlop={12} style={styles.cta}>
        <Text style={styles.ctaText}>TRY SIGNING IN AGAIN</Text>
        <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
      </PressableScale>
    </View>
  );
}

// ── Account form (sign up / sign in) ─────────────────────────────────
function AccountForm({ stage, name, email, password, onChangeName, onChangeEmail, onChangePassword, onSubmit, error, busy, onToggleMode, onForgot }: { stage: Stage; name: string; email: string; password: string; onChangeName: (v: string) => void; onChangeEmail: (v: string) => void; onChangePassword: (v: string) => void; onSubmit: () => void; error: string | null; busy: boolean; onToggleMode: () => void; onForgot: () => void }) {
  const isSetup = stage === "realtor-setup" || stage === "client-setup";
  const isClient = stage === "client-setup" || stage === "client-signin";
  const cta = busy ? "WORKING…" : isSetup ? "CREATE ACCOUNT" : "SIGN IN";
  const toggleHint = isSetup ? "Already have an account?" : "New here?";
  const toggleLink = isSetup ? "Sign in" : "Create account";

  return (
    <View style={{ width: "100%" }}>
      {isSetup ? <Field label="NAME"><TextInput value={name} onChangeText={onChangeName} placeholder="Your full name" placeholderTextColor="rgba(244,239,230,0.3)" autoCapitalize="words" autoCorrect={false} style={styles.input} />
        {stage === "realtor-setup" ? <Text style={styles.fieldHelp}>This is the name that will appear in your app and profile.</Text> : null}</Field> : null}
      <Field label="EMAIL"><TextInput value={email} onChangeText={onChangeEmail} placeholder="you@example.com" placeholderTextColor="rgba(244,239,230,0.3)" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.input} /></Field>
      <Field label="PASSWORD"><TextInput value={password} onChangeText={onChangePassword} placeholder={isSetup ? "At least 6 characters" : "••••••••"} placeholderTextColor="rgba(244,239,230,0.3)" secureTextEntry style={styles.input} /></Field>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PressableScale onPress={onSubmit} disabled={busy} haptic="medium" scaleTo={0.97} hitSlop={12} style={[styles.cta, busy && { opacity: 0.5 }]}>
        <Text style={styles.ctaText}>{cta}</Text>
        <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
      </PressableScale>
      {isClient || stage === "realtor-signin" || stage === "realtor-setup" ? (
        <PressableScale onPress={onToggleMode} haptic="selection" scaleTo={0.98} hitSlop={12} style={styles.switchRow}>
          <Text style={styles.switchHint}>{toggleHint}</Text>
          <Text style={styles.switchLink}>{toggleLink}</Text>
        </PressableScale>
      ) : null}

      {/* Client recovery verifies email and retains the original profile. */}
      {(stage === "realtor-signin" || stage === "client-signin") ? (
        <PressableScale onPress={onForgot} haptic="selection" scaleTo={0.98} hitSlop={12} style={styles.forgotRow}>
          <Text style={styles.forgotText}>Forgot your password?</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg, minHeight: Platform.OS === "web" ? ("100dvh" as any) : undefined },
  bgImage: { ...StyleSheet.absoluteFill },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingBottom: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(244,239,230,0.18)", alignItems: "center", justifyContent: "center" },
  brandWord: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 18, letterSpacing: 6 },
  brandSub: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 9, letterSpacing: 3.2, marginTop: 3 },
  kbd: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "flex-start", paddingHorizontal: 28, paddingTop: 20 },
  center: { alignItems: "center", width: "100%" },
  monogramWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  monogramRing: { ...StyleSheet.absoluteFill, borderRadius: 46, borderWidth: 1, borderColor: "rgba(210,163,67,0.45)" },
  monogram: { fontFamily: fonts.serifItalic, color: brand.goldLight, fontSize: 36, letterSpacing: 1 },
  eyebrow: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 10, letterSpacing: 4, textAlign: "center", marginBottom: 18 },
  title: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, textAlign: "center", marginBottom: 14 },
  sub: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.62)", fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 36, paddingHorizontal: 12 },
  entryCodeCard: {
    width: "100%", marginTop: 4, padding: 18, borderRadius: 14, gap: 4,
    borderWidth: 1, borderColor: "rgba(244,239,230,0.18)", backgroundColor: "rgba(244,239,230,0.05)",
  },
  entryCodeEyebrow: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 10, letterSpacing: 2.8, marginBottom: 6, textAlign: "center" },
  roleBtn: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, minHeight: 56, borderWidth: 1, borderRadius: 12 },
  roleBtnRealtor: { borderColor: "rgba(210,163,67,0.4)", backgroundColor: "rgba(210,163,67,0.08)" },
  roleBtnClient: { borderColor: "rgba(244,239,230,0.15)", backgroundColor: "rgba(244,239,230,0.04)" },
  roleBtnTitle: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 15, letterSpacing: 0.3, marginBottom: 2 },
  roleBtnSub: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.5)", fontSize: 11.5 },
  calmCard: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: "rgba(210,163,67,0.28)",
    backgroundColor: "rgba(8,26,21,0.45)",
  },
  calmIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  calmBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.72)",
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: "center",
  },
  codeInputWrap: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: dark.borderGold, paddingHorizontal: 18, paddingVertical: 18, backgroundColor: dark.bgCard },
  codeInput: { flex: 1, fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 18, letterSpacing: 5, textAlign: "center", paddingVertical: 0 },
  field: { marginBottom: 18, width: "100%" },
  fieldHelp: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.55)", fontSize: 12, marginTop: 8, lineHeight: 17 },
  fieldLabel: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 10, letterSpacing: 2.8, marginBottom: 8 },
  input: { fontFamily: fonts.sans, color: brand.ivory, fontSize: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(244,239,230,0.22)" },
  error: { fontFamily: fonts.sansMedium, color: "#E8B7A6", fontSize: 11.5, letterSpacing: 0.6, marginTop: 14, textAlign: "center" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: brand.ivory, paddingVertical: 17, marginTop: 26, minHeight: 52, borderRadius: 10 },
  ctaText: { fontFamily: fonts.sansSemi, color: brand.forestDeep, fontSize: 12, letterSpacing: 3 },
  switchRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 22 },
  switchHint: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.55)", fontSize: 12 },
  switchLink: { fontFamily: fonts.sansSemi, color: brand.goldLight, fontSize: 12, letterSpacing: 1.2 },
  footerInflow: { alignItems: "center", justifyContent: "center", paddingTop: 36, marginTop: 28, width: "100%", borderTopWidth: 1, borderTopColor: "rgba(244,239,230,0.08)" },
  forgotRow: { alignItems: "center", marginTop: 18, paddingTop: 14, paddingBottom: 14, minHeight: 48 },
  forgotText: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.5)",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  footerText: { fontFamily: fonts.sansMedium, color: "rgba(244,239,230,0.4)", fontSize: 11, letterSpacing: 3, textAlign: "center" },
  footerLegal: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  footerLink: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.35)", fontSize: 11 },
});
