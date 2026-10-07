import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PixelRatio, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Heart, ArrowRight } from 'lucide-react-native';
import PortraitImage from '../PortraitImage';
import { websiteAppearance, websiteFont } from '@/lib/websitePresentation';
import type { ReferenceHomeProps, ReferenceRoute } from './ReferenceHome';
import type { WebsiteSection } from '@/lib/websiteDesignRuntime';
import { composeWebsiteSections, presentWebsiteSurface, websiteCopy, frameForSlot, renderableHero, type ImageRole } from '@/lib/websiteDesignRuntime';

/** Native website interpretation, shared by onboarding, preview and published Home. */
export default function WebsiteHome(p: ReferenceHomeProps) {
  const { width: windowWidth } = useWindowDimensions();
  const width = p.width ?? windowWidth, s = width / 390, b = p.brand, source = b.websiteDesign!;
  const raw = websiteAppearance(b) ?? source.original;
  const surface = presentWebsiteSurface(raw.background, raw.accent, raw.ink);
  const a = { ...raw, background: surface.background, accent: surface.accent, ink: surface.ink, panel: surface.panel, muted: surface.ink }, optimized = b.websiteVariant === 'optimized';
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
  const dpr = Math.min(3, Math.max(1, PixelRatio.get?.() || 2));
  // Only a genuine hero is shown above the portrait; an in-copy illustration never is (Cindy regression).
  const hero = renderableHero(source, dpr);
  const portraitMeta = source.imagery?.portrait;
  const sameFile = (left?: string, right?: string) => !!left && !!right && left.split('?')[0] === right.split('?')[0];
  const thumbnail = (uri?: string) => !!uri && /[?&](?:resize|fit)=\d+/i.test(uri) && !!source.portraitImageUrl && sameFile(uri, source.portraitImageUrl);
  const image = hero?.uri;
  const heroFrame = hero?.frame;
  const portraitUri = portraitMeta && (!b.portraitUrl || sameFile(b.portraitUrl, portraitMeta.selectedUrl) || thumbnail(b.portraitUrl)) ? portraitMeta.selectedUrl : b.portraitUrl;
  const portraitFrame = portraitMeta ? frameForSlot({ width: portraitMeta.width, height: portraitMeta.height, role: 'portrait' }, { width: 280, height: 360, purpose: 'portrait' }, dpr) : undefined;
  const logoFrame = source.imagery?.logo?.width ? frameForSlot({ width: source.imagery.logo.width, height: source.imagery.logo.height, role: 'logo' }, { width: 190, height: 60, purpose: 'logo' }, dpr) : undefined;
  const overlay = a.layout === 'image-overlay' && !!image && !!heroFrame && heroFrame.fit === 'cover' && heroFrame.crop !== 'rejected';
  const heroCopy = <View style={{ padding: a.spacing * s, gap: 18 * s, justifyContent: 'flex-end', flex: overlay ? 1 : undefined, backgroundColor: overlay ? '#10182099' : a.background }}>
    {!!b.realtor.city && <Text style={{ color: overlay ? '#ffffff' : a.accent, fontFamily: bodyFont, fontSize: 12 * s, letterSpacing: 2 }}>{b.realtor.city.toUpperCase()}</Text>}
    <Text style={{ color: overlay ? '#ffffff' : a.ink, fontFamily: headingFont, fontSize: a.headingSize * s, lineHeight: (a.headingSize + 8) * s }}>{heroTitle || b.realtor.brandName || b.realtor.name}</Text>
    {!!heroSubtitle && <Text style={{ color: overlay ? '#ffffff' : a.ink, fontFamily: bodyFont, fontSize: 15 * s, lineHeight: 24 * s }}>{heroSubtitle}</Text>}
    <View style={{ gap: 10 * s }}>{button('View listings', '/listings')}</View>
  </View>;
  const collectionTitle = b.curated.title && !/explore|learn more|read more|view more|see more|click here/i.test(b.curated.title) ? b.curated.title : 'Available homes';
  const collection = (title = collectionTitle) => <View style={{ gap: 18 * s, paddingVertical: a.spacing * s }}>
    <View style={{ paddingHorizontal: a.spacing * s, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: a.ink, fontFamily: headingFont, fontSize: 27 * s, flex: 1 }}>{title}</Text><Pressable accessibilityLabel="View all listings" onPress={() => navigate('/listings')} style={{ padding: 12 }}><ArrowRight color={a.accent} size={22 * s} /></Pressable></View>
    {!entries.length ? <Text style={{ color: a.ink, paddingHorizontal: a.spacing * s, lineHeight: 24 }}>New listings will appear here as your realtor adds them. Get in touch to discuss your search.</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: a.spacing * s, gap: 16 * s }}>
      {entries.slice(0, optimized ? 6 : 10).map(l => <View key={l.id} style={{ width: (optimized ? 285 : 310) * s, borderRadius: a.radius * s, overflow: 'hidden', borderColor: a.ink + '22', borderWidth: 1, backgroundColor: a.panel }}>
        <Pressable onPress={() => p.onOpen?.(l.id)} accessibilityRole="button" accessibilityLabel={l.title}>
          <View style={{ position: 'relative' }}>
            <Image source={{ uri: l.images?.[0] || l.image }} contentFit="cover" style={{ width: '100%', height: 205 * s }} />
            {p.recommendedIds?.includes(l.id) && <View style={{ position: 'absolute', left: 12 * s, top: 12 * s, maxWidth: '78%', paddingHorizontal: 10 * s, paddingVertical: 6 * s, borderRadius: 999, backgroundColor: a.accent }}><Text style={{ color: contrast(a.accent), fontFamily: 'Inter_600SemiBold', fontSize: 10 * s }}>{p.recommendationLabel || 'Recommended by your realtor'}</Text></View>}
          </View>
          <View style={{ padding: 18 * s, gap: 8 * s }}><Text style={{ color: a.ink, fontSize: 25 * s, fontFamily: headingFont }}>{l.price}</Text><Text style={{ color: a.ink, fontFamily: bodyFont, fontSize: 16 * s }}>{l.title}</Text><Text style={{ color: a.ink, fontSize: 13 * s }}>{[l.beds > 0 ? `${l.beds} beds` : '', l.baths > 0 ? `${l.baths} baths` : '', l.sqft && l.sqft !== '0' ? l.sqft : ''].filter(Boolean).join(' · ') || l.neighborhood}</Text></View>
        </Pressable><Pressable accessibilityLabel={p.isFavorite?.(l.id) ? 'Remove saved home' : 'Save home'} accessibilityRole="button" onPress={() => p.onFavorite?.(l.id)} style={{ position: 'absolute', top: 12, right: 12, padding: 12, borderRadius: 24, backgroundColor: a.background }}><Heart size={22 * s} color={a.ink} fill={p.isFavorite?.(l.id) ? a.accent : 'transparent'} /></Pressable>
      </View>)}
    </ScrollView>}
  </View>;
  const role: Record<string, string> = { area: 'THE AREA', profile: 'ABOUT', services: 'SERVICES', testimonials: 'CLIENTS', content: 'FROM THE SITE' };
  const section = (item: WebsiteSection, i: number) => {
    const copy = websiteCopy(item.intent === 'profile' && optimized ? b.note.body.filter(Boolean).join(' ') || item.body : item.body);
    if (!item.title && !copy) return null;
    const purpose = item.imageRole === 'portrait' ? 'portrait' : item.imageRole === 'logo' ? 'logo' : item.imageRole === 'listing' ? 'listing' : 'article';
    const picture = item.imageUrl ? frameForSlot({ width: item.imageWidth, height: item.imageHeight, role: (item.imageRole || 'article') as ImageRole }, { width: 320, height: 180, purpose }, dpr) : undefined;
    return <View key={i} style={{ marginHorizontal: a.spacing * s, marginTop: 8 * s, marginBottom: 8 * s, padding: 22 * s, gap: 10 * s, borderRadius: Math.max(a.radius, 18) * s, backgroundColor: a.panel, borderWidth: 1, borderColor: a.accent + '33' }}>
      <Text style={{ color: a.accent, fontFamily: 'Inter_600SemiBold', fontSize: 11 * s, letterSpacing: 1.6 }}>{role[item.intent || 'content'] || 'FROM THE SITE'}</Text>
      {!!item.imageUrl && !!picture && <Image source={{ uri: item.imageUrl }} contentFit={picture.fit} style={{ width: picture.width * s, height: picture.height * s, alignSelf: picture.fit === 'contain' ? 'center' : undefined, borderRadius: Math.max(12, a.radius) * s }} />}
      <Text style={{ color: a.ink, fontFamily: headingFont, fontSize: 26 * s, lineHeight: 32 * s }}>{item.title}</Text>
      {!!copy && <Text numberOfLines={8} style={{ color: a.ink, fontFamily: bodyFont, fontSize: 15 * s, lineHeight: 24 * s }}>{copy}</Text>}
    </View>;
  };
  const sectionCandidates = composeWebsiteSections(source.sections)
    .filter((item): item is WebsiteSection => item.destination === 'unique' || (item.destination === 'native' && item.native === 'listings'));
  const sectionLimit = optimized ? 3 : 6;
  const listingAnchor = sectionCandidates.find(item => item.kind === 'listings');
  const sections = sectionCandidates.slice(0, sectionLimit);
  if (listingAnchor && !sections.includes(listingAnchor)) {
    sections.push(listingAnchor);
    sections.sort((left, right) => sectionCandidates.indexOf(left) - sectionCandidates.indexOf(right));
  }
  const backdrop = !optimized && source.backgroundImageUrl;
  return <View style={{ width, backgroundColor: a.background }}>
    {!!backdrop && <Image source={{ uri: backdrop }} contentFit="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />}
    <Animated.View style={{ marginHorizontal: backdrop ? 6 * s : 0, backgroundColor: a.background, opacity, transform: a.motion === 'rise' ? [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] : undefined }}>
    {!optimized && !!source.headerImageUrl && <Image source={{ uri: source.headerImageUrl }} contentFit="contain" style={{ width: '100%', height: 90 * s, marginTop: p.topInset ?? 0 }} accessibilityLabel={b.realtor.brandName || b.realtor.name} />}
    <View style={{ paddingHorizontal: a.spacing * s, paddingTop: (!optimized && source.headerImageUrl ? 0 : p.topInset ?? 0) + 18 * s, paddingBottom: 18 * s, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      {!!source.logoUrl ? <Image source={{ uri: source.logoUrl }} contentFit="contain" style={{ width: (logoFrame?.width ?? 190) * s, height: (logoFrame?.height ?? 60) * s }} accessibilityLabel={b.realtor.brandName || b.realtor.name} /> : <Text style={{ flex: 1, color: a.ink, fontFamily: headingFont, fontSize: 23 * s }}>{b.realtor.brandName || b.realtor.name}</Text>}
    </View>
    {overlay ? <View style={{ minHeight: (heroFrame?.height ?? 220) * s, overflow: 'hidden' }}><Image source={{ uri: image }} contentFit="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />{heroCopy}</View> : <>
      {a.layout === 'text-first' && heroCopy}
      {!!image && <Image source={{ uri: image }} contentFit={heroFrame?.fit ?? 'cover'} style={heroFrame ? { width: heroFrame.width * s, height: heroFrame.height * s, alignSelf: 'center' } : { width: '100%', height: 300 * s }} />}
      {!!portraitUri && (a.layout === 'portrait-split' || !!portraitMeta) && !sameFile(portraitUri, image) && <PortraitImage uri={portraitUri} contentFit="contain" style={{ width: (portraitFrame?.width ?? 260) * s, height: (portraitFrame?.height ?? 340) * s, alignSelf: 'center' }} />}
      {a.layout !== 'text-first' && heroCopy}
    </>}
    {!sections.some(x => x.kind === 'listings') && collection()}
    {sections.map((item, i) => item.kind === 'listings' ? collection(item.title || collectionTitle) : section(item, i))}
    <View style={{ padding: a.spacing * s, gap: 8 * s }}><Text style={{ color: a.ink, fontFamily: bodyFont, lineHeight: 23 * s }}>{[b.realtor.phone, b.realtor.email, b.credentials.license.brokerage, b.credentials.license.number].filter(Boolean).join('\n')}</Text></View>
  </Animated.View></View>;
}
function contrast(hex: string) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 155 ? '#111820' : '#ffffff';
}
