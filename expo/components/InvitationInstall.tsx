import React from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

/** Browser handoff retains the exact invitation; no manual realtor search or code entry. */
export default function InvitationInstall({ code, realtorName }: { code: string; realtorName: string }) {
  if (Platform.OS !== 'web' || !/^[a-z0-9]{6}$/i.test(code)) return null;
  const ios = storeUrl(process.env.EXPO_PUBLIC_IOS_STORE_URL, 'apps.apple.com');
  const android = storeUrl(process.env.EXPO_PUBLIC_ANDROID_STORE_URL, 'play.google.com');
  const open = () => { void Linking.openURL(`myrealtorapp://code/${encodeURIComponent(code)}`).catch(() => {}); };
  return <View style={{ padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#D4B98966', gap: 12, marginBottom: 20 }}>
    <Text style={{ color: '#F5EFE5', fontSize: 17 }}>You’re invited by {realtorName}</Text>
    <Pressable accessibilityRole="button" onPress={open} style={{ padding: 14, borderRadius: 10, backgroundColor: '#D4B989' }}><Text style={{ color: '#111820', fontWeight: '600' }}>Open invitation in My Realtor App</Text></Pressable>
    {(ios || android) && <>
      <Text style={{ color: '#D5CEC3', lineHeight: 22 }}>Install the shared app below, then return to this invitation and tap Open. It will connect you to {realtorName} automatically.</Text>
      {ios && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(ios)} style={{ padding: 14 }}><Text style={{ color: '#F5EFE5' }}>Get My Realtor App for iPhone →</Text></Pressable>}
      {android && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(android)} style={{ padding: 14 }}><Text style={{ color: '#F5EFE5' }}>Get My Realtor App for Android →</Text></Pressable>}
    </>}
    <Text style={{ color: '#D5CEC3', lineHeight: 22 }}>You can also continue in this browser.</Text>
  </View>;
}
function storeUrl(raw: string | undefined, host: string) {
  try { const url = new URL(raw ?? ''); return url.protocol === 'https:' && url.hostname === host ? url.toString() : null; } catch { return null; }
}
