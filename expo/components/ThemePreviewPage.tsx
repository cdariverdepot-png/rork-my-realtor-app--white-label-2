import Pressable from './TactilePressable';
import React from 'react';
import { Text, View } from 'react-native';
import type { Brand } from '@/contexts/BrandContext';
import type { ManagedListing } from '@/contexts/ListingsContext';
import { liveThemeDesign as themeDesign, LIVE_THEME_MATERIALS } from '@/constants/liveThemeDesigns';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, Heart, CalendarDays, MessageCircle, Layers } from 'lucide-react-native';
import { previewFeatures } from '@/lib/clientNavigation';
import ThemeCollection from './ThemeCollection';
import { Image } from 'expo-image';
import PreviewSandbox, { isSandboxPage } from './PreviewSandbox';
import ListingPhotoGallery from './ListingPhotoGallery';

/** Local, read-only navigation inside a theme sample; never enters an authenticated account route. */
export default function ThemePreviewPage({ route, brand, listings, onNavigate, savedIds = [], onFavorite }: { route: string; brand: Brand; listings: ManagedListing[]; onNavigate: (path: string) => void; savedIds?: string[]; onFavorite?: (id: string) => void }) {
  const d = themeDesign(brand.layoutId, brand.theme);
  const material = LIVE_THEME_MATERIALS[brand.layoutId ?? 'private-collection'];
  const feature = previewFeatures[route];
  if (isSandboxPage(route)) return <PreviewSandbox route={route} brand={brand} onNavigate={onNavigate} />;
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
    <ListingPhotoGallery images={listing.images} cover={listing.image} title={listing.title} updatedAt={listing.updatedAt} />
    <Text style={{ color: d.ink, fontFamily: 'CormorantGaramond_500Medium', fontSize: 32 }}>{listing.title}</Text>
    <Text style={{ color: d.accent, fontSize: 24 }}>{listing.price}</Text>
    <Text style={{ color: d.muted }}>{[listing.neighborhood, `${listing.beds} beds · ${listing.baths} baths`, listing.sqft].filter(Boolean).join('\n')}</Text>
    {!!listing.description && <Text style={{ color: d.ink, lineHeight: 24 }}>{listing.description}</Text>}
    {!!listing.listingNumber && <Text style={{ color: d.muted }}>MLS number: {listing.listingNumber}</Text>}
    {!!listing.propertyType && <Text style={{ color: d.muted }}>{listing.propertyType}</Text>}
    {Object.entries(listing.facts ?? {}).map(([label,value]) => <Text key={label} style={{ color: d.muted }}>{label}: {value}</Text>)}
    <Pressable accessibilityRole="button" onPress={() => onFavorite?.(listing.id)} style={{ borderRadius: 16, padding: 16, backgroundColor: d.accent }}><Text style={{ color: d.background }}>{savedIds.includes(listing.id) ? 'Remove from saved homes' : 'Save this home'}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => onNavigate('/calendar')} style={{ padding: 16 }}><Text style={{ color: d.accent }}>Request a showing →</Text></Pressable>
    <Text style={{ color: d.muted, lineHeight: 22 }}>Layout preview only. Saved homes stay in this preview; no client data is changed.</Text>
  </View>;
  return <View style={{ padding: 24, gap: 22, minHeight: 640, overflow: 'hidden' }}>
    {brand.presentation !== 'website' && <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <Image source={material.photo} contentFit="cover" style={{ width: '100%', height: '100%' }} />
      <LinearGradient colors={[d.background + 'CC', d.background + 'BB', d.background]} style={{ position: 'absolute', inset: 0 }} />
    </View>}
    <Text style={{ color: d.accent, fontSize: 11, letterSpacing: 2 }}>THEME PREVIEW</Text>
    <Text style={{ color: d.ink, fontFamily: 'CormorantGaramond_500Medium', fontSize: 34 }}>{feature?.title || (route === '/listings' ? 'Listings' : route === '/favorites' ? 'Saved homes' : 'App menu')}</Text>
    {route === '/listings' && !listings.some(item=>!item.hidden&&!item.sourceArchived) ? <Text style={{color:d.muted,lineHeight:24}}>No active listings were found for this realtor yet.</Text> : route === '/listings' || route === '/favorites' && savedIds.length ? <ThemeCollection brand={brand} listings={route === '/favorites' ? listings.filter(item => savedIds.includes(item.id)) : listings}
      onOpen={id => onNavigate(`/listing/${id}`)} onFavorite={onFavorite} isFavorite={id => savedIds.includes(id)} onBrowse={() => onNavigate('/listings')} /> : route === '/favorites' ? <Text style={{ color: d.muted, lineHeight: 24 }}>Tap a heart on any home to try saving it here. These saves stay in your layout preview.</Text> : feature ? <Text style={{ color: d.muted, lineHeight: 24 }}>{feature.copy}</Text> : <>
      <Text style={{ color: d.muted, lineHeight: 24 }}>Client account controls appear after a client signs in. Explore the app’s navigation here.</Text>
      {([['Collection', '/listings', Layers], ['Saved homes', '/favorites', Heart], ['Messages', '/message', MessageCircle], ['Showings', '/calendar', CalendarDays]] as const).map(([title, path, Icon]) => <Pressable key={path} accessibilityRole="button" accessibilityLabel={title} onPress={() => onNavigate(path)} style={{ padding: 18, borderWidth: 1, borderRadius: 20, borderColor: d.accent + '33', backgroundColor: material.bg + '99', flexDirection: 'row', alignItems: 'center', gap: 16 }}><Icon color={d.accent} size={22}/><Text style={{ color: d.ink, flex: 1, fontSize: 16 }}>{title}</Text><ArrowUpRight color={d.accent} size={18}/></Pressable>)}
    </>}
  </View>;
}
