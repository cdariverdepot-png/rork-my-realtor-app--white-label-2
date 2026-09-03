import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth, DEMO_REALTOR_ID } from "@/contexts/AuthContext";
import { realtor as seedRealtor, personalNote as seedNote, marketBeat as seedBeat, testimonials as seedTestimonials, recentlyClosed as seedClosed } from "@/constants/realtor";
import { neighborhoods as seedNeighborhoods, marketPulse as seedPulse, type Neighborhood } from "@/constants/insights";
import { assets as seedAssets } from "@/constants/assets";
import {
  DEFAULT_THEME,
  SIGNATURE_THEME,
  resolveTheme,
  type ThemeConfig,
  type ThemeTokens,
} from "@/constants/theme";

export type RealtorProfile = {
  name: string;
  title: string;
  city: string;
  phone: string;
  email: string;
  tagline: string;
  heroMessage: string;
  welcomeNote: string;
  yearsActive: number;
  closedVolume: string;
  monogram: string;
  brandName: string;
  brandSub: string;
  heroEyebrow: string;
  primaryCta: string;
  secondaryCta: string;
};

export type PersonalNote = {
  date: string;
  title: string;
  body: string[];
  signoff: string;
  opener: string;
};

export type MarketBeat = {
  headline: string;
  bullets: { label: string; copy: string }[];
};

export type Testimonial = { quote: string; author: string; detail: string };
export type ClosedDeal = { address: string; price: string; days: string };

export type MarketPulse = {
  headline: string;
  date: string;
  paragraphs: string[];
  signoff: string;
};

/** A professional designation, stored by code so any theme can render it
 *  either as the short mark ("ABR") or the full trademarked name. */
export type Designation = {
  /** Catalogue id, or "custom" for a hand-typed entry. */
  code: string;
  /** Short mark shown in compact layouts. */
  mark: string;
  /** Full name shown in formal layouts. */
  name: string;
};

export type EducationEntry = {
  institution: string;
  credential: string;
  year: string;
};

export type AwardEntry = {
  title: string;
  issuer: string;
  year: string;
};

/**
 * Licensing and brokerage facts. Most states require the brokerage and licence
 * number on advertising, so these render in the footer of every screen rather
 * than in an optional marketing band.
 */
export type LicenseRecord = {
  number: string;
  state: string;
  brokerage: string;
  /** Shown as a plain fact — never as a "verified" badge. */
  since: string;
};

export type CredentialsRecord = {
  eyebrow: string;
  title: string;
  designations: Designation[];
  education: EducationEntry[];
  awards: AwardEntry[];
  memberships: string[];
  languages: string[];
  license: LicenseRecord;
};

export type Concierge = { eyebrow: string; title: string };
export type CuratedSection = { eyebrow: string; title: string };
export type SocialProofSection = { eyebrow: string; title: string; closedKicker: string };
export type QuickContactSection = { kicker: string; title: string; sub: string };

export type Brand = {
  realtor: RealtorProfile;
  portraitUrl: string;
  /** Square mark used as the client app's icon and launch badge. */
  iconUrl: string;
  signatureUrl: string;
  note: PersonalNote;
  beat: MarketBeat;
  testimonials: Testimonial[];
  recentlyClosed: ClosedDeal[];
  marketPulse: MarketPulse;
  neighborhoods: Neighborhood[];
  concierge: Concierge;
  curated: CuratedSection;
  social: SocialProofSection;
  quickContact: QuickContactSection;
  credentials: CredentialsRecord;
  theme: ThemeConfig;
  /** True once the realtor has explicitly picked any theme axis. Guards the
   *  legacy-palette migration from ever overriding a deliberate choice. */
  themeChosen?: boolean;
  copyright: string;
  updatedAt?: number;
};

/** Empty credentials record — the band hides itself until something is added. */
export const emptyCredentials = (): CredentialsRecord => ({
  eyebrow: "",
  title: "",
  designations: [],
  education: [],
  awards: [],
  memberships: [],
  languages: [],
  license: { number: "", state: "", brokerage: "", since: "" },
});

type SyncStatus = "idle" | "connecting" | "live" | "offline";

