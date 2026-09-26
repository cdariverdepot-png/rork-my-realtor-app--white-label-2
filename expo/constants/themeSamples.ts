import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import type { ClientLayoutId } from "@/constants/clientLayouts";
import { themeCandidate } from "@/constants/themeDesigns";
import { requiredStatus } from "@/constants/sections";
import { listings as exampleHomes } from "@/constants/realtor";

/** Read-only showroom fixtures. Never pass these to profile/listing persistence. */
type Sample = { name: string; monogram: string; brand: string; sub: string; headline: string; intro: string; eyebrow: string; collection: string; city: string;
  homes: [string, string, string, number, number, string][] };
const samples: Record<ClientLayoutId, Sample> = {
  "eliza-editorial": { name: "Eliza Vance", monogram: "EV", brand: "VANCE", sub: "PRIVATE · EST. 2011", headline: "I don't have a thousand listings.\nI have the right one for you.", intro: "A personal approach to finding your place in North Idaho.", eyebrow: "A PERSONAL INTRODUCTION", collection: "Homes I picked for you.", city: "Coeur d'Alene · North Idaho", homes: [["Lakeshore Drive Estate", "Coeur d'Alene · Lakeshore", "$11.9M", 5, 5.5, "6,420 sqft"], ["Black Rock Fairway Villa", "Black Rock · South Shore", "$5.85M", 5, 5.5, "5,180 sqft"]] },
  "coastal-personal": { name: "Marissa Cole", monogram: "MC", brand: "MARISSA COLE", sub: "REAL ESTATE", headline: "Your next chapter starts somewhere beautiful.", intro: "Hi, I’m Marissa. I help discerning clients find homes that elevate the way they live.", eyebrow: "PERSONAL. TRUSTED. EXCEPTIONAL.", collection: "Curated Collection", city: "Coastal California", homes: [["Malibu Retreat", "Malibu, California", "$24,500,000", 5, 6, "6,200 sqft"], ["Newport Coast Residence", "Newport Coast, California", "$18,900,000", 5, 6, "4,950 sqft"]] },
  "advisor-journal": { name: "Vance", monogram: "EV", brand: "VANCE", sub: "PRIVATE · EST. 2011", headline: "Real estate is personal.\nSo is my approach.", intro: "I work with a select few clients at a time—providing honest guidance, off-market access, and a level of service that puts your goals first.", eyebrow: "A PERSONAL INTRODUCTION", collection: "Homes I think you’ll love.", city: "North Idaho", homes: [["Lakeshore Drive Estate", "Coeur d'Alene · Lakeshore", "$11.9M", 5, 5.5, "6,420 sqft"], ["Modern Villa", "Hayden Lake · West Bay", "$8.4M", 6, 6.5, "7,120 sqft"]] },
  "warm-concierge": { name: "Sloane Keller", monogram: "SK", brand: "SLOANE KELLER", sub: "REAL ESTATE", headline: "This isn’t a portal.\nIt’s the door to the homes I’d actually call you about.", intro: "Personal guidance, thoughtfully selected homes, and a direct line to Sloane.", eyebrow: "PERSONAL GUIDANCE", collection: "Curated for You", city: "Coastal California", homes: [["210 Oceanfront Drive", "Laguna Beach, CA", "$24,800,000", 5, 6.5, "6,200 sqft"], ["1817 Vista Del Mar", "Newport Coast, CA", "$18,950,000", 5, 6, "4,950 sqft"], ["422 Canyon Crest", "Austin, TX", "$2,650,000", 4, 3.5, "3,100 sqft"]] },
  // The second Eliza mockup uses a neutral sample identity so Eliza appears only once.
  "private-collection": { name: "Private Advisor", monogram: "PA", brand: "PRIVATE ADVISOR", sub: "PRIVATE REAL ESTATE ADVISOR", headline: "Luxury guidance,\nbeautifully personal.", intro: "A custom real estate experience built around you. Exclusive listings, expert insight, and white glove service—right in your pocket.", eyebrow: "PERSONAL GUIDANCE", collection: "Exclusive Listings", city: "Austin · Beverly Hills · Scottsdale", homes: [["Austin Residence", "Austin, Texas", "$4,250,000", 4, 4.5, "4,120 sqft"], ["Beverly Hills Estate", "Beverly Hills, California", "$3,875,000", 5, 5.5, "5,300 sqft"], ["Scottsdale Retreat", "Scottsdale, Arizona", "$2,950,000", 4, 4, "3,800 sqft"]] },
  "modern-editorial": { name: "Nora Ellis", monogram: "NE", brand: "NORA ELLIS", sub: "PRIVATE REAL ESTATE ADVISOR", headline: "Find\nwhat feels\nlike you.", intro: "Personalized guidance.\nExclusive listings.\nSeamless experience.\nFrom start to key.", eyebrow: "FIND MORE THAN A HOME.", collection: "Curated for You", city: "Coastal California", homes: [["Coastal Modern Retreat", "Laguna Beach, CA", "$5,950,000", 4, 4.5, "4,120 sqft"], ["1817 Sunrise Way", "Santa Barbara, CA", "$4,750,000", 4, 4, "3,900 sqft"], ["124 Canyon Creek", "Austin, TX", "$2,395,000", 4, 3, "3,100 sqft"], ["4228 Ocean Drive", "Laguna Beach, CA", "$6,250,000", 5, 5, "4,800 sqft"]] },
  "portrait-statement": { name: "Mina Ashford", monogram: "MA", brand: "MINA ASHFORD", sub: "PRIVATE REAL ESTATE ADVISOR", headline: "A quieter\nkind of luxury.", intro: "Curated homes. Discreet access.\nGuidance that’s always personal.", eyebrow: "PERSONAL GUIDANCE", collection: "Featured Properties", city: "Coeur d'Alene · Ketchum, Idaho", homes: [["The Ridgeview Estate", "Coeur d'Alene, ID", "$6,750,000", 5, 5, "5,200 sqft"], ["The Olive House", "Ketchum, ID", "$4,250,000", 4, 4, "3,800 sqft"]] },
};

