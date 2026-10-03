import React, { createContext, useContext, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Brand } from '@/contexts/BrandContext';
import { liveThemeDesign } from '@/constants/liveThemeDesigns';

type Sandbox = { messages: string[]; addMessage: (text: string) => void; requests: string[]; addRequest: (text: string) => void; name: string; setName: (name: string) => void; email: string; setEmail: (email: string) => void };
const Context = createContext<Sandbox | null>(null);
/** Memory only: no auth, storage, network, records or notification dispatch. */
export function PreviewSandboxProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<string[]>([]), [requests, setRequests] = useState<string[]>([]);
  const [name, setName] = useState('Preview client'), [email, setEmail] = useState('');
  return <Context.Provider value={{ messages, addMessage: text => setMessages(m => [...m, text]), requests, addRequest: text => setRequests(r => [...r, text]), name, setName, email, setEmail }}>{children}</Context.Provider>;
}
export function isSandboxPage(path: string) { return ['/messages', '/message', '/account', '/client-profile', '/book', '/calendar', '/notifications', '/documents'].includes(path); }
export default function PreviewSandbox({ route, brand, onNavigate }: { route: string; brand: Brand; onNavigate: (route: string) => void }) {
  const data = useContext(Context);
  const [input, setInput] = useState(''), [time, setTime] = useState(''), [notice, setNotice] = useState('');
  if (!data) throw new Error('Preview sandbox must be inside its provider.');
  const d = liveThemeDesign(brand.layoutId, brand.theme), chat = ['/message', '/messages'].includes(route), account = ['/account', '/client-profile'].includes(route), showing = ['/book', '/calendar'].includes(route);
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={{ padding: 16, minHeight: 48, borderRadius: 12, backgroundColor: d.accent, opacity: disabled ? .5 : 1 }}><Text style={{ color: readable(d.accent), fontWeight: '600' }}>{label}</Text></Pressable>;
  const field = (label: string, value: string, change: (v: string) => void, multiline = false) => <View style={{ gap: 8 }}><Text style={{ color: d.ink }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} multiline={multiline} autoCapitalize={label === 'Email' ? 'none' : 'sentences'} style={{ borderWidth: 1, borderColor: d.ink + '55', borderRadius: 10, minHeight: multiline ? 100 : 48, padding: 14, color: d.ink, backgroundColor: d.background, fontSize: 16 }} /></View>;
  return <View style={{ padding: 24, paddingBottom: 120, gap: 20, backgroundColor: d.background }}>
    <Text style={{ color: d.ink, fontSize: 11, letterSpacing: 1.5 }}>PREVIEW · ACTIVITY STAYS HERE</Text>
    <Text style={{ color: d.ink, fontSize: 32, fontFamily: brand.theme.website?.font ?? 'CormorantGaramond_500Medium' }}>{chat ? 'Chat with ' + brand.realtor.name : account ? 'Your profile' : showing ? 'Showing requests' : route === '/notifications' ? 'Notifications' : 'Shared documents'}</Text>
    {chat ? <>
      <Text style={{ color: d.ink, lineHeight: 24 }}>Try a conversation. Preview messages are never delivered to an inbox.</Text>
      {data.messages.map((m, i) => <View key={i} style={{ borderRadius: 14, padding: 16, borderWidth: 1, borderColor: d.ink + '22' }}><Text style={{ color: d.ink }}>{m}</Text><Text style={{ color: d.ink, fontSize: 11, marginTop: 6 }}>Preview only · not sent</Text></View>)}
      {field('Message', input, setInput, true)}
      {button('Send preview message', () => { if (input.trim()) data.addMessage(input.trim()); setInput(''); }, !input.trim())}
    </> : account ? <>
      {field('Name', data.name, data.setName)}{field('Email', data.email, data.setEmail)}
      {button('Save preview profile', () => setNotice('Profile saved in this preview only.'))}
      {(['Showings', 'Notifications', 'Documents', 'Saved homes'] as const).map((label, i) => button(label, () => onNavigate(['/calendar', '/notifications', '/documents', '/favorites'][i])))}
    </> : showing ? <>
      <Text style={{ color: d.ink, lineHeight: 24 }}>Choose a date and describe the home you would like to visit. Preview requests create no appointments.</Text>
      {data.requests.map((r, i) => <Text key={i} style={{ color: d.ink }}>Preview request · {r}</Text>)}
      {field('Preferred date and time', time, setTime)}{field('Property and notes', input, setInput, true)}
      {button('Submit preview showing request', () => { data.addRequest([time, input].filter(Boolean).join(' · ')); setTime(''); setInput(''); setNotice('Request saved in preview. No showing or notification was sent.'); }, !time.trim() || !input.trim())}
      {button('Browse listings', () => onNavigate('/listings'))}
    </> : route === '/notifications' ? <>
      {[...data.messages.map(() => 'Preview message · not delivered'), ...data.requests.map(() => 'Preview showing request · not delivered')].map((text, i) => <Text key={i} style={{ color: d.ink }}>{text}</Text>)}
      {!data.messages.length && !data.requests.length && <Text style={{ color: d.ink }}>Try Chat or a showing request to see preview activity here.</Text>}
    </> : <Text style={{ color: d.ink, lineHeight: 24 }}>Clients see their own documents shared by their realtor. Real client files stay private during preview.</Text>}
    {!!notice && <Text accessibilityRole="alert" style={{ color: d.ink, lineHeight: 24 }}>{notice}</Text>}
  </View>;
}
function readable(hex: string) { const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 155 ? '#111820' : '#ffffff'; }
