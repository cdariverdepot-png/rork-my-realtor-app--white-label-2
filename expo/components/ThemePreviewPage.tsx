import Pressable from './TactilePressable';
import React from 'react';
import { Text, View } from 'react-native';
import type { Brand } from '@/contexts/BrandContext';
import type { ManagedListing } from '@/contexts/ListingsContext';
import { themeDesign } from '@/constants/themeDesigns';
import { previewFeatures } from '@/lib/clientNavigation';
import ThemeCollection from './ThemeCollection';
import { Image } from 'expo-image';

/** Local, read-only navigation inside a theme sample; never enters an authenticated account route. */
export default function ThemePreviewPage({ route, brand, listings, onNavigate, savedIds = [], onFavorite }: { route: string; brand: Brand; listings: ManagedListing[]; onNavigate: (path: string) => void; savedIds?: string[]; onFavorite?: (id: string) => void }) {
  const d = themeDesign(brand.layoutId, brand.theme);
  const feature = previewFeatures[route];
  if (route === '/note' || route === '/insights') return <View style={{ padding: 24, gap: 18 }}>
    <Text style={{ color: d.accent, fontSize: 11, letterSpacing: 2 }}>THEME PREVIEW</Text>
    <Text style={{ color: d.ink, fontFamily: 'CormorantGaramond_500Medium', fontSize: 32 }}>{route === '/note' ? brand.note.title : brand.beat.headline}</Text>
    {(route === '/note' ? brand.note.body : brand.beat.bullets.map(item => [item.label, item.copy].filter(Boolean).join('\n'))).filter(Boolean).map((copy,index) => <Text key={index} style={{ color: d.muted, lineHeight: 25 }}>{copy}</Text>)}
    <Pressable accessibilityRole="button" onPress={() => onNavigate('/message')} style={{ paddingVertical: 16 }}><Text style={{ color: d.accent }}>Message your realtor →</Text></Pressable>
  </View>;
  if (route === '/book') return <View style={{ padding: 24, gap: 18 }}><Text style={{ color: d.ink, fontSize: 28 }}>Request a viewing</Text><Text style={{ color: d.muted, lineHeight: 25 }}>Clients can choose a home and request a time here. This layout preview does not send a booking request.</Text><Pressable accessibilityRole="button" onPress={() => onNavigate('/listings')} style={{ paddingVertical: 16 }}><Text style={{ color: d.accent }}>Explore the homes →</Text></Pressable></View>;
  const listing = route.startsWith('/listing/') ? listings.find(item => item.id === route.slice('/listing/'.length)) : undefined;
  if (listing) return <View style={{ padding: 24, gap: 18 }}>
    <Text style={{ color: d.accent, fontSize: 11, letterSpacing: 2 }}>PROPERTY PREVIEW</Text>
    <Image source={{ uri: listing.images?.[0] || listing.image }} contentFit="cover" style={{ width: '100%', aspectRatio: 1.25, borderRadius: 20 }} />
    <Text style={{ color: d.ink, fontFamily: 'CormorantGaramond_500Medium', fontSize: 32 }}>{listing.title}</Text>
    <Text style={{ color: d.accent, fontSize: 24 }}>{listing.price}</Text>
    <Text style={{ color: d.muted }}>{[listing.neighborhood, `${listing.beds} beds · ${listing.baths} baths`, listing.sqft].filter(Boolean).join('\n')}</Text>
    <Pressable accessibilityRole="button" onPress={() => onFavorite?.(listing.id)} style={{ borderRadius: 16, padding: 16, backgroundColor: d.accent }}><Text style={{ color: d.background }}>{savedIds.includes(listing.id) ? 'Remove from saved homes' : 'Save this home'}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => onNavigate('/calendar')} style={{ padding: 16 }}><Text style={{ color: d.accent }}>Request a showing →</Text></Pressable>
    <Text style={{ color: d.muted, lineHeight: 22 }}>Layout preview only. Saved homes stay in this preview; no client data is changed.</Text>
  </View>;
  return <View style={{ padding: 24, gap: 22 }}>
    <Text style={{ color: d.accent, fontSize: 11, letterSpacing: 2 }}>THEME PREVIEW</Text>
    <Text style={{ color: d.ink, fontFamily: 'CormorantGaramond_500Medium', fontSize: 34 }}>{feature?.title || (route === '/listings' ? 'Your collection' : route === '/favorites' ? 'Saved homes' : 'App menu')}</Text>
    {route === '/listings' || route === '/favorites' && savedIds.length ? <ThemeCollection brand={brand} listings={route === '/favorites' ? listings.filter(item => savedIds.includes(item.id)) : listings}
      onOpen={id => onNavigate(`/listing/${id}`)} onFavorite={onFavorite} isFavorite={id => savedIds.includes(id)} onBrowse={() => onNavigate('/listings')} /> : route === '/favorites' ? <Text style={{ color: d.muted, lineHeight: 24 }}>Tap a heart on any home to try saving it here. These saves stay in your layout preview.</Text> : feature ? <Text style={{ color: d.muted, lineHeight: 24 }}>{feature.copy}</Text> : <>
      <Text style={{ color: d.muted, lineHeight: 24 }}>Client account controls appear after a client signs in. Explore the app’s navigation here.</Text>
      {([['Collection', '/listings'], ['Saved homes', '/favorites'], ['Messages', '/message'], ['Showings', '/calendar']] as const).map(([title, path]) => <Pressable key={path} accessibilityRole="button" accessibilityLabel={title} onPress={() => onNavigate(path)} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: d.accent + '33' }}><Text style={{ color: d.ink }}>{title} →</Text></Pressable>)}
    </>}
  </View>;
}
