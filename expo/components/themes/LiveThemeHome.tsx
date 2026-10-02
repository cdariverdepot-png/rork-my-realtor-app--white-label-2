import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { ArrowRight, CalendarDays, Heart, MessageCircle } from 'lucide-react-native';
import Pressable from '../TactilePressable';
import FullPortrait from '../FullPortrait';
import ThemeContentSection from '../ThemeContentSection';
import { SCREEN_BG } from '@/constants/backdrops';
import { withThemeSlots } from '@/constants/themeSlots';
import { visibleSections, type ClientSectionId } from '@/constants/sections';
import { orderThemeSections } from '@/constants/themeStructure';
import { usePortraitDimensions } from '@/hooks/usePortraitDimensions';
import { themeComposition, liveThemeBackground } from '@/lib/themeComposition';
import { listingStatusLabel } from '@/lib/listingStatusLabel';
import { safeUri } from '@/lib/safeImageSource';
import type { ManagedListing } from '@/contexts/ListingsContext';
import type { ReferenceHomeProps, ReferenceRoute } from './ReferenceHome';
import { SERIF } from './shared';

// Live materials deliberately do not alter themeDesigns / ThemeFace / carousel art.
const materials = {
  'eliza-editorial': { bg:'#081E1B', ink:'#FAF5E9', accent:'#D9BD87', paper:'#EFE7D9', photo:SCREEN_BG.listings, radius:4, mood:'THE EDIT' },
  'coastal-personal': { bg:'#EFF2EF', ink:'#173E45', accent:'#416C77', paper:'#FFFFFF', photo:SCREEN_BG.note, radius:28, mood:'A PLACE TO BELONG' },
  'advisor-journal': { bg:'#111C22', ink:'#F4F0E6', accent:'#B5CBD7', paper:'#EAE7DF', photo:SCREEN_BG.documents, radius:6, mood:'THE PROPERTY JOURNAL' },
  'warm-concierge': { bg:'#13251F', ink:'#FFF7EB', accent:'#E9BA83', paper:'#EDE1CD', photo:SCREEN_BG.book, radius:24, mood:'YOUR NEXT CHAPTER' },
  'private-collection': { bg:'#231420', ink:'#FCF2E9', accent:'#E0BC89', paper:'#F1E5D5', photo:SCREEN_BG.portal, radius:12, mood:'THE PRIVATE COLLECTION' },
  'modern-editorial': { bg:'#101B24', ink:'#F9F5EE', accent:'#F3AE94', paper:'#EFE9E1', photo:SCREEN_BG.calendar, radius:16, mood:'A NEW PERSPECTIVE' },
  'portrait-statement': { bg:'#142720', ink:'#FAF6EE', accent:'#B9CFBB', paper:'#E7EDE5', photo:SCREEN_BG.favorites, radius:2, mood:'HOME, CONSIDERED' },
} as const;

