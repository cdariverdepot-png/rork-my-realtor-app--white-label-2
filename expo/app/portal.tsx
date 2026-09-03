import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import { ArrowRight, ChevronLeft, Lock, Building2, User, Eye, DoorClosed } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";

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
    isPreviewAdmin,
    previewAdmin,
    enterDemoView,
    realtorSignup,
    realtorLogin,
    clientSignup,
    clientLogin,
    lookupRealtorByCode,
  } = useAuth();

  const entryParam = useLocalSearchParams<{ entry?: string }>().entry;
  const initialStage: Stage = entryParam === "realtor" ? "realtor-signin" : entryParam === "client" ? "code" : "entry";

  const [stage, setStage] = useState<Stage>(initialStage);
  const [code, setCode] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedRealtorId, setResolvedRealtorId] = useState<string>("");
  const [resolvedRealtorName, setResolvedRealtorName] = useState<string>("");
  const [resolvedBrandName, setResolvedBrandName] = useState<string>("");
  const [resolvedMonogram, setResolvedMonogram] = useState<string>("");

  // Auto-route if already authenticated
  useEffect(() => {
    if (!authHydrated) return;
    if (entryParam) return;
    if (!isAuthenticated) return;
    if (isPreviewAdmin) return;
    router.replace(isAdmin ? "/admin" : "/");
  }, [authHydrated, entryParam, isAuthenticated, isAdmin, isPreviewAdmin, router]);

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

  // Submit code — look up the realtor
  const submitCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const record = await lookupRealtorByCode(code);
      if (!record) {
        setError("That code isn't recognized. Check and try again.");
        setCode(""); triggerShake(); return;
      }
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setResolvedRealtorId(record.id);
      setResolvedRealtorName(record.name);
      setResolvedBrandName(record.brand_name || record.name.split(" ").pop()?.toUpperCase() || "");
      setResolvedMonogram(record.monogram || (record.name.split(" ")[0]?.charAt(0) ?? "") + (record.name.split(" ").pop()?.charAt(0) ?? ""));
      transitionTo("client-setup");
      setEmail(""); setPassword(""); setName("");
    } finally { setBusy(false); }
  };

  // Explore Demo — enter the immutable Eliza Vance showcase
  const handleExploreDemo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      await previewAdmin();
      // Suppress admin redirect and lock the demo brand so only Eliza Vance shows.
      enterDemoView();
      router.replace("/");
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
        if (!res.ok) { setError(res.error ?? "Couldn't create your account."); triggerShake(); return; }
        success(); router.replace("/admin/build");
      } else if (stage === "realtor-signin") {
        const res = await realtorLogin(email, password);
        if (!res.ok) { setError(res.error ?? "Sign-in failed."); triggerShake(); return; }
        success(); router.replace("/admin");
      } else if (stage === "client-setup") {
        if (!resolvedRealtorId) { setError("Please go back and enter your code first."); return; }
        const res = await clientSignup({ name, email, password, realtorId: resolvedRealtorId });
        if (res.atCapacity) { transitionTo("client-full"); return; }
        if (!res.ok || !res.clientId) { setError(res.error ?? "Couldn't create your account."); triggerShake(); return; }
        // clientSignup writes the client onto the realtor's roster keyed to the
        // resolved realtorId, so there's no session-scope race to worry about.
        //
        // Straight into intake, mirroring how a new realtor lands in /admin/build.
        // Asking now — while they're still in setup mode and motivated — gets a
        // far better answer rate than a prompt buried in an account screen later.
        success(); router.replace("/client-profile");
      } else if (stage === "client-signin") {
        if (!resolvedRealtorId) { setError("Please go back and enter your code first."); return; }
        const res = await clientLogin(email, password, resolvedRealtorId);
        if (res.atCapacity) { transitionTo("client-full"); return; }
        if (!res.ok) { setError(res.error ?? "Sign-in failed."); triggerShake(); return; }
        success(); router.replace("/");
      }
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
    : stage === "realtor-setup" ? "You'll manage your listings, brand, and clients from here."
    : stage === "realtor-signin" ? "Sign back into your admin studio."
    : stage === "client-setup" ? `Create your private profile. ${resolvedRealtorName?.split(" ")[0] || "Your realtor"} will see you on the roster.`
    : stage === "client-full" ? `${resolvedRealtorName?.split(" ")[0] || "This agent"} isn't accepting new clients at the moment.`
    : "Sign in to your private profile.";

  const shakeStyle = { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }] };
  const heroOpacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const heroTranslate = entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  const hydrated = authHydrated;
  if (!hydrated) return <View style={[styles.root, { backgroundColor: dark.bg }]} />;

  const showBack = stage !== "entry";
  const onBack = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (stage === "code") { transitionTo("entry"); setCode(""); return; }
    if (stage.startsWith("client")) { transitionTo("code"); setEmail(""); setPassword(""); setName(""); return; }
    if (stage.startsWith("realtor")) { transitionTo("entry"); setEmail(""); setPassword(""); setName(""); return; }
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

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kbd}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.center, { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }]}>
            <View style={styles.monogramWrap}>
              <View style={styles.monogramRing} />
              <Text style={styles.monogram}>{displayMono}</Text>
            </View>

            <Animated.View style={{ opacity: stageFade, width: "100%" }}>
              <Text style={styles.eyebrow}>{heroEyebrow}</Text>
              <Text style={styles.title}>{heroTitle}</Text>
              <Text style={styles.sub}>{heroSub}</Text>

              <Animated.View style={shakeStyle}>
                {stage === "entry" ? (
                  <EntryForm onRealtor={() => transitionTo("realtor-signin")} onClient={() => transitionTo("code")} onExploreDemo={handleExploreDemo} busy={busy} error={error} />
                ) : stage === "code" ? (
                  <CodeForm code={code} onChange={setCode} onSubmit={submitCode} error={error} busy={busy} />
                ) : stage === "client-full" ? (
                  <AtCapacity
                    realtorName={resolvedRealtorName}
                    onBack={() => { transitionTo("code"); setCode(""); setEmail(""); setPassword(""); setName(""); }}
                  />
                ) : (
                  <AccountForm
                    stage={stage} name={name} email={email} password={password}
                    onChangeName={setName} onChangeEmail={setEmail} onChangePassword={setPassword}
                    onSubmit={submitAccount} error={error} busy={busy}
                    onForgot={() => router.push("/reset-password")}
                    onToggleMode={() => {
                      if (stage === "client-setup") transitionTo("client-signin");
                      else if (stage === "client-signin") transitionTo("client-setup");
                      else if (stage === "realtor-signin") transitionTo("realtor-setup");
                      else if (stage === "realtor-setup") transitionTo("realtor-signin");
                    }}
                  />
                )}
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.footerText}>MY REALTOR APP · PRIVATE</Text>
        <View style={styles.footerLegal}>
          <Pressable onPress={() => router.push({ pathname: "/legal", params: { doc: "privacy" } })} hitSlop={8}>
            <Text style={styles.footerLink}>Privacy</Text>
          </Pressable>
          <Text style={styles.footerLink}>·</Text>
          <Pressable onPress={() => router.push({ pathname: "/legal", params: { doc: "terms" } })} hitSlop={8}>
            <Text style={styles.footerLink}>Terms</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Entry form: choose realtor or client ─────────────────────────────
