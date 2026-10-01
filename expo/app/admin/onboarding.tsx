import React from "react";
import { useRouter } from "expo-router";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import { useOnboarding } from "@/contexts/OnboardingContext";

/** Legacy tour links replay the current button-driven tour. */
export default function AdminOnboardingTour() {
  const router = useRouter();
  const { markTourSeen } = useOnboarding();
  return <OnboardingCarousel audience="realtor" onFinish={() => {
    markTourSeen("realtor");
    router.replace("/admin");
  }} />;
}