export default function LiveThemeHome(p: ReferenceHomeProps) {
  const window = useWindowDimensions();
  const width = p.width ?? window.width;
  const b = useMemo(() => withThemeSlots(p.brand), [p.brand]);
  const id = b.layoutId ?? 'private-collection', m = { ...materials[id], bg:liveThemeBackground(id) }, r = b.realtor;
  const portrait = usePortraitDimensions(b.portraitUrl, p.portraitSource);
  const plan = themeComposition(id, width, portrait.ratio, p.listings);
  const visible = visibleSections({ brand:b, visibleListingCount:plan.items.length });
  const [expanded, setExpanded] = useState(false);
  const go = (route:ReferenceRoute) => () => p.onNavigate?.(route);
  const light = id === 'coastal-personal';
  const sectionMaterial = { ...m, light };
  const gutter = width < 360 ? 18 : width > 680 ? 40 : 24;
  const contentWidth = Math.min(width - gutter * 2, 1060);
  const portraitWidth = plan.split ? contentWidth * 0.43 : contentWidth *
    (portrait.ratio >= 1.15 ? 1 : id === 'coastal-personal' ? 0.82 : id === 'advisor-journal' ? 0.76 : id === 'private-collection' ? 0.8 : id === 'portrait-statement' ? 0.86 : 1);
  const title = r.heroMessage.trim() || r.tagline.trim() || r.name;
  const intro = r.welcomeNote.trim();
  const label = (copy:string, color=m.accent as string) => <Text style={{ color, fontSize:11, letterSpacing:2.1, fontFamily:'Inter_500Medium', lineHeight:17 }}>{copy}</Text>;
  const button = (copy:string, route:ReferenceRoute, filled=false) => <Pressable disabled={!p.onNavigate} onPress={go(route)} accessibilityRole="button"
    style={{ minHeight:52, paddingHorizontal:18, flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:12, borderRadius:m.radius,
      backgroundColor:filled ? m.accent : light ? '#FFFFFFBB' : '#FFFFFF0D', borderWidth:1, borderColor:filled ? m.accent : m.accent+'55' }}>
    <Text style={{ color:filled ? m.bg : m.ink, fontSize:14, fontFamily:'Inter_500Medium', flexShrink:1 }}>{copy}</Text><ArrowRight color={filled ? m.bg : m.accent} size={19}/>
  </Pressable>;
  const introduction = <View style={{ flex:plan.split ? 1 : undefined, gap:18, justifyContent:'center', paddingVertical:id === 'advisor-journal' ? 26 : 18,
    paddingHorizontal:light ? 22 : id === 'private-collection' ? 18 : 0, borderRadius:m.radius,
    backgroundColor:light ? '#FFFFFFD9' : id === 'private-collection' ? '#FFFFFF09' : 'transparent',
    borderTopWidth:id === 'advisor-journal' ? 2 : 0, borderColor:m.accent }}>
    {label(r.heroEyebrow || m.mood)}
    <Text style={{ color:m.ink, fontFamily:SERIF, fontSize:title.length > 160 ? 32 : id === 'portrait-statement' ? 50 : 43,
      lineHeight:title.length > 160 ? 38 : id === 'portrait-statement' ? 51 : 46, letterSpacing:-0.8 }}>{title}</Text>
    {!!intro && <View><Text numberOfLines={expanded ? undefined : 4} style={{ color:light ? '#3C6268' : '#ECE8DFCC', fontSize:15, lineHeight:24 }}>{intro}</Text>
      {intro.length > 160 && <Pressable onPress={() => setExpanded(value => !value)} accessibilityRole="button" accessibilityState={{ expanded }} style={{ alignSelf:'flex-start', paddingVertical:12 }}>
        <Text style={{ color:m.accent, fontSize:13, textDecorationLine:'underline' }}>{expanded ? 'Read less' : 'Read my introduction'}</Text></Pressable>}</View>}
    <View style={{ borderLeftWidth:2, borderColor:m.accent, paddingLeft:14, gap:5 }}><Text style={{ color:m.ink, fontSize:16, fontFamily:SERIF }}>{r.name}</Text>
      {!!r.title && <Text style={{ color:m.ink, opacity:0.7, fontSize:12, lineHeight:18 }}>{r.title}</Text>}{!!r.city && <Text style={{ color:m.ink, opacity:0.7, fontSize:12, lineHeight:18 }}>{r.city}</Text>}</View>
    <View style={{ gap:10 }}>{button(r.primaryCta || 'Explore the homes', '/listings', true)}{button(r.secondaryCta || 'Start a conversation', '/message')}</View>
  </View>;
  const portraitPanel = portrait.hasPhoto && <View style={{ alignSelf:id === 'advisor-journal' && !plan.split ? 'flex-end' : 'center', width:portraitWidth, borderRadius:m.radius, overflow:'hidden', borderWidth:1, borderColor:m.accent+'40',
    backgroundColor:light ? '#DDE6E3' : '#FFFFFF08' }}>
    <FullPortrait brand={b} source={p.portraitSource} width={portraitWidth}
      scrollY={p.scrollY} maxHeight={width * 1.55}/>
  </View>;
  const heading = <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:22 }}>
    <View style={{ flex:1, gap:7 }}>{label(b.curated.eyebrow || m.mood)}<Text style={{ color:m.ink, fontFamily:SERIF, fontSize:32, lineHeight:35 }}>{b.curated.title || 'Explore the collection'}</Text></View>
    <Pressable disabled={!p.onNavigate} onPress={go('/listings')} accessibilityRole="button" accessibilityLabel="View all listings" style={{ width:48, height:48, borderRadius:24, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:m.accent+'66' }}><ArrowRight color={m.accent} size={22}/></Pressable>
  </View>;
  function card(item:ManagedListing, index:number, spotlight=false) {
    const uri = safeUri(item.images?.find(image => !!safeUri(image)) || item.image);
    const overlay = plan.collection === 'gallery' || spotlight;
    const cardWidth = spotlight ? contentWidth : plan.cardWidth;
    const facts = [item.beds > 0 ? `${item.beds} beds` : '', item.baths > 0 ? `${item.baths} baths` : '', item.sqft].filter(Boolean).join(' · ');
    return <View key={item.id} style={{ width:cardWidth, borderRadius:m.radius, overflow:'hidden', backgroundColor:light ? '#FFFFFF' : '#FFFFFF08', borderWidth:1, borderColor:m.accent+'33' }}>
      <Pressable disabled={!p.onOpen} onPress={() => p.onOpen?.(item.id)} accessibilityRole="button" accessibilityLabel={`View ${item.title}`}>
        {!!uri && <View style={{ height:spotlight ? 330 : plan.collection === 'minimal' ? 280 : 230 }}>
          <Image source={{ uri }} recyclingKey={uri} contentFit="cover" transition={0} cachePolicy="memory-disk" style={StyleSheet.absoluteFill}/>
          <LinearGradient colors={['#00000008', overlay ? '#000000DD' : '#00000022']} style={StyleSheet.absoluteFill}/>
          <View style={{ position:'absolute', top:16, left:16, paddingHorizontal:11, paddingVertical:7, backgroundColor:'#14211ED9', borderRadius:20 }}><Text style={{ color:'#FFFFFF', fontSize:11 }}>{listingStatusLabel(item)}</Text></View>
          {overlay && <View style={{ position:'absolute', bottom:22, left:20, right:20, gap:7 }}><Text style={{ color:'#FFF8EF', fontFamily:SERIF, fontSize:29 }}>{item.title}</Text><Text style={{ color:'#FFFFFF', fontSize:17 }}>{item.price}</Text></View>}
        </View>}
        <View style={{ padding:18, gap:8 }}>
          {!uri && label(listingStatusLabel(item))}
          {plan.collection === 'journal' && label(String(index + 1).padStart(2,'0')+' / PROPERTY NOTES')}
          {(!overlay || !uri) && <><Text style={{ color:m.ink, fontFamily:SERIF, fontSize:25, lineHeight:28 }}>{item.title}</Text>{!!item.price && <Text style={{ color:m.accent, fontSize:18 }}>{item.price}</Text>}</>}
          {!!item.neighborhood && <Text style={{ color:m.ink, opacity:0.8, fontSize:13, lineHeight:20 }}>{item.neighborhood}</Text>}
          {!!facts && <Text style={{ color:m.ink, opacity:0.72, fontSize:12, lineHeight:19 }}>{facts}</Text>}
          {plan.collection === 'journal' && !!(item.description || item.elizaTake) && <Text numberOfLines={3} style={{ color:m.ink, opacity:0.8, fontSize:14, lineHeight:22 }}>{item.description || item.elizaTake}</Text>}
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingTop:7 }}>{label('EXPLORE THIS HOME')}<ArrowRight size={17} color={m.accent}/></View>
        </View>
      </Pressable>
      <Pressable disabled={!p.onFavorite} onPress={() => p.onFavorite?.(item.id)} accessibilityRole="button" accessibilityLabel={p.isFavorite?.(item.id) ? 'Unsave home' : 'Save home'} accessibilityState={{ selected:!!p.isFavorite?.(item.id) }}
        style={{ position:'absolute', top:12, right:12, width:44, height:44, backgroundColor:'#14211ED9', borderRadius:22, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#FFFFFF66' }}>
        <Heart color="#FFFFFF" fill={p.isFavorite?.(item.id) ? m.accent : 'transparent'} size={20}/></Pressable>
    </View>;
  }
  const collection = visible.includes('listings') && plan.items.length > 0 && <View style={{ paddingTop:38, marginBottom:22, overflow:'hidden' }}>
    <Image source={id === 'private-collection' ? SCREEN_BG.portal : SCREEN_BG.listings} contentFit="cover" transition={0} accessible={false} style={[StyleSheet.absoluteFill,{height:460,opacity:light ? 0.2 : 0.42}]}/>
    <LinearGradient colors={[m.bg+'66',m.bg]} style={[StyleSheet.absoluteFill,{height:460}]}/>
    <View style={{ width:contentWidth, alignSelf:'center' }}>{heading}</View>
    {plan.collection === 'spotlight' && <View style={{ alignSelf:'center', marginBottom:18 }}>{card(plan.items[0],0,true)}</View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:(width-contentWidth)/2, gap:18, paddingBottom:12 }}>
      {(plan.collection === 'spotlight' ? plan.items.slice(1) : plan.items).map((item,index) => card(item,index))}
    </ScrollView>
  </View>;
  const concierge = visible.includes('concierge') && <View style={{ width:contentWidth, alignSelf:'center', borderRadius:m.radius, overflow:'hidden', marginVertical:24 }}>
    <Image source={SCREEN_BG.calendar} style={StyleSheet.absoluteFill} contentFit="cover" transition={0}/>
    <LinearGradient colors={['#081C20A6','#081C20F2']} style={StyleSheet.absoluteFill}/>
    <View style={{ padding:24, gap:13 }}>{label('WITH YOU, EVERY STEP')}<Text style={{ color:'#FFF8EF', fontFamily:SERIF, fontSize:31, lineHeight:34 }}>{b.concierge.title || 'A more personal way home'}</Text>
      {[{label:'Talk with your realtor',route:'/message',Icon:MessageCircle},{label:'Plan a visit',route:'/book',Icon:CalendarDays},{label:'Your saved homes',route:'/favorites',Icon:Heart}].map(action => <Pressable key={action.route} accessibilityRole="button" disabled={!p.onNavigate} onPress={go(action.route as ReferenceRoute)} style={{ flexDirection:'row', alignItems:'center', gap:14, minHeight:58, borderTopWidth:1, borderColor:'#FFFFFF24' }}>
        <action.Icon color={m.accent} size={21}/><Text style={{ color:'#FFFFFF', fontSize:14, flex:1 }}>{action.label}</Text><ArrowRight color={m.accent} size={17}/></Pressable>)}
    </View>
  </View>;
  const additional = orderThemeSections(visible,id).filter(section => !['hero','listings','concierge'].includes(section));
  return <View style={{ backgroundColor:m.bg, paddingBottom:24 }}>
    <View style={{ overflow:'hidden' }}>
      <Image source={m.photo} contentFit="cover" transition={0} style={[StyleSheet.absoluteFill,{ height:Math.max(950,width * 2) }]} accessible={false}/>
      <LinearGradient colors={light ? ['#EFF2EFE6','#EFF2EFAA',m.bg] : [m.bg+'66',m.bg+'BB',m.bg]} locations={[0,0.38,1]} style={StyleSheet.absoluteFill}/>
      <View style={{ width:contentWidth, alignSelf:'center', paddingTop:p.topInset ?? 28, paddingBottom:24 }}>
        <View style={{ flexDirection:'row', gap:14, alignItems:'center', marginBottom:28, paddingBottom:22, borderBottomWidth:1, borderColor:m.accent+'40' }}>
          {!!r.monogram && <Text style={{ color:m.accent, fontFamily:SERIF, fontSize:40 }}>{r.monogram}</Text>}
          <View style={{ flex:1, gap:5 }}><Text style={{ color:m.ink, fontSize:13, letterSpacing:2, lineHeight:20 }}>{r.brandName || r.name}</Text>{!!r.brandSub && label(r.brandSub)}</View>
          <Pressable disabled={!p.onNavigate} onPress={go('/message')} accessibilityRole="button" accessibilityLabel="Message your realtor" style={{ width:48, height:48, borderRadius:24, borderWidth:1, borderColor:m.accent+'88', alignItems:'center', justifyContent:'center' }}><MessageCircle size={22} color={m.accent}/></Pressable>
        </View>
        {visible.includes('hero') && <View style={{ flexDirection:plan.split ? 'row' : 'column', gap:plan.split ? 36 : 24 }}>
          {plan.portraitFirst ? <>{portraitPanel}{introduction}</> : <>{introduction}{portraitPanel}</>}
        </View>}
      </View>
    </View>
    {id === 'advisor-journal' && visible.includes('beat') && <View style={{ width:contentWidth, alignSelf:'center', marginTop:24 }}><ThemeContentSection id="beat" brand={b} onNavigate={p.onNavigate} material={sectionMaterial}/></View>}
    {collection}{concierge}
    {!p.primaryOnly && additional.filter(section => id !== 'advisor-journal' || section !== 'beat').map((section:ClientSectionId) => <View key={section} style={{ marginTop:16, borderTopWidth:1, borderColor:m.accent+'22' }}>
      {section === 'footer' && p.renderAdditional ? p.renderAdditional(section) : <ThemeContentSection id={section} brand={b} onNavigate={p.onNavigate} onContact={p.onContact} material={sectionMaterial}/>}</View>)}
  </View>;
}
