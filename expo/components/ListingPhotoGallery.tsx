import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import PressableScale from './PressableScale';
import { bustedUri } from '@/lib/imageUri';
import { brand, fonts } from '@/constants/colors';

/** The same saved photo collection is browsable in the real app and theme preview. */
export default function ListingPhotoGallery({ images, cover, title, updatedAt, height = 320, children }:
  { images?: string[]; cover?: string; title: string; updatedAt?: number; height?: number; children?: React.ReactNode }) {
  const photos = [...new Set((images?.length ? images : [cover]).filter((uri): uri is string => !!uri))];
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [title]);
  const index = Math.min(selected, Math.max(0, photos.length - 1));
  const move = (step: number) => setSelected((index + step + photos.length) % photos.length);
  return <View>
    <View style={{ height, backgroundColor: brand.forest }}>
      {photos.length > 0 && <Image accessibilityLabel={`${title}, photo ${index + 1}`} source={{ uri: bustedUri(photos[index], updatedAt) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      {children}
      {photos.length > 1 && <>
        <PressableScale accessibilityRole="button" accessibilityLabel="Previous property photo" onPress={() => move(-1)} style={[styles.arrow, { left: 12 }]}><ChevronLeft color={brand.ivory} size={22} /></PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel="Next property photo" onPress={() => move(1)} style={[styles.arrow, { right: 12 }]}><ChevronRight color={brand.ivory} size={22} /></PressableScale>
      </>}
      {photos.length > 0 && <View style={styles.counter}><Text accessibilityLiveRegion="polite" style={styles.counterText}>{index + 1} / {photos.length} photos</Text></View>}
    </View>
    {photos.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails}>
      {photos.map((uri, i) => <PressableScale key={uri} accessibilityRole="button" accessibilityLabel={`View property photo ${i + 1} of ${photos.length}`} accessibilityState={{ selected: i === index }} onPress={() => setSelected(i)} style={[styles.thumb, i === index && styles.selected]}>
        <Image source={{ uri: bustedUri(uri, updatedAt) }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
      </PressableScale>)}
    </ScrollView>}
  </View>;
}
const styles = StyleSheet.create({
  arrow: { position: 'absolute', top: '42%', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,26,21,0.65)' },
  counter: { position: 'absolute', top: 78, right: 20, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(8,26,21,0.65)' },
  counterText: { fontFamily: fonts.sansMedium, fontSize: 11, color: brand.ivory },
  thumbnails: { padding: 12, gap: 8 },
  thumb: { width: 86, height: 64, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  selected: { borderColor: brand.gold },
});
