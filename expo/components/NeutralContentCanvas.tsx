import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import type { Brand } from "@/contexts/BrandContext";
import { CLIENT_SECTIONS, sectionState, type ClientSectionId } from "@/constants/sections";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { toPortableImage } from "@/lib/portableImage";
import { usePortraitPicker } from "@/hooks/usePortraitPicker";

type Change = (mutator: (brand: Brand) => Brand) => void;
const labels: Record<ClientSectionId, string> = { hero: "Your introduction", listings: "Properties", note: "Personal note", credentials: "Credentials", beat: "Market update", quickContact: "Contact", concierge: "Concierge", social: "Client stories & recent sales", support: "Consultations", footer: "Footer" };

/** Editor-only placeholders never enter the canonical content model. */
/** `fallback` is what the app shows when the field is empty (e.g. the tagline); it is never written back. */
function Copy({ label, value, onChange, large = false, fallback = "" }: { label: string; value: string; onChange: (value: string) => void; large?: boolean; fallback?: string }) {
  const [editing, setEditing] = useState(false);
  const shown = value.trim() ? value : fallback;
  return editing ? <TextInput autoFocus multiline accessibilityLabel={label} value={value} onChangeText={onChange}
    placeholder={fallback || undefined} placeholderTextColor="#999"
    onBlur={() => setEditing(false)} style={{ color: "#222", fontSize: large ? 28 : 16, lineHeight: large ? 35 : 25, padding: 10, borderWidth: 1, borderColor: "#777", borderRadius: 6, minHeight: 48 }} /> :
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label}`} onPress={() => setEditing(true)} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: shown.trim() ? "#222" : "#777", fontSize: large ? 28 : 16, lineHeight: large ? 35 : 25 }}>{shown.trim() ? shown : `Tap to add ${label.toLowerCase()}`}</Text>
    </Pressable>;
}

export default function NeutralContentCanvas({ draft, onChange, details, listings, onListingChange }: { draft: Brand; onChange: Change; details: Partial<Record<ClientSectionId | "additional", React.ReactNode>>; listings?: ManagedListing[]; onListingChange?: (id: string, patch: Partial<ManagedListing>) => void }) {
  const { all: savedListings } = useListings();
  const all = listings ?? savedListings;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const context = { brand: draft, visibleListingCount: all.filter(l => !l.hidden).length };
  const hidden = CLIENT_SECTIONS.filter(s => !s.structural && sectionState(draft, s.id, s.isReady(context)) === "hidden");
  const identity = (key: keyof Brand["realtor"], value: string) => onChange(b => ({ ...b, realtor: { ...b.realtor, [key]: value } }));
  const copy = (label: string, value: string, change: (text: string) => void, large = false, fallback = "") => <Copy label={label} value={value} onChange={change} large={large} fallback={fallback} />;
  const { pickPortable, cropper, busy: pickingPortrait } = usePortraitPicker({ maxWidth: 1600, cropOutputSize: 1200 });
  const portrait = async () => {
    if (uploading || pickingPortrait) return;
    setUploading(true);
    try {
      const uri = await pickPortable();
      if (uri) onChange(b => ({ ...b, portraitUrl: uri }));
    } catch { Alert.alert("Couldn’t load image", "Please try another image."); }
    finally { setUploading(false); }
  };
  const body = (id: ClientSectionId) => {
    switch (id) {
      case "hero": return <>
        {copy("Brand name", draft.realtor.brandName, v => identity("brandName", v))}
        <Pressable accessibilityRole="button" accessibilityLabel="Edit portrait" disabled={uploading} onPress={() => void portrait()}>
          {draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} contentFit="contain" style={{ height: 260, backgroundColor: "#eee", borderRadius: 8 }} /> : <View style={{ height: 180, backgroundColor: "#eee", justifyContent: "center", alignItems: "center" }}><Text>Tap to add your portrait</Text></View>}
          <Text style={{ color: "#666", paddingVertical: 10 }}>{uploading ? "Loading image…" : "Tap image to replace · crop after choosing"}</Text>
        </Pressable>
        {copy("Opening line", draft.realtor.heroMessage, v => identity("heroMessage", v), true, draft.realtor.tagline)}
        {copy("Full name", draft.realtor.name, v => identity("name", v))}
        {copy("Professional title", draft.realtor.title, v => identity("title", v))}
        {copy("City or region", draft.realtor.city, v => identity("city", v))}
      </>;
      case "listings": return <>
        {copy("Collection title", draft.curated.title, v => onChange(b => ({ ...b, curated: { ...b.curated, title: v } })), true)}
        {all.filter(l => !l.hidden).length ? all.filter(l => !l.hidden).map(l => <View key={l.id} style={{ paddingVertical: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit image for ${l.title}`} disabled={!onListingChange || uploading} onPress={async () => {
            setUploading(true);
            try {
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
              if (!result.canceled) {
                const uri = await toPortableImage(result.assets[0].uri, 1600);
                onListingChange?.(l.id, { image: uri, images: [uri, ...l.images.slice(1)] });
              }
            } catch { Alert.alert("Couldn’t load image", "Please try another image."); }
            finally { setUploading(false); }
          }}><Image source={{ uri: l.image }} contentFit="contain" style={{ height: 180, backgroundColor: "#eee" }} /></Pressable>
          {copy("Property title", l.title, v => onListingChange?.(l.id, { title: v }))}
          {copy("Property price", l.price, v => onListingChange?.(l.id, { price: v }))}
          {copy("Property description", l.elizaTake, v => onListingChange?.(l.id, { elizaTake: v }))}
        </View>) : <Text style={{ color: "#777", paddingVertical: 20 }}>Your property collection will appear here after you add listings from the dashboard. This placeholder is only in the editor.</Text>}
      </>;
      case "note": return <>
        {copy("Note title", draft.note.title, v => onChange(b => ({ ...b, note: { ...b.note, title: v } })), true)}
        {copy("Personal note", draft.note.body.join("\n\n"), v => onChange(b => ({ ...b, note: { ...b.note, body: v.split("\n\n") } })))}
        {copy("Sign-off", draft.note.signoff, v => onChange(b => ({ ...b, note: { ...b.note, signoff: v } })))}
      </>;
      case "beat": return <>
        {copy("Market headline", draft.beat.headline, v => onChange(b => ({ ...b, beat: { ...b.beat, headline: v } })), true)}
        {(draft.beat.bullets.length ? draft.beat.bullets : [{ label: "", copy: "" }]).map((item, i) => <View key={i}>
          {copy(`Market topic ${i + 1}`, item.label, v => onChange(b => { const bullets = [...b.beat.bullets]; bullets[i] = { ...item, label: v }; return { ...b, beat: { ...b.beat, bullets } }; }))}
          {copy(`Market update ${i + 1}`, item.copy, v => onChange(b => { const bullets = [...b.beat.bullets]; bullets[i] = { ...item, copy: v }; return { ...b, beat: { ...b.beat, bullets } }; }))}
        </View>)}
      </>;
      case "quickContact": return <>
        {copy("Contact heading", draft.quickContact.title, v => onChange(b => ({ ...b, quickContact: { ...b.quickContact, title: v } })), true)}
        {copy("Phone", draft.realtor.phone, v => identity("phone", v))}
        {copy("Email", draft.realtor.email, v => identity("email", v))}
      </>;
      case "concierge": return <>
        {copy("Concierge heading", draft.concierge.title, v => onChange(b => ({ ...b, concierge: { ...b.concierge, title: v } })), true)}
        <Text style={{ color: "#555", lineHeight: 25 }}>Saved homes · Messages · Showings · Documents · Updates</Text>
      </>;
      case "credentials": return <>
        {copy("Credentials heading", draft.credentials.title, v => onChange(b => ({ ...b, credentials: { ...b.credentials, title: v } })), true)}
        <Text style={{ color: "#555", lineHeight: 25 }}>{draft.credentials.designations.map(d => d.name).join("\n") || "Tap Edit details to add designations, education, awards and memberships."}</Text>
      </>;
      case "social": return <>
        {copy("Client stories heading", draft.social.title, v => onChange(b => ({ ...b, social: { ...b.social, title: v } })), true)}
        {draft.testimonials.map((t, i) => <View key={i}>{copy(`Client quote ${i + 1}`, t.quote, v => onChange(b => ({ ...b, testimonials: b.testimonials.map((entry, index) => index === i ? { ...entry, quote: v } : entry) })))}<Text style={{ color: "#555" }}>{t.author}</Text></View>)}
        {!draft.testimonials.length && <Text style={{ color: "#777" }}>Add your first client story in Edit details.</Text>}
        {draft.recentlyClosed.map((d, i) => <Text key={i} style={{ color: "#555", paddingVertical: 10 }}>{d.address} · {d.price}</Text>)}
      </>;
      case "support": return <Text style={{ color: "#555", lineHeight: 25 }}>Book a consultation · Call · Text · Email. These actions use your saved contact information.</Text>;
      case "footer": return <>
        {copy("Brokerage", draft.credentials.license.brokerage, v => onChange(b => ({ ...b, credentials: { ...b.credentials, license: { ...b.credentials.license, brokerage: v } } })))}
        {copy("License number", draft.credentials.license.number, v => onChange(b => ({ ...b, credentials: { ...b.credentials, license: { ...b.credentials.license, number: v } } })))}
        {copy("Copyright", draft.copyright, v => onChange(b => ({ ...b, copyright: v })))}
      </>;
    }
  };
  return <>
  {cropper}
  <View style={{ backgroundColor: "#f5f5f5", padding: 16, gap: 16 }}>
    <Text style={{ color: "#555", lineHeight: 23 }}>Tap text or images to edit. Empty placeholders are visible only here. Save returns to your dashboard.</Text>
    {CLIENT_SECTIONS.filter(s => !hidden.includes(s)).map(s => <View key={s.id} style={{ padding: 20, backgroundColor: "white", borderRadius: 10, gap: 12 }}>
      <Text style={{ color: "#666", fontSize: 12 }}>{labels[s.id]}{!s.structural ? ` · ${s.isReady(context) ? "Content present" : "Empty"}` : ""}</Text>
      {body(s.id)}
      {details[s.id] && <Pressable accessibilityRole="button" onPress={() => setExpanded(expanded === s.id ? null : s.id)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#344b68" }}>{expanded === s.id ? "Close details" : "Edit details"}</Text></Pressable>}
      {expanded === s.id && <View style={{ backgroundColor: "#101419", borderRadius: 8 }}>{details[s.id]}</View>}
      {!s.structural && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${labels[s.id]} from app`} onPress={() => onChange(b => ({ ...b, sectionStates: { ...b.sectionStates, [s.id]: "hidden" } }))} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#825050" }}>Remove from App</Text></Pressable>}
    </View>)}
    {hidden.length > 0 && <Pressable accessibilityRole="button" onPress={() => onChange(b => { const sectionStates = { ...b.sectionStates }; hidden.forEach(s => delete sectionStates[s.id]); return { ...b, sectionStates }; })} style={{ minHeight: 48, justifyContent: "center" }}><Text style={{ color: "#344b68" }}>Restore Hidden Sections ({hidden.length})</Text></Pressable>}
    <Pressable accessibilityRole="button" onPress={() => setExpanded(expanded === "additional" ? null : "additional")} style={{ minHeight: 48, justifyContent: "center" }}><Text style={{ color: "#344b68" }}>Edit neighborhood and market pages</Text></Pressable>
    {expanded === "additional" && <View style={{ backgroundColor: "#101419" }}>{details.additional}</View>}
  </View>
  </>;
}
