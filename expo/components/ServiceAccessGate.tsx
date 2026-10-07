import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { DEMO_REALTOR_ID, useAuth } from "@/contexts/AuthContext";
import { useSeats } from "@/contexts/SeatsContext";
import { supabase } from "@/lib/supabase";
import { brand, dark, fonts } from "@/constants/colors";
type Access = { available: boolean; contact?: { name?: string; email?: string; phone?: string } };
/** Keep navigation mounted; cover cached ordinary pages while server access is unavailable. */
export default function ServiceAccessGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth(), seats = useSeats(), path = usePathname(), router = useRouter();
  const [access, setAccess] = useState<Access | null>(null);
  const scope = useRef(auth.realtorId); scope.current = auth.realtorId;
  const checkedScope = useRef<string | null>(null);
  const client = auth.isClient && auth.realtorId !== DEMO_REALTOR_ID && !auth.demoViewMode;
  const check = useCallback(async () => {
    const rid = auth.realtorId;
    if (!client || !rid || !supabase) return;
    const { data, error } = await supabase.rpc("experience_access", { p_realtor_id: rid });
    if (scope.current === rid) { checkedScope.current = rid; setAccess(!error && typeof data?.available === "boolean" ? data : { available: false }); }
  }, [client, auth.realtorId]);
  useEffect(() => { checkedScope.current = null; setAccess(null); void check(); const timer = setInterval(() => void check(), 30000); const listener = AppState.addEventListener("change", v => { if(v === "active") void check(); }); return () => { clearInterval(timer); listener.remove(); }; }, [check]);
  const management = ["/admin/plans", "/admin/login", "/portal", "/reset-password", "/client-recovery", "/legal", "/auth/callback", "/welcome"].includes(path);
  const ownerBlocked = seats.tracked && (!seats.loaded || !seats.active);
  const clientBlocked = client && (checkedScope.current !== auth.realtorId || access?.available !== true);
  if (management || (!ownerBlocked && !clientBlocked)) return <>{children}</>;
  const loading = seats.tracked ? !seats.loaded && seats.loading : access === null;
  const contact = access?.contact;
  return <>{children}<View style={[StyleSheet.absoluteFill, styles.cover]} accessibilityViewIsModal>
    {loading ? <ActivityIndicator color={brand.goldLight} /> : <>
      <Text style={styles.title}>{seats.tracked ? "Account access" : "This app is currently unavailable."}</Text>
      <Text style={styles.body}>{seats.tracked ? "Manage your subscription, export your saved data, or refresh your account status." : `Please contact ${contact?.name || "your realtor"} about access.`}</Text>
      {seats.tracked ? <Pressable style={styles.button} onPress={() => router.push("/admin/plans")}><Text style={styles.link}>ACCOUNT & BILLING</Text></Pressable> : null}
      {contact?.email ? <Pressable style={styles.button} onPress={() => void Linking.openURL(`mailto:${contact.email}`)}><Text style={styles.link}>{contact.email}</Text></Pressable> : null}
      {contact?.phone ? <Pressable style={styles.button} onPress={() => void Linking.openURL(`tel:${(contact.phone ?? "").replace(/[^+\d]/g, "")}`)}><Text style={styles.link}>{contact.phone}</Text></Pressable> : null}
      <Pressable style={styles.button} onPress={() => void (seats.tracked ? seats.refresh() : check())}><Text style={styles.link}>TRY AGAIN</Text></Pressable>
      <Pressable style={styles.button} onPress={() => void auth.logout().then(() => router.replace("/welcome"))}><Text style={styles.link}>SIGN OUT</Text></Pressable>
    </>}
  </View></>;
}
const styles = StyleSheet.create({ cover: { backgroundColor: dark.bg, justifyContent: "center", alignItems: "center", padding: 28, zIndex: 10000 }, title: { color: brand.ivory, fontFamily: fonts.serif, fontSize: 25, textAlign: "center" }, body: { color: brand.textOnDarkMuted, fontFamily: fonts.sans, fontSize: 15, lineHeight: 23, textAlign: "center", marginVertical: 16 }, button: { padding: 16 }, link: { color: brand.goldLight, fontFamily: fonts.sansSemi, fontSize: 13 } });
