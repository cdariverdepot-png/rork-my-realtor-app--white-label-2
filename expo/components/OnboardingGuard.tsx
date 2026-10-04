import React, { useCallback, useEffect, useRef } from "react";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { clientSetupState, realtorSetupState } from "@/lib/onboardingState";
import { isPrivateClientPage } from '@/lib/clientNavigation';

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
/** Shared across every screen's guard: has the demo showcase been on screen yet? */
let demoShown = false;

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const brand = useBrand();
  const profile = useClientProfiles();
  const { hydrated: onboardingHydrated, clientTourSeen, realtorTourSeen } = useOnboarding();
  // "Returning from the demo" only once the demo has actually been shown — tapping
  // View Demo on the dashboard starts on an /admin path and must not end the demo.
  if (!auth.demoViewMode) demoShown = false;
  else if (path === "/") demoShown = true;
  const returningFromDemo = auth.demoViewMode && demoShown && path.startsWith("/admin");
  useEffect(() => {
    if (returningFromDemo) void auth.exitDemoView();
  }, [returningFromDemo, auth.exitDemoView]);

  const accountManagement = ["/admin/plans", "/reset-password", "/legal"].includes(path);
  const dataReady = auth.hydrated && (accountManagement || (onboardingHydrated && (!auth.isAuthenticated || (brand.hydrated && profile.hydrated))));
  // Show the spinner only until this screen has rendered once; afterwards a
  // data reload (e.g. right after sign-in) keeps the current page mounted.
  const shownOnce = useRef(false);
  if (dataReady) shownOnce.current = true;

  let redirectTo: string | null = null;
  let cover = false;
  if (dataReady) {
    const publicRoute = accountManagement || ["/portal", "/login", "/reset-password", "/client-recovery", "/auth/callback", "/welcome", "/book", "/legal"].includes(path);
    if (auth.demoViewMode) {
      // Demo cannot expose authenticated administration through back navigation.
      if (returningFromDemo) cover = true;
      // Demo feature links must never open authenticated forms or tools.
      else if (path !== "/") redirectTo = "/";
    } else if (!auth.isAuthenticated && isPrivateClientPage(path)) {
      redirectTo = '/portal?entry=client';
    } else if (auth.isClient && path.startsWith('/admin')) {
      redirectTo = '/';
    } else if (auth.isAdmin && !auth.viewAsClient && ['/account', '/client-profile', '/client-recovery'].includes(path)) {
      redirectTo = auth.viewAsClient ? '/menu' : '/admin';
    } else if (!publicRoute && auth.isAdmin && !auth.viewAsClient &&
      // Walkthrough first (same as clients): do not force build until the tour ends.
      realtorTourSeen &&
      realtorSetupState(brand.savedBrand, auth.realtorRecord?.client_code_enabled === true) === "setup-incomplete" &&
      // Only before setup has ever been finished. Afterwards a gap saved from Edit
      // Content is fixed there (Studio says what's still needed) — it must not
      // throw a live realtor back into Build Your App.
      auth.realtorRecord?.client_code_enabled !== true &&
      path !== "/admin/build") {
      redirectTo = "/admin/build";
    } else if (!publicRoute && auth.isClient &&
      // Walkthrough first: do not force profile until the 5-page tour is done.
      clientTourSeen &&
      !profile.myProfileShared &&
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
