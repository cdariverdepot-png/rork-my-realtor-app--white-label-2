import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type Audience = "realtor" | "client";
export type OnboardingState = { tourSeen: boolean; realtorTourSeen: boolean; clientTourSeen: boolean };
const initialState: OnboardingState = { tourSeen: false, realtorTourSeen: false, clientTourSeen: false };

export const [OnboardingProvider, useOnboarding] = createContextHook(() => {
  const { session } = useAuth();
  // A new device shows orientation once; another account never inherits it.
  const key = ["myrealtor.onboarding.v4", session?.role ?? "signed-out", session?.realtorId ?? "", session?.clientId ?? ""].join(":");
  const [snapshot, setSnapshot] = useState<{ key: string; state: OnboardingState } | null>(null);
  const hydrated = snapshot?.key === key;
  const state = hydrated ? snapshot.state : initialState;
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(key).then(raw => {
      const parsed = raw ? JSON.parse(raw) : {};
      if (alive) setSnapshot(previous => previous?.key === key ? previous : { key, state: {
        tourSeen: parsed.tourSeen === true, realtorTourSeen: parsed.realtorTourSeen === true,
        clientTourSeen: parsed.clientTourSeen === true,
      } });
    }).catch(() => { if (alive) setSnapshot(previous => previous?.key === key ? previous : { key, state: initialState }); });
    return () => { alive = false; };
  }, [key]);
  const patch = useCallback((field: keyof OnboardingState, value: boolean) => {
    setSnapshot(previous => {
      const next = { ...(previous?.key === key ? previous.state : initialState), [field]: value };
      void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      return { key, state: next };
    });
  }, [key]);
  const markSeen = useCallback(() => patch("tourSeen", true), [patch]);
  const markTourSeen = useCallback((audience: Audience) => patch(audience === "realtor" ? "realtorTourSeen" : "clientTourSeen", true), [patch]);
  const replayTour = useCallback((audience: Audience) => patch(audience === "realtor" ? "realtorTourSeen" : "clientTourSeen", false), [patch]);
  // Each signup/guest identity has an untouched key; no cross-account reset needed.
  const prepareNewClientTour = useCallback(() => {}, []);
  const completeInvitedClientTour = useCallback(async (realtorId: string, clientId: string) => {
    const target = ['myrealtor.onboarding.v4', 'client', realtorId, clientId].join(':');
    const stored = await AsyncStorage.getItem(target);
    const prior = stored ? JSON.parse(stored) as Partial<OnboardingState> : {};
    const next = { tourSeen: prior.tourSeen === true, realtorTourSeen: prior.realtorTourSeen === true, clientTourSeen: true };
    await AsyncStorage.setItem(target, JSON.stringify(next));
    setSnapshot({ key: target, state: next });
  }, []);
  const prepareNewRealtorTour = useCallback(() => {}, []);
  const reopen = useCallback(() => patch("tourSeen", false), [patch]);
  const reset = useCallback(() => {
    setSnapshot({ key, state: initialState });
    void AsyncStorage.setItem(key, JSON.stringify(initialState)).catch(() => {});
  }, [key]);
  return { hydrated, ...state, markSeen, markTourSeen, replayTour, prepareNewClientTour, completeInvitedClientTour, prepareNewRealtorTour, reopen, reset };
});
