import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBrand } from '@/contexts/BrandContext';
import { useListings } from '@/contexts/ListingsContext';
import { requiredStatus } from '@/constants/sections';
import { refreshWebsiteDesign } from '@/lib/appBuilder/buildService';
import { refreshWebsitePresentation, restoreWebsiteOriginal, websiteCandidate } from '@/lib/websitePresentation';
import ThemePreviewModal from './ThemePreviewModal';

/** Reuses the existing owner draft, importer, portrait preview and publication boundary. */
export default function DesignPublicationPanel() {
  const router = useRouter(), model = useBrand(), { all } = useListings();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<'draft' | 'published' | null>(null);
  const run = async (name: string, action: () => Promise<void>) => {
    if (busy) return; setBusy(name); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please retry.'); } finally { setBusy(null); }
  };
  const button = (label: string, action: () => void, primary = false, disabled = false) => <Pressable key={label} accessibilityRole="button" onPress={action} disabled={!!busy || disabled} style={{ padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#D4B98955', backgroundColor: primary ? '#D4B989' : '#151B20', opacity: busy || disabled ? .5 : 1 }}><Text style={{ color: primary ? '#151B20' : '#F5EFE5', fontWeight: '600' }}>{busy === label ? 'Working…' : label}</Text></Pressable>;
  const publishLabel = model.isPublished ? 'Publish Changes' : 'Publish My App';
  return <View style={{ marginHorizontal: 22, marginTop: 24, padding: 20, gap: 14, borderWidth: 1, borderColor: '#D4B98944', borderRadius: 18, backgroundColor: '#11171D' }}>
    <Text style={{ color: '#D4B989', fontSize: 11, letterSpacing: 1.5 }}>YOUR CLIENT APP</Text>
    <Text style={{ color: '#F5EFE5', fontSize: 24 }}>{model.isPublished ? model.hasUnpublishedChanges ? 'Live app · unpublished draft' : 'Your app is live' : 'Your app is a draft'}</Text>
    <Text style={{ color: '#C5BDAF', lineHeight: 22 }}>Design changes reach clients when you publish. Your listing inventory updates independently.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {button('Preview draft', () => setPreview('draft'))}
      {model.isPublished && button('View published app', () => setPreview('published'))}
      {button('Edit draft', () => router.push('/admin/studio'))}
      {button(publishLabel, () => void run(publishLabel, async () => {
        const firstPublication = !model.isPublished;
        await model.publishBrand();
        if (firstPublication) router.push('/admin/ready'); else setNotice('Changes published. Your invitations and client data are preserved.');
      }), true, !requiredStatus(model.brand).complete || model.isPublished && !model.hasUnpublishedChanges)}
      {button('Refresh Website Design', () => void run('Refresh Website Design', async () => {
        const design = await refreshWebsiteDesign(model.brand.websiteDesign?.sourceUrl);
        await model.saveBrand(refreshWebsitePresentation(model.brand, design));
        setPreview('draft');
        setNotice('Refreshed design saved as a draft. Inspect it before publishing.');
      }))}
      {model.brand.websiteDesign && button('Restore website original', () => void run('Restore website original', async () => {
        await model.saveBrand(restoreWebsiteOriginal(model.brand)); setPreview('draft');
      }))}
      {model.brand.previousWebsiteDesign && button('Restore prior website appearance', () => void run('Restore prior website appearance', async () => {
        const next = { ...model.brand, websiteDesign: model.brand.previousWebsiteDesign, previousWebsiteDesign: model.brand.websiteDesign };
        await model.saveBrand(websiteCandidate(next, model.brand.websiteVariant)); setPreview('draft');
      }))}
      {model.previousPublished && button('Revert published design', () => void run('Revert published design', async () => {
        await model.restorePreviousPublished(); setPreview('draft'); setNotice('Previous design restored to your draft. Publish to make it live again.');
      }))}
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#FFBAA9', lineHeight: 22 }}>{error}</Text>}
    {!!notice && <Text accessibilityRole="alert" style={{ color: '#8FD9B4', lineHeight: 22 }}>{notice}</Text>}
    <ThemePreviewModal visible={preview !== null} title={preview === 'published' ? 'Published client app' : 'Unpublished design draft'} subtitle="Preview · activity stays here" brand={preview === 'published' ? model.savedBrand : model.brand} listings={all} onClose={() => setPreview(null)} />
  </View>;
}
