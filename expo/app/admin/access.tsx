import React, { useEffect } from "react";
import { backOr } from "@/lib/navIntent";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  Copy,
  Lock,
  ShieldCheck,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAccess } from "@/contexts/AccessContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * /admin/access — manage the client access code.
 *
 * The realtor code is delivered out-of-band and intentionally never
 * appears on this screen.
 */
export default function AccessSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated } = useAuth();
  const {
    clientCodeEnabled,
    clientCode,
    setClientCodeEnabled,
  } = useAccess();

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const tap = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const copy = async () => {
    await Clipboard.setStringAsync(clientCode);
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (Platform.OS === "web") {
      console.log("[access] code copied");
    } else {
      Alert.alert("Copied", "Client access code copied to clipboard.");
    }
  };

  if (!hydrated || !isAdmin) {
    return <View style={{ flex: 1, backgroundColor: dark.bg }} />;
  }

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable hitSlop={12} onPress={() => backOr(router)} style={styles.iconBtn}>
          <ArrowLeft size={18} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <Text style={styles.topTitle}>ACCESS</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>PRIVATE ACCESS · CLIENTS</Text>
        <Text style={styles.title}>Control who enters your app.</Text>
        <Text style={styles.sub}>
          Share this code with clients you've personally invited. They'll need it to sign up. Turn the requirement off if you want anyone you've shared the app with to be able to sign up directly.
        </Text>

        <View style={styles.permanentRow}>
          <Lock size={11} color={brand.goldLight} strokeWidth={1.7} />
          <Text style={styles.permanentText}>
            PERMANENT · BOUND TO YOUR ACCOUNT
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View>
              <Text style={styles.cardEyebrow}>CLIENT CODE</Text>
              <Text style={styles.cardHint}>
                {clientCodeEnabled ? "Invitations enabled" : "New invitations paused"}
              </Text>
            </View>
            <Switch
              value={clientCodeEnabled}
              onValueChange={(v) => {
                tap();
                setClientCodeEnabled(v);
              }}
              trackColor={{ false: "rgba(244,239,230,0.18)", true: brand.gold }}
              thumbColor={brand.ivory}
              ios_backgroundColor="rgba(244,239,230,0.18)"
            />
          </View>

          <View style={styles.codeBlock}>
            <Text style={styles.codeValue}>{clientCode}</Text>
            <View style={styles.actionsRow}>
              <Pressable onPress={() => { tap(); copy(); }} style={styles.actionBtn}>
                <Copy size={14} color={brand.goldLight} strokeWidth={1.6} />
                <Text style={styles.actionText}>Copy</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <ShieldCheck size={16} color={brand.gold} strokeWidth={1.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Why your code is permanent</Text>
            <Text style={styles.infoBody}>
              Your client code is uniquely tied to your realtor account, so every client you've ever invited stays connected — even if you reinstall the app or sign in on a new device. It can't be rotated or changed.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <ShieldCheck size={16} color={brand.gold} strokeWidth={1.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>About your admin code</Text>
            <Text style={styles.infoBody}>
              Your private realtor access code was delivered with your app and never appears in this dashboard for security. If you've lost it, contact support and we'll reissue.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 3.5,
  },
  scroll: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 80 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3.2,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  sub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.65)",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  permanentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 22,
  },
  permanentText: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.4,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.16)",
    padding: 20,
    backgroundColor: "rgba(8,26,21,0.5)",
    marginBottom: 22,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  cardEyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.8,
    marginBottom: 4,
  },
  cardHint: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 12,
  },
  codeBlock: {
    borderTopWidth: 1,
    borderTopColor: "rgba(244,239,230,0.12)",
    paddingTop: 18,
  },
  codeValue: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 30,
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: 14,
  },
  codeInputEdit: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 20,
    letterSpacing: 5,
    textAlign: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(210,163,67,0.5)",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 22,
    marginTop: 6,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  actionText: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 1.6,
  },
  editRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  smallBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  smallBtnGhost: { borderWidth: 1, borderColor: "rgba(244,239,230,0.25)" },
  smallBtnGhostText: {
    fontFamily: fonts.sansMedium,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 1.4,
  },
  smallBtnPrimary: { backgroundColor: brand.ivory },
  smallBtnPrimaryText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  infoCard: {
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.25)",
    backgroundColor: "rgba(210,163,67,0.06)",
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(210,163,67,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  infoBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 12,
    lineHeight: 18,
  },
});