/** Realtor record fields the seed can read. */
type SeedRecord = {
  name?: string;
  email?: string;
  monogram?: string;
  brand_name?: string;
} | null | undefined;

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.charAt(0) ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (a + b).toUpperCase() || "MR";
}

/**
 * Full showcase brand — the frozen Eliza Vance demo.
 *
 * It deliberately takes NO realtor record. It used to accept one and merge the
 * signed-in realtor's name, email, monogram and brand name over Eliza's copy,
 * which produced the worst possible result: a real realtor's masthead sitting
 * on top of another agent's portrait, city, licence and client history — live,
 * in front of their clients. The showcase is a fixed exhibit, not a template.
 */
const buildDemoSeed = (): Brand => ({
  realtor: {
    name: seedRealtor.name,
    title: seedRealtor.title,
    city: seedRealtor.city,
    phone: seedRealtor.phone,
    email: seedRealtor.email,
    tagline: seedRealtor.tagline,
    heroMessage: seedRealtor.heroMessage,
    welcomeNote: seedRealtor.welcomeNote,
    yearsActive: seedRealtor.yearsActive,
    closedVolume: seedRealtor.closedVolume,
    monogram: "EV",
    brandName: "VANCE",
    brandSub: "PRIVATE · EST. 2011",
    heroEyebrow: "A PERSONAL INTRODUCTION",
    primaryCta: "Show me what's quiet",
    secondaryCta: "A private note",
  },
  portraitUrl: seedAssets.portrait,
  iconUrl: "",
  signatureUrl: seedAssets.signature,
  note: {
    date: seedNote.date,
    title: seedNote.title,
    body: [...seedNote.body],
    signoff: seedNote.signoff,
    opener: "Hello, friend —",
  },
  beat: {
    headline: seedBeat.headline,
    bullets: seedBeat.bullets.map((b) => ({ label: b.label, copy: b.copy })),
  },
  testimonials: seedTestimonials.map((t) => ({ ...t })),
  recentlyClosed: seedClosed.map((c) => ({ ...c })),
  marketPulse: {
    headline: seedPulse.headline,
    date: seedPulse.date,
    paragraphs: [...seedPulse.paragraphs],
    signoff: seedPulse.signoff,
  },
  neighborhoods: seedNeighborhoods.map((n) => ({
    ...n,
    vibe: [...n.vibe],
    picks: n.picks.map((p) => ({ ...p })),
  })),
  concierge: { eyebrow: "Your private concierge", title: "Everything I'm\nholding for you." },
  curated: { eyebrow: "Curated for you", title: "Homes I picked\nfor you." },
  social: { eyebrow: "In their words", title: "Why my clients stay.", closedKicker: "RECENTLY CLOSED" },
  quickContact: { kicker: "DIRECT LINE", title: "Reach me directly.", sub: "No assistants. No call centers. {first} writes back personally." },
  credentials: {
    eyebrow: "Background",
    title: "Credentials & training.",
    designations: [
      { code: "CLHMS", mark: "CLHMS", name: "Certified Luxury Home Marketing Specialist" },
      { code: "CRS", mark: "CRS", name: "Certified Residential Specialist" },
      { code: "ABR", mark: "ABR", name: "Accredited Buyer's Representative" },
    ],
    education: [
      { institution: "University of Washington", credential: "B.A. Architecture", year: "2007" },
    ],
    awards: [
      { title: "Top 1% Statewide", issuer: "Idaho REALTORS®", year: "2024" },
    ],
    memberships: ["National Association of REALTORS®", "Coeur d'Alene Association of REALTORS®"],
    languages: ["English", "French"],
    license: { number: "SP00-000000", state: "ID", brokerage: "Vance Private Brokerage", since: "2011" },
  },
  // The showcase keeps the forest/gold signature; new realtors do not inherit it.
  theme: { ...SIGNATURE_THEME },
  copyright: "Vance Private. By appointment only.",
  updatedAt: Date.now(),
});

/** Neutral white-label brand — the starting point for every real realtor.
 *  Identity comes from their record; the rest is generic placeholder copy they
 *  shape in Brand Studio. No demo (Eliza Vance) content leaks through. */
