import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * OnboardingContext — tracks the walkthroughs, all of which run *after*
 * authentication so each audience only ever sees copy meant for them.
 *
 * - realtorTourSeen: 5-step studio walkthrough, after a realtor signs in
 * - clientTourSeen:  5-step mirrored walkthrough, after a client redeems a code
 * - tourSeen:        the small in-dashboard arrival note (separate, older flow)
 */

export type Audience = "realtor" | "client";

export type OnboardingState = {
  tourSeen: boolean;
  realtorTourSeen: boolean;
  clientTourSeen: boolean;
};

const STORAGE_KEY = "vance.onboarding.v3";

const initialState: OnboardingState = {
  tourSeen: false,
  realtorTourSeen: false,
  clientTourSeen: false,
};

export const [OnboardingProvider, useOnboarding] = createContextHook(() => {
  const [state, setState] = useState<OnboardingState>(initialState);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && raw) {
          const parsed = JSON.parse(raw) as Partial<OnboardingState>;
          setState({
            tourSeen: Boolean(parsed.tourSeen),
            realtorTourSeen: Boolean(parsed.realtorTourSeen),
            clientTourSeen: Boolean(parsed.clientTourSeen),
          });
        }
      } catch (e) {
        console.log("[onboarding] hydrate", e);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: OnboardingState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.log("[onboarding] persist", e);
    }
  }, []);

  const patch = useCallback(
    (key: keyof OnboardingState, value: boolean) => {
      setState((prev) => {
        if (prev[key] === value) return prev;
        const next: OnboardingState = { ...prev, [key]: value };
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const markSeen = useCallback(() => patch("tourSeen", true), [patch]);

  /** Marks the walkthrough complete for whichever side just finished it. */
  const markTourSeen = useCallback(
    (audience: Audience) =>
      patch(audience === "realtor" ? "realtorTourSeen" : "clientTourSeen", true),
    [patch]
  );

  /** Lets a realtor replay their own walkthrough from the dashboard. */
  const replayTour = useCallback(
    (audience: Audience) =>
      patch(audience === "realtor" ? "realtorTourSeen" : "clientTourSeen", false),
    [patch]
  );

  const reopen = useCallback(() => patch("tourSeen", false), [patch]);

  const reset = useCallback(() => {
    void persist(initialState);
    setState(initialState);
  }, [persist]);

  const value = useMemo(
    () => ({
      hydrated,
      tourSeen: state.tourSeen,
      realtorTourSeen: state.realtorTourSeen,
      clientTourSeen: state.clientTourSeen,
      markSeen,
      markTourSeen,
      replayTour,
      reopen,
      reset,
    }),
    [
      hydrated,
      state.tourSeen,
      state.realtorTourSeen,
      state.clientTourSeen,
      markSeen,
      markTourSeen,
      replayTour,
      reopen,
      reset,
    ]
  );

  return value;
});
