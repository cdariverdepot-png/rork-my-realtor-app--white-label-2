import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack, usePathname } from "expo-router";
import { navIntent } from "@/lib/navIntent";
import * as SplashScreen from "expo-splash-screen";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import {
  PlayfairDisplay_500Medium,
  PlayfairDisplay_500Medium_Italic,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import {
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_500Medium_Italic,
} from "@expo-google-fonts/cormorant-garamond";
import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_500Medium_Italic,
} from "@expo-google-fonts/fraunces";
import {
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_500Medium_Italic,
} from "@expo-google-fonts/montserrat";
import {
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
} from "@expo-google-fonts/dm-serif-display";
import {
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_500Medium_Italic,
} from "@expo-google-fonts/lora";
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_700Bold,
  LibreBaskerville_400Regular_Italic,
} from "@expo-google-fonts/libre-baskerville";
import {
  EBGaramond_500Medium,
  EBGaramond_600SemiBold,
  EBGaramond_500Medium_Italic,
} from "@expo-google-fonts/eb-garamond";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
} from "@expo-google-fonts/space-grotesk";
import { useFonts } from "expo-font";
import { brand, dark } from "@/constants/colors";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AccessProvider } from "@/contexts/AccessContext";
import { SeatsProvider } from "@/contexts/SeatsContext";
import { ListingsProvider } from "@/contexts/ListingsContext";
import { BrandProvider, useBrand } from "@/contexts/BrandContext";
import { requiredStatus } from "@/constants/sections";
import { EditModeProvider } from "@/contexts/EditModeContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { MessagesProvider } from "@/contexts/MessagesContext";
import { QuickRepliesProvider } from "@/contexts/QuickRepliesContext";
import { AppointmentsProvider } from "@/contexts/AppointmentsContext";
import { CalendarFeedsProvider } from "@/contexts/CalendarFeedsContext";
import { DocumentsProvider } from "@/contexts/DocumentsContext";
import { ClientsProvider } from "@/contexts/ClientsContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ClientFeedProvider } from "@/contexts/ClientFeedContext";
import { ClientProfileProvider, useClientProfiles } from "@/contexts/ClientProfileContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { EngagementProvider } from "@/contexts/EngagementContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { GoLiveProvider } from "@/contexts/GoLiveContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ConciergeBanner from "@/components/ConciergeBanner";
import DocsAutomation from "@/components/DocsAutomation";
import SecurityHardener from "@/components/SecurityHardener";
import { listings as seedListings } from "@/constants/realtor";
import { queryClient, queryPersister } from "@/lib/queryPersist";
import BootScreen from "@/components/BootScreen";
import OnboardingGuard from "@/components/OnboardingGuard";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import { useOnboarding, type Audience } from "@/contexts/OnboardingContext";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const modal = {
    presentation: "modal" as const,
    headerShown: false,
    animation: "slide_from_bottom" as const,
    animationDuration: 320,
  };
  return (
    <Stack
      screenLayout={({ children }) => <OnboardingGuard>{children}</OnboardingGuard>}
      screenOptions={{
        headerBackTitle: "Back",
        contentStyle: { backgroundColor: dark.bg },
        animationDuration: 280,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]" options={modal} />
      <Stack.Screen name="watchlist/[id]" options={modal} />
      <Stack.Screen name="favorites" options={modal} />
      <Stack.Screen name="listings" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="messages" options={modal} />
      <Stack.Screen name="documents" options={modal} />
      <Stack.Screen name="calendar" options={modal} />
      <Stack.Screen name="insights" options={modal} />
      <Stack.Screen name="notifications" options={modal} />
      <Stack.Screen name="message" options={modal} />
      <Stack.Screen name="book" options={modal} />
      <Stack.Screen name="welcome" options={modal} />
      <Stack.Screen name="note" options={modal} />
      <Stack.Screen name="login" options={modal} />
      <Stack.Screen name="account" options={modal} />
      <Stack.Screen name="client-profile" options={{ headerShown: false, animation: "slide_from_bottom", animationDuration: 340 }} />
      <Stack.Screen name="legal" options={modal} />
      <Stack.Screen name="reset-password" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="portal" options={{ headerShown: false, animation: "fade", animationDuration: 360 }} />
      <Stack.Screen name="admin" options={() => ({ headerShown: false, animationTypeForReplace: navIntent.replaceAsBack ? "pop" : "push" })} />
    </Stack>
  );
}

