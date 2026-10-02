import Pressable from './TactilePressable';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useEditMode } from '@/contexts/EditModeContext';
import { useClientProfiles } from '@/contexts/ClientProfileContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { liveThemeDesign as themeDesign } from '@/constants/liveThemeDesigns';
import { requiredStatus } from '@/constants/sections';
import { isClientPage, isPrivateClientPage, previewFeatures } from '@/lib/clientNavigation';
import { leavePreviewToDashboard } from '@/lib/navIntent';
import BottomNav from './BottomNav';

/** Lives outside the route stack: the footer keeps its identity and theme on every page. */
export default function ClientShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(), router = useRouter(), insets = useSafeAreaInsets();
  const auth = useAuth(), brand = useBrand(), edit = useEditMode(), profile = useClientProfiles();
  const preview = auth.isAdmin && auth.viewAsClient && !auth.demoViewMode;
  const visible = auth.hydrated && brand.hydrated && !auth.demoViewMode && !edit.editing &&
    isClientPage(path) && requiredStatus(brand.brand).complete &&
    (preview || (auth.isClient && profile.myProfileShared && profile.myEssentialsMet));
  const d = themeDesign(brand.brand.layoutId, brand.brand.theme);
  return <View style={{ flex: 1, backgroundColor: d.background }}>
    {visible && preview && path !== '/' ? <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Return to realtor dashboard" onPress={() => edit.guardExit(() => {
        brand.setDraftPreview(null);
        leavePreviewToDashboard(p => router.replace(p), auth.exitViewAsClient);
      })} style={{ padding: 10 }}><Text style={{ color: d.accent }}>‹ Dashboard</Text></Pressable>
      <Text style={{ color: d.muted, fontSize: 12 }}>Viewing as client</Text>
    </View> : null}
    <View style={{ flex: 1, paddingBottom: visible && (['/messages', '/message', '/book', '/client-profile', '/note'].includes(path) || path.startsWith('/listing/')) ? 96 + insets.bottom : 0 }}>{children}</View>
    {visible ? <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}><BottomNav embedded /></View> : null}
  </View>;
}

/** Do not mount account-only screens in a realtor preview: their effects can mutate live data. */
export function ClientPreviewBoundary({ children }: { children: React.ReactNode }) {
  const path = usePathname(), auth = useAuth();
  if (!auth.isAuthenticated && isPrivateClientPage(path)) return null;
  if (auth.isAdmin && ['/account', '/client-profile', '/client-recovery'].includes(path)) return null;
  const feature = auth.isAdmin && auth.viewAsClient && !auth.demoViewMode ? previewFeatures[path] : undefined;
  return feature ? <PreviewFeature {...feature} schedule={path === '/calendar'} /> : <>{children}</>;
}
function PreviewFeature({ title, copy, schedule }: { title: string; copy: string; schedule: boolean }) {
  const router = useRouter(), { brand } = useBrand(), d = themeDesign(brand.layoutId, brand.theme);
  return <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 140, gap: 22 }} keyboardShouldPersistTaps="handled">
    <Text style={{ color: d.accent, letterSpacing: 2, fontSize: 11 }}>CLIENT EXPERIENCE</Text>
    <Text style={{ color: d.ink, fontSize: 32, fontFamily: 'CormorantGaramond_500Medium' }}>{title}</Text>
    <Text style={{ color: d.muted, fontSize: 16, lineHeight: 25 }}>{copy}</Text>
    {schedule ? <Pressable accessibilityRole="button" onPress={() => router.navigate('/book')} style={{ padding: 18, backgroundColor: d.accent, borderRadius: 10 }}><Text style={{ color: d.background }}>Preview a viewing request</Text></Pressable> : null}
    <Pressable accessibilityRole="button" onPress={() => router.navigate('/menu')} style={{ paddingVertical: 16 }}><Text style={{ color: d.accent }}>Explore app menu →</Text></Pressable>
  </ScrollView>;
}