export function themeSample(id: ClientLayoutId): { brand: Brand; listings: ManagedListing[] } {
  const v = id === "modern-editorial" ? { ...samples[id], name: "Noah Ellis", brand: "NOAH ELLIS" } : samples[id];
  const brand: Brand = {
    realtor: { name: v.name, title: id === "coastal-personal" ? "Founder & Advisor" : "Private Real Estate Advisor", city: v.city, phone: "", email: "", tagline: v.headline, heroMessage: v.headline, welcomeNote: v.intro, yearsActive: 0, closedVolume: "", monogram: v.monogram, brandName: v.brand, brandSub: v.sub, heroEyebrow: v.eyebrow, primaryCta: "Find your home", secondaryCta: "Message me" },
    // Bundled user-supplied sample portraits are attached by the preview layer.
    portraitUrl: "",
    iconUrl: "", signatureUrl: "", theme: { accent: "gold", displayFont: "playfair", surface: "ivory" },
    note: { date: "", title: "A personal note", body: [v.intro], signoff: v.name, opener: "" },
    beat: { headline: "Inventory is still tight.", bullets: [{ label: "Current market insight", copy: "The best homes are moving quickly." }] },
    testimonials: [], recentlyClosed: [], marketPulse: { headline: "", date: "", paragraphs: [], signoff: "" }, neighborhoods: [],
    concierge: { eyebrow: "YOUR PRIVATE ACCESS", title: id === "portrait-statement" ? "From private showings to lifestyle requests, we handle the details." : "Client Concierge" },
    curated: { eyebrow: id === "private-collection" ? "HANDPICKED FOR YOU" : `CURATED BY ${v.name.split(" ")[0].toUpperCase()}`, title: v.collection },
    social: { eyebrow: "", title: "", closedKicker: "" }, quickContact: { kicker: "DIRECT LINE", title: "Reach me directly.", sub: `Connect with ${v.name.split(" ")[0]}.` },
    credentials: { eyebrow: "", title: "", designations: [], education: [], awards: [], memberships: [], languages: [], license: { number: "", state: "", brokerage: "", since: "" } },
    copyright: "Illustrative sample only. Not a real property offering.",
  };
  return { brand: themeCandidate(brand, id), listings: v.homes.map(([title, neighborhood, price, beds, baths, sqft], i) => ({
    id: `sample-${id}-${i}`, title, neighborhood, price, beds, baths, sqft,
    image: exampleHomes[i % exampleHomes.length].image, images: [exampleHomes[i % exampleHomes.length].image],
    tag: i === 0 ? "Off-market" : "New", elizaTake: "Illustrative sample property. Photograph is a placeholder.", hidden: false,
  })) };
}

/** Whole-context switch: never fill gaps in a real profile with sample claims. */
export function themePreview(draft: Brand, listings: ManagedListing[], id: ClientLayoutId, demo: boolean, mode: "auto" | "sample" | "profile" = "auto") {
  const sample = mode === "sample" || (mode === "auto" && (demo || !requiredStatus(draft).complete));
  return { ...(sample ? themeSample(id) : { brand: themeCandidate(draft, id), listings }), sample };
}