function RootLayoutInner() {
  const pathname = usePathname();
  const {
    hydrated: onboardingHydrated,
    realtorTourSeen,
    clientTourSeen,
    markTourSeen,
  } = useOnboarding();
  const {
    hydrated: authHydrated,
    isAuthenticated,
    isAdmin,
    isPreviewAdmin,
    demoViewMode,
    viewAsClient,
  } = useAuth();
  const { savedBrand, hydrated: setupHydrated } = useBrand();
  const { myProfileShared, myEssentialsMet } = useClientProfiles();
  const [booting, setBooting] = useState(true);

  /**
   * The walkthrough is audience-specific, so it can only run once we know who
   * just signed in. Cold launch therefore goes:
   *
   *   boot logo  ->  lock screen  ->  sign in  ->  your five steps
   *
   * Nobody sees a pitch written for the other side of the app, and a client
   * who was handed a code never sits through the realtor sales tour.
   *
   * Suppressed for the demo showcase and for admins previewing the client
   * side — neither is a real first run.
   */
  const audience: Audience | null = !isAuthenticated
    ? null
    : isAdmin
    ? "realtor"
    : "client";

  const tourSeen = audience === "realtor" ? realtorTourSeen : clientTourSeen;
  const suppressed = pathname === "/admin/ready" || isPreviewAdmin || demoViewMode || viewAsClient || !setupHydrated ||
    (!isAdmin && (!myProfileShared || !myEssentialsMet));

  const showOnboarding =
    authHydrated &&
    onboardingHydrated &&
    audience !== null &&
    !tourSeen &&
    !suppressed;

  const handleOnboardingFinish = useCallback(() => {
    if (audience) markTourSeen(audience);
  }, [audience, markTourSeen]);

  return (
    <>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: dark.bg }}>
        <StatusBar style="light" />
        <RootLayoutNav />
        <ConciergeBanner />
        <DocsAutomation />
        <SecurityHardener />
        {/* Runs after authentication, so it always sits above the signed-in
            app rather than in front of the lock screen. */}
        {showOnboarding && audience && (
          <OnboardingCarousel
            key={audience}
            audience={audience}
            onFinish={handleOnboardingFinish}
          />
        )}
        {booting && (
          <BootScreen onFinish={() => setBooting(false)} />
        )}
      </GestureHandlerRootView>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    PlayfairDisplay_500Medium,
    PlayfairDisplay_500Medium_Italic,
    PlayfairDisplay_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_500Medium_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_500Medium_Italic,
    DMSerifDisplay_400Regular,
    DMSerifDisplay_400Regular_Italic,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_500Medium_Italic,
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    LibreBaskerville_400Regular_Italic,
    EBGaramond_500Medium,
    EBGaramond_600SemiBold,
    EBGaramond_500Medium_Italic,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Warm the offline image cache so curated listings, portraits and signature
  // render instantly even without a network on cold launch.
  useEffect(() => {
    const urls = Array.from(
      new Set(seedListings.map((l) => l.image).filter(Boolean) as string[])
    );
    if (urls.length === 0) return;
    Image.prefetch(urls).catch((e) => console.log("[prefetch] listings", e));
  }, []);

  if (!loaded) return null;

  return (
    <ErrorBoundary>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      <AuthProvider>
        <AccessProvider>
        <SeatsProvider>
        <BrandProvider>
         <ListingsProvider>
          <EditModeProvider>
          <FavoritesProvider>
            <ClientsProvider>
            <MessagesProvider>
              <QuickRepliesProvider>
              <AppointmentsProvider>
                <CalendarFeedsProvider>
                <DocumentsProvider>
                  <NotificationsProvider>
                    <ClientFeedProvider>
                     <ClientProfileProvider>
                     <EngagementProvider>
                      <OnboardingProvider>
                      <GoLiveProvider>
                      <SafeAreaProvider>
                        <RootLayoutInner />
                      </SafeAreaProvider>
                      </GoLiveProvider>
                      </OnboardingProvider>
                     </EngagementProvider>
                     </ClientProfileProvider>
                    </ClientFeedProvider>
                  </NotificationsProvider>
                </DocumentsProvider>
                </CalendarFeedsProvider>
              </AppointmentsProvider>
              </QuickRepliesProvider>
            </MessagesProvider>
            </ClientsProvider>
          </FavoritesProvider>
          </EditModeProvider>
         </ListingsProvider>
        </BrandProvider>
        </SeatsProvider>
        </AccessProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
