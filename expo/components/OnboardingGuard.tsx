import React, { useEffect } from "react";
import { Redirect, usePathname } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import { clientSetupState, realtorSetupState } from "@/lib/onboardingState";

/** Route access derives from saved data, including direct links and back gestures. */
export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const auth = useAuth();
  const brand = useBrand();
  const profile = useClientProfiles();
  const returningFromDemo = auth.demoViewMode && path.startsWith("/admin");
  useEffect(() => {
    if (returningFromDemo) void auth.exitDemoView();
  }, [returningFromDemo, auth.exitDemoView]);
  if (!auth.hydrated || (auth.isAuthenticated && (!brand.hydrated || !profile.hydrated))) {
    return <View style={{ flex: 1, justifyContent: "center", backgroundColor: "#0A0B0E" }}><ActivityIndicator /></View>;
  }
  if (auth.demoViewMode) {
    // Demo cannot expose authenticated administration through back navigation.
    if (returningFromDemo) return null;
    // Demo feature links must never open authenticated forms or tools.
    if (path !== "/") return <Redirect href="/" />;
    return <>{children}</>;
  }
  const publicRoute = ["/portal", "/login", "/reset-password", "/legal"].includes(path);
  if (!publicRoute && auth.isAdmin && realtorSetupState(brand.savedBrand, auth.realtorRecord?.client_code_enabled === true) === "setup-incomplete" && path !== "/admin/build") {
    return <Redirect href="/admin/build" />;
  }
  if (!publicRoute && auth.isClient && clientSetupState(true, profile.myProfileShared, profile.myEssentialsMet) !== "experience-accessible" && path !== "/client-profile") {
    return <Redirect href="/client-profile" />;
  }
  return <>{children}</>;
}