const buildNeutralSeed = (record?: SeedRecord): Brand => {
  // Only the realtor's OWN signup details are pre-filled — everything else
  // starts genuinely empty so Brand Studio shows greyed example text (see
  // constants/studioPlaceholders) instead of borrowed copy the realtor might
  // mistake for their own.
  const name = record?.name?.trim() || "";
  const brandName = record?.brand_name || (name.split(" ").pop()?.toUpperCase() ?? "");
  return {
    realtor: {
      name,
      title: "",
      city: "",
      phone: "",
      email: record?.email || "",
      tagline: "",
      heroMessage: "",
      welcomeNote: "",
      yearsActive: 0,
      closedVolume: "",
      monogram: record?.monogram || (name ? initialsFrom(name) : ""),
      brandName,
      brandSub: "",
      heroEyebrow: "",
      primaryCta: "",
      secondaryCta: "",
    },
    portraitUrl: "",
    iconUrl: "",
    signatureUrl: "",
    note: {
      date: "",
      title: "",
      body: [""],
      signoff: "",
      opener: "",
    },
    beat: {
      headline: "",
      bullets: [
        { label: "", copy: "" },
        { label: "", copy: "" },
        { label: "", copy: "" },
      ],
    },
    testimonials: [],
    recentlyClosed: [],
    marketPulse: {
      headline: "",
      date: "",
      paragraphs: [""],
      signoff: "",
    },
    neighborhoods: [],
    concierge: { eyebrow: "Your private concierge", title: "Everything I'm\nholding for you." },
    curated: { eyebrow: "Curated for you", title: "Homes I picked\nfor you." },
    social: { eyebrow: "In their words", title: "Why my clients stay.", closedKicker: "RECENTLY CLOSED" },
    quickContact: { kicker: "DIRECT LINE", title: "Reach me directly.", sub: "No assistants. No call centers. {first} writes back personally." },
    credentials: emptyCredentials(),
    theme: { ...DEFAULT_THEME },
    copyright: brandName ? `${brandName} Private. By appointment only.` : "",
    updatedAt: Date.now(),
  };
};

/**
 * Brands saved before the default look was de-branded carry the showcase palette
 * (forest/gold/Playfair) purely because it used to be `DEFAULT_THEME` — not because
 * the realtor picked it. Those get moved onto the neutral default on first load.
 *
 * `themeChosen` is the consent flag: once a realtor touches any theme control it is
 * set for good, and this migration leaves them alone forever after. The demo scope
 * is never migrated — the signature palette is genuinely its own.
 */
function migrateLegacyTheme(b: Brand, isDemo: boolean): Brand {
  if (isDemo || b.themeChosen) return b;
  const t = b.theme;
  // `gold` was the old default accent, so an unchosen brand carrying it inherited
  // the showcase palette rather than picking it. Match on the accent alone: brands
  // saved mid-drift (gold accent, some other font or paper) are just as borrowed as
  // an exact signature triple, and the exact-match test let them straight through.
  const isInheritedSignature =
    t?.accent === SIGNATURE_THEME.accent ||
    (t?.displayFont === SIGNATURE_THEME.displayFont &&
      t?.surface === SIGNATURE_THEME.surface);
  if (!isInheritedSignature) return b;
  return { ...b, theme: { ...DEFAULT_THEME } };
}

/** Pick the demo showcase or a neutral white-label brand. */
const buildSeed = (record?: SeedRecord, isDemo?: boolean): Brand =>
  isDemo ? buildDemoSeed() : buildNeutralSeed(record);

/** The showcase, evaluated once, used as the reference for leak detection. */
const DEMO_REFERENCE: Brand = buildDemoSeed();

/** Structural equality good enough for comparing stored copy against the seed. */
const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Return `fallback` when `value` is verbatim showcase copy, else keep it. */
const unborrow = <T,>(value: T, demo: T, fallback: T): T =>
  sameValue(value, demo) ? fallback : value;

/** Drop every entry that is verbatim showcase content, keep the rest. */
const unborrowList = <T,>(value: T[], demo: T[]): T[] => {
  if (!Array.isArray(value)) return value;
  const demoJson = new Set(demo.map((d) => JSON.stringify(d)));
  return value.filter((v) => !demoJson.has(JSON.stringify(v)));
};