function EntryForm({ onRealtor, onClient, onExploreDemo, busy, error }: { onRealtor: () => void; onClient: () => void; onExploreDemo: () => void; busy: boolean; error: string | null }) {
  return (
    <View style={{ width: "100%", gap: 14 }}>
      <Pressable onPress={onRealtor} style={({ pressed }) => [styles.roleBtn, styles.roleBtnRealtor, pressed && { opacity: 0.85 }]}>
        <Building2 size={20} color={brand.goldLight} strokeWidth={1.6} />
        <View style={{ flex: 1 }}>
          <Text style={styles.roleBtnTitle}>Realtor Login</Text>
          <Text style={styles.roleBtnSub}>Create your branded app experience</Text>
        </View>
        <ArrowRight size={16} color={brand.goldLight} strokeWidth={1.8} />
      </Pressable>
      <Pressable onPress={onClient} style={({ pressed }) => [styles.roleBtn, styles.roleBtnClient, pressed && { opacity: 0.85 }]}>
        <User size={20} color={brand.ivory} strokeWidth={1.6} />
        <View style={{ flex: 1 }}>
          <Text style={styles.roleBtnTitle}>Client Login</Text>
          <Text style={styles.roleBtnSub}>Connect to your realtor with a code</Text>
        </View>
        <ArrowRight size={16} color={brand.ivory} strokeWidth={1.8} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={onExploreDemo} disabled={busy} style={({ pressed }) => [styles.demoBtn, pressed && { opacity: 0.6 }]}>
        <Eye size={14} color="rgba(244,239,230,0.45)" strokeWidth={1.4} />
        <Text style={styles.demoText}>Explore Demo</Text>
      </Pressable>
    </View>
  );
}

