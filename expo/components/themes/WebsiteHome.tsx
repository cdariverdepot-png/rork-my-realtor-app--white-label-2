import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Heart, ArrowRight, MessageCircle } from 'lucide-react-native';
import PortraitImage from '../PortraitImage';
import { websiteAppearance, websiteFont } from '@/lib/websitePresentation';
import type { ReferenceHomeProps, ReferenceRoute } from './ReferenceHome';
import type { WebsiteSection } from '../../../supabase/functions/analyze-realtor-build/websiteDesign';

/** Native website interpretation, shared by onboarding, preview and published Home. */
export default function WebsiteHome(p: ReferenceHomeProps) {
  const { width: windowWidth } = useWindowDimensions();
  const width = p.width ?? windowWidth, s = width / 390, b = p.brand, source = b.websiteDesign!;
  const a = websiteAppearance(b) ?? source.original, optimized = b.websiteVariant === 'optimized';
  const headingFont = websiteFont(a.headingFontFamily, true), bodyFont = websiteFont(a.fontFamily);
  const entries = p.listings.filter(l => !l.hidden && !l.sourceArchived);
  const opacity = useRef(new Animated.Value(1)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => { let active = true; void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; sub.remove(); }; }, []);
  useEffect(() => {
    if (reducedMotion || a.motion === 'none' || p.miniature) { opacity.setValue(1); return; }
    opacity.setValue(0); Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [reducedMotion, a.motion, opacity, p.miniature]);
  const navigate = (route: ReferenceRoute) => p.onNavigate?.(route);
  const button = (label: string, route: ReferenceRoute, filled = true) => <Pressable accessibilityRole="button" onPress={() => navigate(route)} style={{ minHeight: 48 * s, paddingHorizontal: 20 * s, paddingVertical: 14 * s, borderRadius: a.radius * s, borderWidth: 1, borderColor: a.accent, backgroundColor: filled ? a.accent : a.background, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: filled ? contrast(a.accent) : a.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 * s }}>{label}</Text>
  </Pressable>;
  const heroTitle = optimized ? b.realtor.heroMessage || source.heroTitle : source.heroTitle || b.realtor.heroMessage;
  const heroSubtitle = optimized ? b.realtor.welcomeNote || source.heroSubtitle : source.heroSubtitle || b.realtor.welcomeNote;
  const image = source.heroImageUrl;
  const overlay = a.layout === 'image-overlay' && !!image;
  const heroCopy = <View style={{ padding: a.spacing * s, gap: 18 * s, justifyContent: 'flex-end', flex: overlay ? 1 : undefined, backgroundColor: overlay ? '#10182099' : a.background }}>
    {!!b.realtor.city && <Text style={{ color: overlay ? '#ffffff' : a.accent, fontFamily: bodyFont, fontSize: 12 * s, letterSpacing: 2 }}>{b.realtor.city.toUpperCase()}</Text>}
    <Text style={{ color: overlay ? '#ffffff' : a.ink, fontFamily: headingFont, fontSize: a.headingSize * s, lineHeight: (a.headingSize + 8) * s }}>{heroTitle || b.realtor.brandName || b.realtor.name}</Text>
    {!!heroSubtitle && <Text style={{ color: overlay ? '#ffffff' : a.ink, fontFamily: bodyFont, fontSize: 15 * s, lineHeight: 24 * s }}>{heroSubtitle}</Text>}
    <View style={{ gap: 10 * s }}>{button(b.realtor.primaryCta || 'Explore listings', '/listings')}{button('Chat with ' + (b.realtor.name.split(' ')[0] || 'your realtor'), '/message', false)}</View>
  </View>;
  const collection = (title = b.curated.title || 'Available homes') => <View style={{ gap: 18 * s, paddingVertical: a.spacing * s }}>
    <View style={{ paddingHorizontal: a.spacing * s, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: a.ink, fontFamily: headingFont, fontSize: 27 * s, flex: 1 }}>{title}</Text><Pressable accessibilityLabel="View all listings" onPress={() => navigate('/listings')} style={{ padding: 12 }}><ArrowRight color={a.accent} size={22 * s} /></Pressable></View>
    {!entries.length ? <Text style={{ color: a.ink, paddingHorizontal: a.spacing * s, lineHeight: 24 }}>New listings will appear here as your realtor adds them. Get in touch to discuss your search.</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: a.spacing * s, gap: 16 * s }}>
      {entries.slice(0, optimized ? 6 : 10).map(l => <View key={l.id} style={{ width: (optimized ? 285 : 310) * s, borderRadius: a.radius * s, overflow: 'hidden', borderColor: a.ink + '22', borderWidth: 1, backgroundColor: a.panel }}>
        <Pressable onPress={() => p.onOpen?.(l.id)} accessibilityRole="button" accessibilityLabel={l.title}>
          <Image source={{ uri: l.images?.[0] || l.image }} contentFit="cover" style={{ width: '100%', height: 205 * s }} />
          <View style={{ padding: 18 * s, gap: 8 * s }}><Text style={{ color: a.ink, fontSize: 25 * s, fontFamily: headingFont }}>{l.price}</Text><Text style={{ color: a.ink, fontFamily: bodyFont, fontSize: 16 * s }}>{l.title}</Text><Text style={{ color: a.ink, fontSize: 13 * s }}>{[l.beds > 0 ? `${l.beds} beds` : '', l.baths > 0 ? `${l.baths} baths` : '', l.sqft && l.sqft !== '0' ? l.sqft : ''].filter(Boolean).join(' · ') || l.neighborhood}</Text></View>
        </Pressable><Pressable accessibilityLabel={p.isFavorite?.(l.id) ? 'Remove saved home' : 'Save home'} accessibilityRole="button" onPress={() => p.onFavorite?.(l.id)} style={{ position: 'absolute', top: 12, right: 12, padding: 12, borderRadius: 24, backgroundColor: a.background }}><Heart size={22 * s} color={a.ink} fill={p.isFavorite?.(l.id) ? a.accent : 'transparent'} /></Pressable>
      </View>)}
    </ScrollView>}
  </View>;
  const section = (item: WebsiteSection, i: number) => {
    if (item.kind === 'listings') return <View key={i}>{collection(item.title)}</View>;
    const route: ReferenceRoute = item.kind === 'contact' ? '/message' : item.kind === 'about' ? '/note' : item.kind === 'services' ? '/book' : '/insights';
    return <View key={i} style={{ padding: a.spacing * s, gap: 16 * s, borderTopWidth: 1, borderTopColor: a.ink + '15' }}>
      {!!item.imageUrl && <Image source={{ uri: item.imageUrl }} contentFit="cover" style={{ width: '100%', height: 200 * s, borderRadius: a.radius * s }} />}
      <Text style={{ color: a.ink, fontFamily: headingFont, fontSize: 28 * s }}>{item.title}</Text>
      {!!item.body && <Text style={{ color: a.ink, fontFamily: bodyFont, fontSize: 15 * s, lineHeight: 25 * s }}>{item.kind === 'about' && optimized ? b.note.body.filter(Boolean).join('\n\n') || item.body : item.body}</Text>}
      {item.kind !== 'testimonials' && button(item.kind === 'contact' ? 'Start a conversation' : item.kind === 'services' ? 'Request a showing' : 'Explore more', route, false)}
    </View>;
  };
  const originalSections = source.sections;
  const sections = optimized ? [...originalSections.filter(x => x.kind === 'about').slice(0, 1), ...originalSections.filter(x => x.kind === 'services').slice(0, 1), ...originalSections.filter(x => x.kind === 'testimonials').slice(0, 1)] : originalSections;
  const backdrop = !optimized && source.backgroundImageUrl;
  return <View style={{ width, backgroundColor: a.background }}>
    {!!backdrop && <Image source={{ uri: backdrop }} contentFit="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />}
    <Animated.View style={{ marginHorizontal: backdrop ? 6 * s : 0, backgroundColor: a.background, opacity, transform: a.motion === 'rise' ? [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] : undefined }}>
    {!optimized && !!source.headerImageUrl && <Image source={{ uri: source.headerImageUrl }} contentFit="contain" style={{ width: '100%', height: 90 * s, marginTop: p.topInset ?? 0 }} accessibilityLabel={b.realtor.brandName || b.realtor.name} />}
    <View style={{ paddingHorizontal: a.spacing * s, paddingTop: (!optimized && source.headerImageUrl ? 0 : p.topInset ?? 0) + 18 * s, paddingBottom: 18 * s, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      {!!source.logoUrl ? <Image source={{ uri: source.logoUrl }} contentFit="contain" style={{ width: 190 * s, height: 60 * s }} accessibilityLabel={b.realtor.brandName || b.realtor.name} /> : <Text style={{ flex: 1, color: a.ink, fontFamily: headingFont, fontSize: 23 * s }}>{b.realtor.brandName || b.realtor.name}</Text>}
      <Pressable accessibilityLabel="Chat" onPress={() => navigate('/message')} style={{ marginLeft: 'auto', padding: 12 }}><MessageCircle color={a.accent} size={24 * s} /></Pressable>
    </View>
    {overlay ? <View style={{ minHeight: 510 * s, overflow: 'hidden' }}><Image source={{ uri: image }} contentFit="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />{heroCopy}</View> : <>
      {a.layout === 'text-first' && heroCopy}
      {!!image && <Image source={{ uri: image }} contentFit="cover" style={{ width: '100%', height: 300 * s }} />}
      {a.layout === 'portrait-split' && !!b.portraitUrl && <PortraitImage uri={b.portraitUrl} contentFit="contain" style={{ width: '100%', height: 340 * s }} />}
      {a.layout !== 'text-first' && heroCopy}
    </>}
    {(optimized || !sections.some(x => x.kind === 'listings')) && collection()}
    {sections.map(section)}
    <View style={{ padding: a.spacing * s, gap: 16 * s }}>{button('Contact ' + b.realtor.name, '/message')}<Text style={{ color: a.ink, fontFamily: bodyFont, lineHeight: 23 * s }}>{[b.realtor.phone, b.realtor.email, b.credentials.license.brokerage, b.credentials.license.number].filter(Boolean).join('\n')}</Text></View>
  </Animated.View></View>;
}
function contrast(hex: string) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 155 ? '#111820' : '#ffffff';
}