/**
 * Strips showcase copy out of a real realtor's brand.
 *
 * The guided-walkthrough onboarding used to write the entire Eliza Vance
 * showcase into the realtor's own published brand. Realtors then corrected the
 * obvious parts (name, monogram, brand name) and shipped the rest without
 * noticing — so their clients opened the app to Eliza's portrait, her city, her
 * licence number and her closed deals.
 *
 * Fixing the seed alone cannot help them: the borrowed copy is already saved and
 * syncing. So every non-demo brand is scrubbed on the way in. Only values that
 * are byte-for-byte identical to the showcase are cleared, and each falls back
 * to the realtor's neutral seed — anything they wrote themselves is untouched.
 *
 * This runs field by field, never object by object. An earlier version compared
 * whole blocks (`note`, `beat`, `credentials`) against the showcase, so a single
 * edited word anywhere inside a block let every other borrowed line in it
 * survive — which is exactly how Eliza's "Inventory at the very top of the lake
 * market..." letter kept reaching real clients.
 *
 * It is also no longer gated behind a fingerprint check. Per-field comparison is
 * precise enough to be safe unconditionally, and any gate is one more way for
 * borrowed copy to slip past.
 */
function scrubDemoContent(b: Brand, isDemo: boolean, fallback: Brand): Brand {
  if (isDemo) return b;
  const r = b.realtor;
  const d = DEMO_REFERENCE.realtor;
  const f = fallback.realtor;
  return {
    ...b,
    realtor: {
      ...r,
      name: unborrow(r.name, d.name, f.name),
      title: unborrow(r.title, d.title, f.title),
      city: unborrow(r.city, d.city, f.city),
      phone: unborrow(r.phone, d.phone, f.phone),
      email: unborrow(r.email, d.email, f.email),
      tagline: unborrow(r.tagline, d.tagline, f.tagline),
      heroMessage: unborrow(r.heroMessage, d.heroMessage, f.heroMessage),
      welcomeNote: unborrow(r.welcomeNote, d.welcomeNote, f.welcomeNote),
      yearsActive: unborrow(r.yearsActive, d.yearsActive, f.yearsActive),
      closedVolume: unborrow(r.closedVolume, d.closedVolume, f.closedVolume),
      monogram: unborrow(r.monogram, d.monogram, f.monogram),
      brandName: unborrow(r.brandName, d.brandName, f.brandName),
      brandSub: unborrow(r.brandSub, d.brandSub, f.brandSub),
      heroEyebrow: unborrow(r.heroEyebrow, d.heroEyebrow, f.heroEyebrow),
      primaryCta: unborrow(r.primaryCta, d.primaryCta, f.primaryCta),
      secondaryCta: unborrow(r.secondaryCta, d.secondaryCta, f.secondaryCta),
    },
    portraitUrl: unborrow(b.portraitUrl, DEMO_REFERENCE.portraitUrl, fallback.portraitUrl),
    signatureUrl: unborrow(b.signatureUrl, DEMO_REFERENCE.signatureUrl, fallback.signatureUrl),
    note: {
      ...b.note,
      date: unborrow(b.note.date, DEMO_REFERENCE.note.date, fallback.note.date),
      title: unborrow(b.note.title, DEMO_REFERENCE.note.title, fallback.note.title),
      opener: unborrow(b.note.opener, DEMO_REFERENCE.note.opener, fallback.note.opener),
      signoff: unborrow(b.note.signoff, DEMO_REFERENCE.note.signoff, fallback.note.signoff),
      // Paragraph by paragraph: the realtor may have rewritten the first and
      // left Eliza's second and third sitting underneath it.
      body: unborrowList(b.note.body ?? [], DEMO_REFERENCE.note.body),
    },
    beat: {
      ...b.beat,
      headline: unborrow(b.beat.headline, DEMO_REFERENCE.beat.headline, fallback.beat.headline),
      bullets: unborrowList(b.beat.bullets ?? [], DEMO_REFERENCE.beat.bullets),
    },
    testimonials: unborrowList(b.testimonials ?? [], DEMO_REFERENCE.testimonials),
    recentlyClosed: unborrowList(b.recentlyClosed ?? [], DEMO_REFERENCE.recentlyClosed),
    marketPulse: {
      ...b.marketPulse,
      headline: unborrow(
        b.marketPulse.headline,
        DEMO_REFERENCE.marketPulse.headline,
        fallback.marketPulse.headline
      ),
      date: unborrow(b.marketPulse.date, DEMO_REFERENCE.marketPulse.date, fallback.marketPulse.date),
      signoff: unborrow(
        b.marketPulse.signoff,
        DEMO_REFERENCE.marketPulse.signoff,
        fallback.marketPulse.signoff
      ),
      paragraphs: unborrowList(b.marketPulse.paragraphs ?? [], DEMO_REFERENCE.marketPulse.paragraphs),
    },
    neighborhoods: unborrowList(b.neighborhoods ?? [], DEMO_REFERENCE.neighborhoods),
    credentials: {
      ...b.credentials,
      designations: unborrowList(
        b.credentials?.designations ?? [],
        DEMO_REFERENCE.credentials.designations
      ),
      education: unborrowList(b.credentials?.education ?? [], DEMO_REFERENCE.credentials.education),
      awards: unborrowList(b.credentials?.awards ?? [], DEMO_REFERENCE.credentials.awards),
      memberships: unborrowList(
        b.credentials?.memberships ?? [],
        DEMO_REFERENCE.credentials.memberships
      ),
      languages: unborrowList(b.credentials?.languages ?? [], DEMO_REFERENCE.credentials.languages),
      license: {
        ...b.credentials.license,
        number: unborrow(
          b.credentials?.license?.number,
          DEMO_REFERENCE.credentials.license.number,
          fallback.credentials.license.number
        ),
        state: unborrow(
          b.credentials?.license?.state,
          DEMO_REFERENCE.credentials.license.state,
          fallback.credentials.license.state
        ),
        brokerage: unborrow(
          b.credentials?.license?.brokerage,
          DEMO_REFERENCE.credentials.license.brokerage,
          fallback.credentials.license.brokerage
        ),
        since: unborrow(
          b.credentials?.license?.since,
          DEMO_REFERENCE.credentials.license.since,
          fallback.credentials.license.since
        ),
      },
    },
    copyright: unborrow(b.copyright, DEMO_REFERENCE.copyright, fallback.copyright),
  };
}

