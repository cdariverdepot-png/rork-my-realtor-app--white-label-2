import Pressable from '@/components/TactilePressable';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { themeDesign } from '@/constants/themeDesigns';
import { clientDestination } from '@/lib/clientNavigation';
import ModalChrome from '@/components/ModalChrome';

export default function AppMenu() {
  const router = useRouter(), auth = useAuth(), { brand } = useBrand();
  const preview = auth.isAdmin && auth.viewAsClient, d = themeDesign(brand.layoutId, brand.theme);
  const links = [
    ['Browse homes', '/listings'], ['Saved homes', '/favorites'], ['Messages', '/messages'], ['Showings', '/calendar'],
    ['Documents', '/documents'], ['Updates', '/notifications'], ['Market insights', '/insights'],
    ...(auth.isClient ? [['My account', '/account'], ['My preferences', '/client-profile']] : []), ['Privacy and terms', '/legal'],
  ];
  return <View style={{ flex: 1, backgroundColor: d.background }}>
    <ModalChrome eyebrow="App menu" onDark={!d.light} />
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12, paddingBottom: 140 }}>
      {preview ? <Text style={{ color: d.muted, lineHeight: 22, marginBottom: 10 }}>Explore your client app. Client account and preference controls appear when a client signs in.</Text> : null}
      {links.map(([label, path]) => <Pressable key={path} accessibilityRole="button" onPress={() => router.navigate(clientDestination(path, preview) as never)} style={{ padding: 18, borderBottomWidth: 1, borderColor: d.accent + '33', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: d.ink, fontSize: 17 }}>{label}</Text><Text style={{ color: d.accent }}>›</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}
