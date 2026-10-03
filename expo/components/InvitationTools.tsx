import React, { useState } from 'react';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { clientInviteLink } from '@/lib/bookingLink';

/** The same stable invitation is used on the first-publication screen and dashboard. */
export default function InvitationTools() {
  const { realtorRecord } = useAuth(), { isPublished, savedBrand } = useBrand();
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const code = realtorRecord?.client_code;
  if (!isPublished || !realtorRecord?.client_code_enabled || !code) return null;
  const url = clientInviteLink(code), qr = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=900&margin=3&dark=101820&light=ffffff&ecLevel=M`;
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setNotice('');
    try { await action(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Please retry.'); } finally { setBusy(false); }
  };
  const saveQr = async () => {
    if (Platform.OS === 'web') {
      const response = await fetch(qr);
      if (!response.ok) throw new Error('Could not download your QR image. Please retry.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = objectUrl; link.download = `my-realtor-invitation-${code}.png`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      setNotice('Your invitation QR image is ready to save.');
    } else if (Platform.OS === 'ios') {
      const file = await File.downloadFileAsync(qr, new File(Paths.cache, `invitation-${code}.png`), { idempotent: true });
      await Share.share({ url: file.uri });
    } else {
      await Linking.openURL(qr);
      setNotice('Save the QR image from your browser’s image menu.');
    }
  };
  const button = (label: string, action: () => Promise<void>) => <Pressable key={label} accessibilityRole="button" onPress={() => void run(action)} disabled={busy} style={{ paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#D4B989', opacity: busy ? .5 : 1 }}><Text style={{ color: '#101820', fontWeight: '600' }}>{label}</Text></Pressable>;
  return <View style={{ gap: 18, alignItems: 'center', paddingVertical: 20 }}>
    <Image source={{ uri: qr }} style={{ width: 220, height: 220, borderRadius: 12 }} contentFit="contain" accessibilityLabel={`Invitation QR code for ${savedBrand.realtor.name}`} />
    <Text selectable style={{ color: '#F5EFE5', textAlign: 'center', fontSize: 14 }}>{url}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
      {button('Copy link', async () => { await Clipboard.setStringAsync(url); setNotice('Invitation link copied.'); })}
      {button('Save QR image', saveQr)}
      {button('Share invitation', async () => { await Share.share({ message: `${savedBrand.realtor.name} invites you to My Realtor App. ${url}`, url }); })}
    </View>
    {!!notice && <Text accessibilityRole="alert" style={{ color: '#E4D6BF', lineHeight: 22, textAlign: 'center' }}>{notice}</Text>}
  </View>;
}