/**
 * Every ingress point runs this: local hydration and the durable sync both.
 * Returns the same object reference when nothing changed, so callers can use
 * identity to decide whether the correction needs writing back.
 */
function normalizeBrand(b: Brand, isDemo: boolean, fallback: Brand): Brand {
  return scrubDemoContent(migrateLegacyTheme(b, isDemo), isDemo, fallback);
}

/**
 * Starter copy for the guided walkthrough — generic scaffolding in the
 * realtor's own name, never another agent's persona.
 *
 * Only fields the realtor has left blank are filled, so re-running it cannot
 * clobber their work. Facts that would be a lie if published are deliberately
 * left empty: years active, volume closed, licence, designations, awards,
 * testimonials and closed deals. Placeholder prose is fine; invented
 * credentials and fabricated client quotes reaching a real client are not.
 */
const buildGuidedStarter = (current: Brand): Brand => {
  const r = current.realtor;
  const keep = (value: string, next: string): string => (value.trim() ? value : next);
  const keepList = <T,>(value: T[], next: T[]): T[] => (value.length > 0 ? value : next);
  const blankNote =
    !current.note.title.trim() && !current.note.body.join("").trim();
  const blankBeat =
    !current.beat.headline.trim() && !current.beat.bullets.some((x) => x.copy.trim());
  const blankPulse =
    !current.marketPulse.headline.trim() && !current.marketPulse.paragraphs.join("").trim();
  return {
    ...current,
    realtor: {
      ...r,
      title: keep(r.title, "Real Estate Advisor"),
      city: keep(r.city, "Your city · Your region"),
      tagline: keep(r.tagline, "A line about how you work — rewrite this in your own voice."),
      heroMessage: keep(r.heroMessage, "Fewer listings.\nMore attention on yours."),
      welcomeNote: keep(
        r.welcomeNote,
        "Welcome — I'm glad you're here. Have a look at what I'm watching this week, and send me a note if something stops you."
      ),
      brandSub: keep(r.brandSub, "BY APPOINTMENT ONLY"),
      heroEyebrow: keep(r.heroEyebrow, "AN INTRODUCTION"),
      primaryCta: keep(r.primaryCta, "View the collection"),
      secondaryCta: keep(r.secondaryCta, "Send a note"),
    },
    note: blankNote
      ? {
          date: "This week",
          title: "What I'm seeing this week",
          opener: "Hello —",
          body: [
            "Write the note you'd send a client you like. What moved this week, what you'd wait on, what you'd act on today.",
          ],
          signoff: "Always personally,",
        }
      : current.note,
    beat: blankBeat
      ? {
          headline: "The honest read on the market — from me, not a chart.",
          bullets: [
            { label: "Your first segment", copy: "What's happening there, in one or two plain sentences." },
            { label: "Your second segment", copy: "Where prices are landing and what you'd tell a client to do." },
            { label: "Your third segment", copy: "What you're watching next, and why it matters to them." },
          ],
        }
      : current.beat,
    marketPulse: blankPulse
      ? {
          headline: "This week's market pulse",
          date: "This week",
          paragraphs: [
            "Pricing, inventory and the moves worth making — written in your own voice, for your own clients.",
          ],
          signoff: "Always personally,",
        }
      : current.marketPulse,
    credentials: {
      ...current.credentials,
      eyebrow: keep(current.credentials.eyebrow, "Background"),
      title: keep(current.credentials.title, "Credentials & training."),
    },
    concierge: {
      eyebrow: keep(current.concierge.eyebrow, "Your private concierge"),
      title: keep(current.concierge.title, "Everything I'm\nholding for you."),
    },
    curated: {
      eyebrow: keep(current.curated.eyebrow, "Curated for you"),
      title: keep(current.curated.title, "Homes I picked\nfor you."),
    },
    testimonials: keepList(current.testimonials, []),
    recentlyClosed: keepList(current.recentlyClosed, []),
    copyright: keep(
      current.copyright,
      r.brandName ? `${r.brandName}. By appointment only.` : "By appointment only."
    ),
  };
};