// ── Code form ────────────────────────────────────────────────────────
function CodeForm({ code, onChange, onSubmit, error, busy }: { code: string; onChange: (v: string) => void; onSubmit: () => void; error: string | null; busy: boolean }) {
  return (
    <View style={{ width: "100%" }}>
      <View style={styles.codeInputWrap}>
        <Lock size={14} color={brand.goldLight} strokeWidth={1.6} />
        <TextInput value={code} onChangeText={(v) => onChange(v.toUpperCase())} placeholder="CLIENT CODE" placeholderTextColor="rgba(244,239,230,0.28)" autoCapitalize="characters" autoCorrect={false} autoComplete="off" autoFocus={Platform.OS !== "web"} returnKeyType="go" onSubmitEditing={onSubmit} style={styles.codeInput} maxLength={8} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={onSubmit} disabled={busy || !code.trim()} style={({ pressed }) => [styles.cta, (busy || !code.trim()) && { opacity: 0.4 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
        <Text style={styles.ctaText}>CONTINUE</Text>
        <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

// ── At capacity ────────────────────────────────────────────────
function AtCapacity({ realtorName, onBack }: { realtorName: string; onBack: () => void }) {
  const first = realtorName?.split(" ")[0] || "They";
  return (
    <View style={{ width: "100%" }}>
      <View style={styles.calmCard}>
        <View style={styles.calmIcon}>
          <DoorClosed size={18} color={brand.goldLight} strokeWidth={1.5} />
        </View>
        <Text style={styles.calmBody}>
          {first} will be able to add you once a place opens up. Reach out to
          them directly and they&apos;ll let you know.
        </Text>
      </View>
      <Pressable onPress={onBack} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
        <Text style={styles.ctaText}>TRY A DIFFERENT CODE</Text>
        <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
      </Pressable>
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
      {isSetup ? <Field label="NAME"><TextInput value={name} onChangeText={onChangeName} placeholder="Your full name" placeholderTextColor="rgba(244,239,230,0.3)" autoCapitalize="words" autoCorrect={false} style={styles.input} /></Field> : null}
      <Field label="EMAIL"><TextInput value={email} onChangeText={onChangeEmail} placeholder="you@example.com" placeholderTextColor="rgba(244,239,230,0.3)" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.input} /></Field>
      <Field label="PASSWORD"><TextInput value={password} onChangeText={onChangePassword} placeholder={isSetup ? "At least 6 characters" : "••••••••"} placeholderTextColor="rgba(244,239,230,0.3)" secureTextEntry style={styles.input} /></Field>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={onSubmit} disabled={busy} style={({ pressed }) => [styles.cta, busy && { opacity: 0.5 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
        <Text style={styles.ctaText}>{cta}</Text>
        <ArrowRight size={15} color={brand.forestDeep} strokeWidth={2} />
      </Pressable>
      {isClient || stage === "realtor-signin" || stage === "realtor-setup" ? (
        <Pressable onPress={onToggleMode} hitSlop={10} style={styles.switchRow}>
          <Text style={styles.switchHint}>{toggleHint}</Text>
          <Text style={styles.switchLink}>{toggleLink}</Text>
        </Pressable>
      ) : null}

      {/* Recovery is offered to realtors only. A locked-out realtor loses their
          entire studio; a locked-out client can be re-invited by their agent in
          seconds, and email delivery is the slower, more failure-prone path. */}
      {stage === "realtor-signin" ? (
        <Pressable onPress={onForgot} hitSlop={10} style={styles.forgotRow}>
          <Text style={styles.forgotText}>Forgot your password?</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  bgImage: { ...StyleSheet.absoluteFillObject },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingBottom: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(244,239,230,0.18)", alignItems: "center", justifyContent: "center" },
  brandWord: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 18, letterSpacing: 6 },
  brandSub: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 9, letterSpacing: 3.2, marginTop: 3 },
  kbd: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingTop: 24 },
  center: { alignItems: "center", width: "100%" },
  monogramWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  monogramRing: { ...StyleSheet.absoluteFillObject, borderRadius: 46, borderWidth: 1, borderColor: "rgba(210,163,67,0.45)" },
  monogram: { fontFamily: fonts.serifItalic, color: brand.goldLight, fontSize: 36, letterSpacing: 1 },
  eyebrow: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 10, letterSpacing: 4, textAlign: "center", marginBottom: 18 },
  title: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, textAlign: "center", marginBottom: 14 },
  sub: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.62)", fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 36, paddingHorizontal: 12 },
  roleBtn: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderWidth: 1, borderRadius: 12 },
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
  fieldLabel: { fontFamily: fonts.sansMedium, color: brand.goldLight, fontSize: 10, letterSpacing: 2.8, marginBottom: 8 },
  input: { fontFamily: fonts.sans, color: brand.ivory, fontSize: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(244,239,230,0.22)" },
  error: { fontFamily: fonts.sansMedium, color: "#E8B7A6", fontSize: 11.5, letterSpacing: 0.6, marginTop: 14, textAlign: "center" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: brand.ivory, paddingVertical: 17, marginTop: 26 },
  ctaText: { fontFamily: fonts.sansSemi, color: brand.forestDeep, fontSize: 12, letterSpacing: 3 },
  demoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, marginTop: 4 },
  demoText: { fontFamily: fonts.sansMedium, color: "rgba(244,239,230,0.45)", fontSize: 13, letterSpacing: 1.2 },
  switchRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 22 },
  switchHint: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.55)", fontSize: 12 },
  switchLink: { fontFamily: fonts.sansSemi, color: brand.goldLight, fontSize: 12, letterSpacing: 1.2 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingTop: 10, paddingHorizontal: 28 },
  forgotRow: { alignItems: "center", paddingTop: 4, paddingBottom: 10 },
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
