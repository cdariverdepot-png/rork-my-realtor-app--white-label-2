import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Home, Search, Heart, MessageCircle, UserRound, CalendarDays, Menu, Layers, Ellipsis } from 'lucide-react-native';
import type { Brand } from '@/contexts/BrandContext';
import { themeDesign } from '@/constants/themeDesigns';
import TactilePressable from './TactilePressable';
import { useReducedTransparency } from '@/hooks/useReducedTransparency';
export type ThemeRoute = '/' | '/listings' | '/favorites' | '/message' | '/calendar' | '/account' | '/menu';
export default function ThemeNavigation({ brand, onNavigate, pathname = '/', unread = 0, saved = 0, preview = false }: { brand: Brand; onNavigate?: (route: ThemeRoute) => void; pathname?: string; unread?: number; saved?: number; preview?: boolean }) {
  const d = themeDesign(brand.layoutId, brand.theme);
  const solid = useReducedTransparency();
  const tabs: [string, ThemeRoute, typeof Home][] = d.composition === 'coastal' ? [['Home', '/', Home], ['Collection', '/listings', Layers], ['Saved', '/favorites', Heart], ['Profile', '/account', UserRound]] :
    d.composition === 'discovery' ? [['Discover', '/', Home], ['Saved', '/favorites', Heart], ['Concierge', '/message', MessageCircle], ['Schedule', '/calendar', CalendarDays], ['Menu', '/menu', Menu]] :
    d.composition === 'journal' ? [['Home', '/', Home], ['Collection', '/listings', Layers], ['Concierge', '/message', MessageCircle], ['Schedule', '/calendar', CalendarDays], ['Profile', '/account', UserRound]] :
    d.composition === 'concierge' ? [['Home', '/', Home], ['Search', '/listings', Search], ['Saved', '/favorites', Heart], ['Messages', '/message', MessageCircle], ['More', '/menu', Ellipsis]] :
    [['Home', '/', Home], [d.composition === 'minimal' ? 'Discover' : 'Search', '/listings', Search], ['Saved', '/favorites', Heart], ['Messages', '/message', MessageCircle], ['Profile', '/account', UserRound]];
  const radius = d.composition === 'property' ? 23 : d.composition === 'minimal' ? 25 : 32;
  return <View pointerEvents="box-none" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
    <View style={[styles.glass, { borderRadius: radius, borderColor: d.light ? '#FFFFFFCC' : '#FFFFFF24', backgroundColor: solid ? (d.light ? '#F8F5EE' : '#141815') : d.light ? '#F8F5EE72' : '#14181572' }]}>
      {!solid && <BlurView pointerEvents="none" tint={d.light ? 'light' : 'dark'} intensity={42} style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: d.light ? '#FFFDF820' : '#0A100D24' }]} />
      <View pointerEvents="none" style={[styles.rim, { backgroundColor: d.light ? '#FFFFFFE0' : '#FFFFFF30' }]} />
      <View style={styles.row}>
        {tabs.map(([originalLabel, originalRoute, OriginalIcon]) => {
          const route = preview && originalRoute === '/account' ? '/menu' : originalRoute;
          const label = preview && originalRoute === '/account' ? 'Menu' : originalLabel;
          const Icon = preview && originalRoute === '/account' ? Menu : OriginalIcon;
          const active = route === '/' ? pathname === '/' : route === '/menu' ? ['/menu', '/account', '/client-profile', '/documents', '/notifications', '/insights', '/legal', '/note'].includes(pathname) : route === '/account' ? pathname === '/account' || pathname === '/client-profile' : route === '/calendar' ? pathname === '/calendar' || pathname === '/book' : route === '/listings' ? pathname === '/listings' || pathname.startsWith('/listing/') : pathname.startsWith(route);
          const count = route === '/message' ? unread : route === '/favorites' ? saved : 0;
          return <TactilePressable key={route} disabled={!onNavigate} onPress={() => onNavigate?.(route)} accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ selected: active }} hitSlop={0} style={[styles.tab, { borderRadius: radius - 8, backgroundColor: active ? d.accent + (d.light ? '20' : '25') : 'transparent', borderColor: active ? d.accent + '36' : 'transparent' }]}>
            <View style={{ position: 'relative' }}><Icon size={22} strokeWidth={active ? 2.2 : 1.75} color={active ? d.accent : d.muted} />
              {count > 0 && <View style={[styles.badge, { backgroundColor: d.accent }]}><Text style={{ fontSize: 9, fontWeight: '700', color: d.background }}>{count > 99 ? '99+' : count}</Text></View>}
            </View>
            <Text numberOfLines={1} style={{ fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium', fontSize: 10, color: active ? d.accent : d.muted, letterSpacing: 0.1 }}>{label}</Text>
          </TactilePressable>;
        })}
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  glass: { overflow: 'hidden', borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  rim: { position: 'absolute', top: 0, left: 26, right: 26, height: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', padding: 6, gap: 3 },
  tab: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderWidth: 1 },
  badge: { position: 'absolute', top: -5, right: -10, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