export const [BrandProvider, useBrand] = createContextHook(() => {
  const { realtorId, realtorRecord, demoViewMode } = useAuth();
  const [brand, setBrand] = useState<Brand>(() => buildSeed());
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [revision, setRevision] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [retryTick, setRetryTick] = useState<number>(0);
  /**
   * An unpublished Studio draft the realtor is previewing. It overrides what the
   * client-facing screens render and nothing else: it is never persisted, never
   * broadcast, and never handed to the sync layer. Clearing it snaps every
   * screen back to the published brand.
   */
  const [draftPreview, setDraftPreview] = useState<Brand | null>(null);
  const revRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const brandRef = useRef<Brand>(brand);
  const retryAttemptRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scoped keys.
  // demoViewMode MUST pin to the "demo" scope. Previously this read the signed-in
  // realtor's id, so opening the showcase hydrated *their* saved brand on top of the
  // Eliza seed — which is why edits appeared to cross between the demo and the
  // realtor's own client view. The demo owns its own scope, always.
  const scope = demoViewMode ? "demo" : realtorId ? realtorId : "demo";
  const STORAGE_KEY = `${scope}:brand.v2`;
  const REVISION_KEY = `${scope}:brand.rev.v2`;
  const CHANNEL = `${scope}:brand:v2`;
  const KV_KEY = `${scope}:brand.v2`;

  // Real realtors get a neutral white-label brand seeded from their record;
  // only the demo realtor (and demo-view mode) gets the full Eliza Vance showcase.
  const isDemoScope = demoViewMode || !realtorId || realtorId === DEMO_REALTOR_ID;
  // When demoViewMode is forced, ignore the realtor's own record so the demo
  // stays purely Eliza Vance with no real-realtor details leaking in.
  const effectiveRecord = demoViewMode ? undefined : realtorRecord;
  const seed = useMemo(
    () => buildSeed(effectiveRecord, isDemoScope),
    [effectiveRecord, isDemoScope]
  );

  useEffect(() => {
    brandRef.current = brand;
  }, [brand]);

  // Hydrate from local storage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [raw, revRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(REVISION_KEY),
        ]);
        if (mounted && raw) {
          const parsed = JSON.parse(raw) as Partial<Brand>;
          const base = seed;
          const merged: Brand = {
            ...base,
            ...parsed,
            realtor: { ...base.realtor, ...(parsed.realtor ?? {}) },
            credentials: { ...base.credentials, ...(parsed.credentials ?? {}) },
          };
          const normalized = normalizeBrand(merged, isDemoScope, seed);
          setBrand(normalized);
          // A correction that only lives in memory loses: the durable sync pushes the
          // stored copy straight back over it. Write it down and bump the revision so
          // the cleaned brand is what propagates, not what gets replaced.
          if (normalized !== merged) {
            const rev = Math.max(revRef.current, Date.now());
            revRef.current = rev;
            setRevision(rev);
            void persistRef.current?.(normalized, rev);
          }
        } else if (mounted) {
          setBrand(seed);
        }
        if (mounted && revRaw) {
          const r = Number(revRaw);
          if (!Number.isNaN(r)) {
            revRef.current = r;
            setRevision(r);
          }
        }
      } catch (e) {
        console.log("[brand] hydrate error", e);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [STORAGE_KEY, REVISION_KEY, seed, isDemoScope]);

  // Lets the hydrate effect write without taking `persist` as a dependency
  // (which would re-run hydration on every scope change and loop).
  const persistRef = useRef<((next: Brand, rev: number) => Promise<void>) | null>(null);

  const persist = useCallback(async (next: Brand, rev: number) => {
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEY, JSON.stringify(next)],
        [REVISION_KEY, String(rev)],
      ]);
    } catch (e) {
      console.log("[brand] persist error", e);
    }
  }, [STORAGE_KEY, REVISION_KEY]);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  // Reset local state when realtorId changes
  useEffect(() => {
    setRevision(0);
    revRef.current = 0;
    setBrand(seed);
    setHydrated(false);
  }, [realtorId]);

  // Realtime sync via Supabase broadcast
  useEffect(() => {
    if (!supabase || !hydrated) return;
    setSyncStatus("connecting");
    const sb = supabase;
    const ch = sb.channel(CHANNEL, {
      config: { broadcast: { self: false, ack: false } },
    });

    const scheduleReconnect = () => {
      if (retryTimerRef.current) return;
      const attempt = retryAttemptRef.current + 1;
      retryAttemptRef.current = attempt;
      const delay = Math.min(30000, 2000 * Math.pow(2, attempt - 1));
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRetryTick((t) => t + 1);
      }, delay);
    };

    ch.on("broadcast", { event: "set" }, (payload) => {
      const data = payload.payload as { brand: Brand; rev: number };
      if (!data?.brand) return;
      if (data.rev <= revRef.current) return;
      revRef.current = data.rev;
      setRevision(data.rev);
      // Peers can be running an un-migrated copy — normalize on the way in.
      const incoming = migrateLegacyTheme(data.brand, isDemoScopeRef.current);
      setBrand(incoming);
      void persist(incoming, data.rev);
    });

    ch.on("broadcast", { event: "request" }, () => {
      if (revRef.current > 0) {
        ch.send({
          type: "broadcast",
          event: "set",
          payload: { brand: brandRef.current, rev: revRef.current },
        }).catch((e) => console.log("[brand] request-reply send error", e));
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        retryAttemptRef.current = 0;
        setSyncStatus("live");
        ch.send({ type: "broadcast", event: "request", payload: {} }).catch((e) =>
          console.log("[brand] initial request send error", e)
        );
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setSyncStatus("offline");
        scheduleReconnect();
      }
    });

    channelRef.current = ch;
    return () => {
      try {
        sb.removeChannel(ch);
      } catch (e) {
        console.log("[brand] removeChannel", e);
      }
      channelRef.current = null;
    };
  }, [hydrated, persist, retryTick, CHANNEL]);

  // Read inside sync callbacks that must not re-subscribe when the scope changes.
  const isDemoScopeRef = useRef<boolean>(isDemoScope);
  useEffect(() => {
    isDemoScopeRef.current = isDemoScope;
  }, [isDemoScope]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // Durable Postgres sync
  const applyRemote = useCallback(
    (row: { value: Brand; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
      if (!row?.value) return;
      const force = meta?.initial || meta?.forced;
      if (!force && row.rev <= revRef.current) return;
      revRef.current = Math.max(revRef.current, row.rev);
      setRevision(revRef.current);
      const base = seed;
      const merged: Brand = {
        ...base,
        ...row.value,
        realtor: { ...base.realtor, ...(row.value.realtor ?? {}) },
        credentials: { ...base.credentials, ...(row.value.credentials ?? {}) },
      };
      // THIS is what kept the showcase content alive. The initial durable fetch is
      // applied `forced`, so it lands regardless of revision — un-normalized — moments
      // after local hydration had already cleaned the brand. Every ingress point
      // has to normalize, not just the one that reads AsyncStorage.
      const migrated = normalizeBrand(merged, isDemoScope, seed);
      setBrand(migrated);
      const rev = migrated === merged ? row.rev : Math.max(row.rev, Date.now());
      revRef.current = Math.max(revRef.current, rev);
      setRevision(revRef.current);
      void persist(migrated, rev);
    },
    [persist, seed, isDemoScope]
  );

  const { refresh: refreshKv } = useKvSync<Brand>({
    key: KV_KEY,
    enabled: hydrated && isKvEnabled(),
    value: brand,
    rev: revision,
    onRemote: applyRemote,
  });

  const refresh = useCallback(async (): Promise<void> => {
    await refreshKv();
  }, [refreshKv]);

  const broadcast = useCallback((next: Brand, rev: number) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "set", payload: { brand: next, rev } }).catch((e) =>
      console.log("[brand] broadcast error", e)
    );
  }, []);

  const update = useCallback(
    (mutator: (current: Brand) => Brand) => {
      // The Eliza Vance demo is a frozen, read-only showcase — never accept writes.
      if (demoViewMode) return;
      const next = { ...mutator(brandRef.current), updatedAt: Date.now() };
      const rev = Math.max(revRef.current, Date.now());
      revRef.current = rev;
      setRevision(rev);
      setBrand(next);
      void persist(next, rev);
      broadcast(next, rev);
    },
    [persist, broadcast, demoViewMode]
  );

  const reset = useCallback(() => {
    update(() => seed);
  }, [update, seed]);

  /**
   * Fills the empty template with generic starter copy for the "guided
   * walkthrough" onboarding path, keeping the realtor's own identity.
   *
   * This used to write the entire Eliza Vance showcase into the realtor's live
   * brand — portrait, city, licence, testimonials and all — which is how another
   * agent's details ended up in front of real clients. It now scaffolds only
   * neutral, obviously-editable prose, and never invents facts.
   */
  const seedPlaceholders = useCallback(() => {
    update((current) => buildGuidedStarter(current));
  }, [update]);

  /** What the UI renders: the unpublished draft while previewing, else the published brand. */
  const visibleBrand: Brand = draftPreview ?? brand;
  const themeTokens: ThemeTokens = useMemo(() => resolveTheme(visibleBrand.theme), [visibleBrand.theme]);

  // Frozen demo data source — its own dedicated, immutable Eliza Vance brand that
  // never reads from realtor storage and is never mutated. This is what guarantees
  // the demo can never show another realtor's details (no "Jerrod" leak).
  const demoBrand = useMemo(() => DEMO_REFERENCE, []);
  const demoTheme = useMemo(() => resolveTheme(demoBrand.theme), [demoBrand]);

  const value = useMemo(
    () => ({
      brand: demoViewMode ? demoBrand : visibleBrand,
      theme: demoViewMode ? demoTheme : themeTokens,
      hydrated: demoViewMode ? true : hydrated,
      revision,
      syncStatus: demoViewMode ? ("idle" as SyncStatus) : syncStatus,
      previewingDraft: !demoViewMode && draftPreview !== null,
      setDraftPreview,
      update,
      reset,
      seedPlaceholders,
      refresh,
    }),
    [demoViewMode, demoBrand, demoTheme, visibleBrand, draftPreview, themeTokens, hydrated, revision, syncStatus, update, reset, seedPlaceholders, refresh]
  );

  return value;
});
