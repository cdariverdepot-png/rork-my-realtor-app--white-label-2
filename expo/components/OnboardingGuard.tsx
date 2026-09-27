import React, { useCallback, useEffect, useRef } from "react";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import { clientSetupState, realtorSetupState } from "@/lib/onboardingState";

/**
 * Route access derives from saved data, including direct links and back gestures.
 *
 * This wraps every root screen — including the whole nested /admin stack — so it
 * must never swap its children out. Rendering a <Redirect> (or null) in place of
 * the admin stack unmounts it; it remounts at its first page (/admin), gets
 * redirected again, and the app ping-pongs between the dashboard and a black
 * screen. Instead the children always stay mounted and the redirect is issued
 * imperatively, with a cover on top so the wrong page never flashes.
 */
export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const brand = useBrand();
  const profile = useClientProfiles();
  const returningFromDemo = auth.demoViewMode && path.startsWith("/admin");
  useEffect(() => {
    if (returningFromDemo) void auth.exitDemoView();
  }, [returningFromDemo, auth.exitDemoView]);

  const dataReady = auth.hydrated && (!auth.isAuthenticated || (brand.hydrated && profile.hydrated));
  // Show the spinner only until this screen has rendered once; afterwards a
  // data reload (e.g. right after sign-in) keeps the current page mounted.
  const shownOnce = useRef(false);
  if (dataReady) shownOnce.current = true;

  let redirectTo: string | null = null;
  let cover = false;
  if (dataReady) {
    const publicRoute = ["/portal", "/login", "/reset-password", "/legal"].includes(path);
    if (auth.demoViewMode) {
      // Demo cannot expose authenticated administration through back navigation.
      if (returningFromDemo) cover = true;
      // Demo feature links must never open authenticated forms or tools.
      else if (path !== "/") redirectTo = "/";
    } else if (!publicRoute && auth.isAdmin &&
      realtorSetupState(brand.savedBrand, auth.realtorRecord?.client_code_enabled === true) === "setup-incomplete" &&
      path !== "/admin/build") {
      redirectTo = "/admin/build";
    } else if (!publicRoute && auth.isClient &&
      clientSetupState(true, profile.myProfileShared, profile.myEssentialsMet) !== "experience-accessible" &&
      path !== "/client-profile") {
      redirectTo = "/client-profile";
    }
  }

  // Only the focused screen navigates; background screens see the same path.
  useFocusEffect(
    useCallback(() => {
      if (redirectTo) router.replace(redirectTo as never);
    }, [redirectTo, router])
  );

  if (!dataReady && !shownOnce.current) {
    return <View style={styles.cover}><ActivityIndicator /></View>;
  }
  return (
    <>
      {children}
      {redirectTo || cover ? <View style={[StyleSheet.absoluteFill, styles.cover]} pointerEvents="auto" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  cover: { flex: 1, justifyContent: "center", backgroundColor: "#0A0B0E" },
});
