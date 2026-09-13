import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { PickerField, MultiPickerField } from "@/components/PickerField";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useListings } from "@/contexts/ListingsContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import { uploadJpegToStorage } from "@/lib/imageUpload";
import type { CatalogueOption } from "@/constants/catalogues";
import {
  arr,
  completion,
  missingRequired,
  str,
  visibleFields,
  visibleSteps,
  type ProfileAnswers,
  type ProfileField,
} from "@/constants/clientProfile";

const ACCENT = SCREEN_ACCENT.clientProfile;

/**
 * The client's guided intake.
 *
 * Mirrors the realtor's own onboarding in shape — one question set per screen,
 * a progress rail, the same picker sheets — because the two sides of this app
 * should feel like one product. It differs in one deliberate way: the realtor's
 * setup is a gate (there is genuinely no client app until it is done), whereas
 * this is a guided path a client can step off. Blocking a buyer from looking at
 * houses until they disclose their finances would cost the realtor the client,
 * which is the opposite of the point.
 *
 * Every step writes as it is completed, so a profile abandoned at step three is
 * still three steps of intelligence the agent did not have before.
 */
export default function ClientProfileFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEditing = params.edit === "1";

  const { session, isClient, hydrated: authHydrated, updateClientProfile } = useAuth();
  const { brand: b } = useBrand();
  const { all: allListings } = useListings();
  const {
    hydrated: profileHydrated,
    myAnswers,
    myProfileShared,
    saveAnswers,
    completeProfile,
  } = useClientProfiles();

  const [answers, setAnswers] = useState<ProfileAnswers>({});
  const [seeded, setSeeded] = useState<boolean>(false);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [showErrors, setShowErrors] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;

  /**
   * Seed from whatever is already known: saved answers first, then the account
   * itself. Nobody should have to type their own name into an app they are
   * already signed in to.
   */
  useEffect(() => {
    if (seeded || !profileHydrated || !authHydrated) return;
    const base: ProfileAnswers = { ...myAnswers };
    if (!base.fullName && session?.name) base.fullName = session.name;
    if (!base.preferredName && session?.name) {
      base.preferredName = session.name.split(" ")[0] ?? "";
    }
    setAnswers(base);
    if (!isEditing) {
      const requiredSteps = visibleSteps(base).map(s => ({ ...s, fields: s.fields.filter(f => f.required) })).filter(s => s.fields.length > 0);
      const resumeAt = requiredSteps.findIndex(s => missingRequired(s, base).length > 0);
      setStepIndex(resumeAt < 0 ? Math.max(0, requiredSteps.length - 1) : resumeAt);
    }
    setSeeded(true);
  }, [seeded, profileHydrated, authHydrated, myAnswers, session, isEditing]);

  const steps = useMemo(() => {
    const available = visibleSteps(answers);
    return isEditing ? available : available.map(s => ({ ...s, fields: s.fields.filter(f => f.required) })).filter(s => s.fields.length > 0);
  }, [answers, isEditing]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const total = steps.length;
  const pct = total === 0 ? 0 : (stepIndex + 1) / total;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: done ? 1 : pct,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, done, progress]);

  /** Areas offered are the neighborhoods this realtor actually lists in. */
  const neighborhoodOptions = useMemo<CatalogueOption[]>(() => {
    const seen = new Set<string>();
    const out: CatalogueOption[] = [];
    for (const l of allListings) {
      const n = (l.neighborhood ?? "").trim();
      if (!n || seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      out.push({ value: n, label: n });
    }
    return out.sort((x, y) => x.label.localeCompare(y.label));
  }, [allListings]);

  const setValue = useCallback((id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    saveAnswers({ [id]: value });
  }, [saveAnswers]);

  const transition = useCallback(
    (mutate: () => void) => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        mutate();
        Animated.timing(fade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    },
    [fade]
  );

  const persistStep = useCallback(() => {
    if (!step) return;
    const patch: ProfileAnswers = {};
    for (const f of visibleFields(step, answers)) {
      const v = answers[f.id];
      if (v !== undefined) patch[f.id] = v;
    }
    if (Object.keys(patch).length > 0) saveAnswers(patch);
  }, [step, answers, saveAnswers]);

  const finish = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
    await completeProfile(answers);
    // Keep the account's display name in step with what they told us here.
    const full = str(answers, "fullName").trim();
    if (full && full !== session?.name) void updateClientProfile({ name: full });
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    transition(() => setDone(true));
    } catch (error) {
      Alert.alert("Couldn’t finish setup", error instanceof Error ? error.message : "Please try again.");
    } finally { setSaving(false); }
  }, [answers, completeProfile, session, updateClientProfile, transition, saving]);

  const goNext = useCallback(() => {
    if (!step) return;
    const missing = missingRequired(step, answers);
    if (missing.length > 0) {
      setShowErrors(true);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
      return;
    }
    setShowErrors(false);
    persistStep();
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    if (stepIndex >= total - 1) {
      finish();
      return;
    }
    transition(() => setStepIndex((i) => i + 1));
  }, [step, answers, persistStep, stepIndex, total, finish, transition]);

  const goSkip = useCallback(() => {
    setShowErrors(false);
    persistStep();
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    if (stepIndex >= total - 1) {
      finish();
      return;
    }
    transition(() => setStepIndex((i) => i + 1));
  }, [persistStep, stepIndex, total, finish, transition]);

  const goBack = useCallback(() => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setShowErrors(false);
    if (stepIndex === 0) {
      router.back();
      return;
    }
    persistStep();
    transition(() => setStepIndex((i) => Math.max(0, i - 1)));
  }, [stepIndex, router, persistStep, transition]);

  /** Leaving early is allowed and saves — the alternative is losing the lot. */
  const leave = useCallback(() => {
    persistStep();
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    router.back();
  }, [persistStep, router]);

  const pickPhoto = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      let uri = asset.uri;
      if (asset.base64) {
        const hosted = await uploadJpegToStorage(asset.base64);
        // Falling back to the local uri keeps the photo visible on this device
        // even when Storage is unreachable; it re-uploads on the next edit.
        uri = hosted ?? `data:image/jpeg;base64,${asset.base64}`;
      }
      setValue("photo", uri);
      saveAnswers({ photo: uri });
    } catch (e) {
      console.log("[clientProfile] photo pick", e);
    } finally {
      setUploading(false);
    }
  }, [setValue, saveAnswers]);

  const realtorFirst = (b.realtor.name ?? "").split(" ")[0] || "your agent";

  if (!authHydrated || !profileHydrated || !seeded) {
    return <View style={styles.root} />;
  }

  if (!isClient) {
    return (
      <View style={styles.root}>
        <ScreenBackdrop screen="clientProfile" intensity="deep" />
        <View style={[styles.blocked, { paddingTop: insets.top + 80 }]}>
          <Lock size={20} color={ACCENT} strokeWidth={1.6} />
          <Text style={styles.blockedTitle}>This is a client profile.</Text>
          <Text style={styles.blockedBody}>
            Sign in as a client to fill one in.
          </Text>
          <Pressable onPress={() => router.back()} style={styles.blockedBtn}>
            <Text style={styles.blockedBtnText}>GO BACK</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (done) {
    return (
      <Confirmation
        realtorFirst={realtorFirst}
        answers={answers}
        insets={insets}
        onDone={() => router.replace("/")}
        onReview={() => {
          setDone(false);
          setStepIndex(0);
        }}
      />
    );
  }

  const missingIds = new Set(showErrors ? missingRequired(step, answers).map((f) => f.id) : []);
  const fields = visibleFields(step, answers);
  const isLast = stepIndex >= total - 1;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScreenBackdrop screen="clientProfile" intensity="deep" />

      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable hitSlop={12} onPress={goBack} style={styles.iconBtn}>
          <ArrowLeft size={17} color={brand.ivory} strokeWidth={1.6} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.chromeTitle}>YOUR PROFILE</Text>
          <Text style={styles.chromeSub}>
            {(b.realtor.brandName || "MY REALTOR").toUpperCase()} PRIVATE
          </Text>
        </View>
        <Pressable hitSlop={12} onPress={leave} style={styles.iconBtn}>
          <X size={17} color={brand.ivory} strokeWidth={1.6} />
        </Pressable>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {stepIndex + 1} / {total}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fade }}>
          <View style={styles.head}>
            <Text style={styles.eyebrow}>{step.eyebrow}</Text>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.blurb}>{step.blurb}</Text>
          </View>

          {fields.map((f) => (
            <FieldRenderer
              key={f.id}
              field={f}
              answers={answers}
              invalid={missingIds.has(f.id)}
              neighborhoodOptions={neighborhoodOptions}
              uploading={uploading}
              onChange={setValue}
              onPickPhoto={pickPhoto}
            />
          ))}

          {stepIndex === 0 ? (
            <View style={styles.privacy}>
              <ShieldCheck size={13} color={ACCENT} strokeWidth={1.7} />
              <Text style={styles.privacyText}>
                Only {realtorFirst} sees this. It is never shown to other clients and never
                sold on.
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {showErrors && missingIds.size > 0 ? (
          <Text style={styles.errorLine}>
            {missingIds.size === 1
              ? "One answer still needed above."
              : `${missingIds.size} answers still needed above.`}
          </Text>
        ) : null}
        <View style={styles.footerRow}>
          {step.optional ? (
            <Pressable
              onPress={goSkip}
              style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.skipText}>SKIP FOR NOW</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable
            onPress={goNext}
            disabled={saving}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}
          >
            <Text style={styles.ctaText}>
              {saving ? "SAVING…" : isLast ? (myProfileShared ? "SAVE CHANGES" : "SAVE & CONTINUE") : "CONTINUE"}
            </Text>
            <ArrowRight size={15} color={dark.bg} strokeWidth={2.2} />
          </Pressable>
        </View>
        {!isEditing && !myProfileShared ? (
          <Text style={styles.footNote}>Your answers save as you go.</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/* --------------------------- field rendering --------------------------- */

function FieldRenderer({
  field,
  answers,
  invalid,
  neighborhoodOptions,
  uploading,
  onChange,
  onPickPhoto,
}: {
  field: ProfileField;
  answers: ProfileAnswers;
  invalid: boolean;
  neighborhoodOptions: CatalogueOption[];
  uploading: boolean;
  onChange: (id: string, value: string | string[]) => void;
  onPickPhoto: () => void;
}) {
  const options = field.optionsKey === "neighborhoods" ? neighborhoodOptions : field.options ?? [];

  if (field.kind === "single") {
    return (
      <View style={invalid ? styles.invalidWrap : undefined}>
        <PickerField
          label={field.label}
          value={str(answers, field.id)}
          onChange={(v) => onChange(field.id, v)}
          options={options}
          placeholder={field.placeholder}
          hint={invalid ? "Needed to continue." : field.hint}
          allowCustom={field.allowCustom}
          sheetTitle={field.label}
        />
      </View>
    );
  }

  if (field.kind === "multi") {
    return (
      <MultiPickerField
        label={field.label}
        values={arr(answers, field.id)}
        onChange={(v) => onChange(field.id, v)}
        options={options}
        hint={field.hint}
        allowCustom={field.allowCustom}
        emptyText="CHOOSE"
        sheetTitle={field.label}
      />
    );
  }

  if (field.kind === "photo") {
    const uri = str(answers, field.id);
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Pressable
          onPress={onPickPhoto}
          disabled={uploading}
          style={({ pressed }) => [styles.photoRow, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Choose a profile photo"
        >
          <View style={styles.photoWell}>
            {uri ? (
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : uploading ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <Camera size={18} color={brand.textOnDarkMuted} strokeWidth={1.6} />
            )}
          </View>
          <Text style={styles.photoText}>
            {uploading ? "Uploading…" : uri ? "Change photo" : "Add a photo"}
          </Text>
        </Pressable>
        {field.hint ? <Text style={styles.fieldHint}>{field.hint}</Text> : null}
      </View>
    );
  }

  const long = field.kind === "longtext";
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <TextInput
        value={str(answers, field.id)}
        onChangeText={(v) => onChange(field.id, v)}
        placeholder={field.placeholder}
        placeholderTextColor={brand.textOnDarkDim}
        style={[styles.input, long && styles.inputLong, invalid && styles.inputInvalid]}
        multiline={long}
        keyboardType={field.kind === "phone" ? "phone-pad" : "default"}
        autoCapitalize={field.kind === "phone" ? "none" : "words"}
        autoCorrect={false}
      />
      {invalid ? (
        <Text style={styles.fieldError}>Needed to continue.</Text>
      ) : field.hint ? (
        <Text style={styles.fieldHint}>{field.hint}</Text>
      ) : null}
    </View>
  );
}

/* ---------------------------- confirmation ---------------------------- */

/**
 * The moment the profile lands with the realtor.
 *
 * Deliberately concrete rather than a generic "Success!": it names who received
 * it and what they now know, because the whole reason a client filled this in
 * was to be understood by a specific person.
 */
function Confirmation({
  realtorFirst,
  answers,
  insets,
  onDone,
  onReview,
}: {
  realtorFirst: string;
  answers: ProfileAnswers;
  insets: { top: number; bottom: number };
  onDone: () => void;
  onReview: () => void;
}) {
  const pop = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const { done, total } = completion(answers);

  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(rise, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [pop, rise]);

  const name = str(answers, "preferredName") || str(answers, "fullName");

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="clientProfile" intensity="deep" />
      <View style={[styles.confirmWrap, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 32 }]}>
        <Animated.View
          style={[
            styles.confirmSeal,
            { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] },
          ]}
        >
          <Check size={26} color={ACCENT} strokeWidth={2.4} />
        </Animated.View>

        <Animated.View
          style={{
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            alignItems: "center",
          }}
        >
          <Text style={styles.confirmEyebrow}>SHARED WITH YOUR AGENT</Text>
          <Text style={styles.confirmTitle}>
            {name ? `Thank you, ${name}.` : "Thank you."}
          </Text>
          <Text style={styles.confirmBody}>
            {realtorFirst} has your profile and can start lining up homes against it. You&apos;ll
            hear from them the way you asked to be contacted.
          </Text>

          <View style={styles.confirmMeter}>
            <Text style={styles.confirmMeterText}>
              {done} of {total} answered
            </Text>
            <View style={styles.confirmMeterTrack}>
              <View
                style={[
                  styles.confirmMeterFill,
                  { width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.confirmMeterHint}>
              {done < total
                ? "You can fill in the rest any time from your account."
                : "Everything answered."}
            </Text>
          </View>
        </Animated.View>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={onDone}
          style={({ pressed }) => [styles.cta, styles.confirmCta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.ctaText}>START LOOKING</Text>
          <ArrowRight size={15} color={dark.bg} strokeWidth={2.2} />
        </Pressable>
        <Pressable onPress={onReview} hitSlop={10} style={styles.confirmReview}>
          <Text style={styles.confirmReviewText}>Review my answers</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* -------------------------------- styles -------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.22)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,10,9,0.4)",
  },
  chromeTitle: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 11.5, letterSpacing: 3.4 },
  chromeSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.5)",
    fontSize: 8.5,
    letterSpacing: 2,
    marginTop: 3,
  },

  progressWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: { height: 2, borderRadius: 999, backgroundColor: ACCENT },
  progressText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkDim,
    fontSize: 10,
    letterSpacing: 1.4,
  },

  head: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 4 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9.5,
    letterSpacing: 3,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  blurb: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.62)",
    fontSize: 13.5,
    lineHeight: 20,
  },

  fieldWrap: { paddingHorizontal: 24, marginTop: 18 },
  fieldLabel: {
    fontFamily: fonts.sansSemi,
    color: brand.textOnDarkMuted,
    fontSize: 9.5,
    letterSpacing: 2,
    marginBottom: 9,
  },
  input: {
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
    fontFamily: fonts.sans,
    color: brand.textOnDark,
    fontSize: 14,
  },
  inputLong: {
    height: 104,
    paddingTop: 13,
    textAlignVertical: "top",
  },
  inputInvalid: { borderColor: "rgba(229,102,79,0.7)" },
  invalidWrap: { borderLeftWidth: 2, borderLeftColor: "rgba(229,102,79,0.7)" },
  fieldHint: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 7,
  },
  fieldError: {
    fontFamily: fonts.sansMedium,
    color: "#E8B7A6",
    fontSize: 11,
    marginTop: 7,
  },

  photoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  photoWell: {
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
  },
  photoText: { fontFamily: fonts.sansMedium, color: brand.textOnDark, fontSize: 13.5 },

  privacy: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 24,
    marginTop: 26,
    padding: 14,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.28),
    backgroundColor: tint(ACCENT, 0.07),
  },
  privacyText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.68)",
    fontSize: 12,
    lineHeight: 17,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(8,9,12,0.88)",
  },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  errorLine: {
    fontFamily: fonts.sansMedium,
    color: "#E8B7A6",
    fontSize: 11.5,
    marginBottom: 10,
    textAlign: "center",
  },
  skipBtn: { flex: 1, paddingVertical: 15 },
  skipText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 10.5,
    letterSpacing: 2,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  ctaText: { fontFamily: fonts.sansSemi, color: dark.bg, fontSize: 11.5, letterSpacing: 2.2 },
  footNote: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 10.5,
    textAlign: "center",
    marginTop: 10,
  },

  blocked: { flex: 1, alignItems: "center", paddingHorizontal: 34, gap: 12 },
  blockedTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 22, marginTop: 8 },
  blockedBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 13.5,
    textAlign: "center",
  },
  blockedBtn: {
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.4),
  },
  blockedBtnText: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 10.5,
    letterSpacing: 2,
  },

  confirmWrap: { flex: 1, alignItems: "center", paddingHorizontal: 30 },
  confirmSeal: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.5),
    backgroundColor: tint(ACCENT, 0.14),
    marginBottom: 28,
  },
  confirmEyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9.5,
    letterSpacing: 3,
    marginBottom: 14,
  },
  confirmTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    textAlign: "center",
    marginBottom: 14,
  },
  confirmBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.66)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  confirmMeter: {
    alignSelf: "stretch",
    marginTop: 30,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.035)",
    gap: 10,
  },
  confirmMeterText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDark,
    fontSize: 11.5,
    letterSpacing: 1.4,
  },
  confirmMeterTrack: {
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  confirmMeterFill: { height: 2, borderRadius: 999, backgroundColor: ACCENT },
  confirmMeterHint: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11,
    lineHeight: 16,
  },
  confirmCta: { alignSelf: "stretch" },
  confirmReview: { paddingVertical: 14 },
  confirmReviewText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 13,
  },
});
