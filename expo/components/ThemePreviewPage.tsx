import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Brand } from '@/contexts/BrandContext';
import type { ManagedListing } from '@/contexts/ListingsContext';
import { themeDesign } from '@/constants/themeDesigns';
import { previewFeatures } from '@/lib/clientNavigation';
import ThemeCollection from './ThemeCollection';

/** Local, read-only navigation inside a theme sample; never enters an authenticated account route. */
export default function ThemePreviewPage({ route, brand, listings, onNavigate }: { route: string; brand: Brand; listings: ManagedListing[]; onNavigate: (path: string) => void }) {
  const d = themeDesign(brand.layoutId, brand.theme);
  const feature = previewFeatures[route];
  return <View style={{ padding: 24, gap: 22 }}>
    <Text style={{ color: d.accent, fontSize: 11, letterSpacing: 2 }}>THEME PREVIEW</Text>
    <Text style={{ color: d.ink, fontFamily: 'CormorantGaramond_500Medium', fontSize: 34 }}>{feature?.title || (route === '/listings' ? 'Your collection' : route === '/favorites' ? 'Saved homes' : 'App menu')}</Text>
    {route === '/listings' ? <ThemeCollection brand={brand} listings={listings} /> : route === '/favorites' ? <Text style={{ color: d.muted, lineHeight: 24 }}>Clients’ saved homes appear here. Your layout preview doesn’t change anyone’s saved collection.</Text> : feature ? <Text style={{ color: d.muted, lineHeight: 24 }}>{feature.copy}</Text> : <>
      <Text style={{ color: d.muted, lineHeight: 24 }}>Client account controls appear after a client signs in. Explore the app’s navigation here.</Text>
      {([['Collection', '/listings'], ['Saved homes', '/favorites'], ['Messages', '/message'], ['Showings', '/calendar']] as const).map(([title, path]) => <Pressable key={path} accessibilityRole="button" accessibilityLabel={title} onPress={() => onNavigate(path)} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: d.accent + '33' }}><Text style={{ color: d.ink }}>{title} →</Text></Pressable>)}
    </>}
  </View>;
}
