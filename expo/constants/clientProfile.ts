/**
 * The client profile — what a realtor actually needs to know about the person
 * they are working for, expressed as data rather than as screens.
 *
 * WHY THIS IS A SCHEMA AND NOT A FORM
 * -----------------------------------
 * The brief is that this grows into a personalised buying workspace with
 * realtor-authored tasks. If the questions lived inside a screen, every new
 * question would mean editing that screen, and realtor-specific questions would
 * be impossible without a fork. So the questions live here as data: a list of
 * steps, each holding a list of fields. The flow screen renders whatever it is
 * handed and knows nothing about mortgages or bedrooms.
 *
 * Adding a question later is one entry in this file. Letting a realtor add
 * their own is the same shape loaded from storage instead of from source — the
 * renderer does not need to change for that to work.
 *
 * WHAT IS ASKED, AND WHY
 * ----------------------
 * Only the things an agent genuinely cannot work without are required: how to
 * address you, how to reach you, what you are trying to do, and by when. That
 * is the standard intake floor — everything past it (budget, financing,
 * must-haves) is valuable but can be filled in later, and demanding it up front
 * from someone who just wanted to look at houses is how intake forms get
 * abandoned halfway.
 */

import type { CatalogueOption } from "@/constants/catalogues";

/** Every answer is a string or a list of strings — keeps storage and sync trivial. */
export type ProfileAnswers = Record<string, string | string[]>;

export type FieldKind = "text" | "phone" | "longtext" | "single" | "multi" | "photo";

export type ProfileField = {
  id: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  options?: CatalogueOption[];
  /**
   * Pulls its options from live app data instead of this file. Currently only
   * "neighborhoods", which offers the realtor's own listing areas so a buyer
   * picks from the places their agent actually works.
   */
  optionsKey?: "neighborhoods";
  /** Lets the client type a value the list doesn't cover. */
  allowCustom?: boolean;
  required?: boolean;
  /** Shown only when this passes — how the buyer and seller paths diverge. */
  showIf?: (a: ProfileAnswers) => boolean;
};

export type ProfileStep = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  fields: ProfileField[];
  /** Optional steps can be passed over with "Skip for now". */
  optional?: boolean;
  showIf?: (a: ProfileAnswers) => boolean;
};

/* ----------------------------- accessors ----------------------------- */

export function str(a: ProfileAnswers, id: string): string {
  const v = a[id];
  return typeof v === "string" ? v : "";
}

export function arr(a: ProfileAnswers, id: string): string[] {
  const v = a[id];
  return Array.isArray(v) ? v : [];
}

function goalIs(a: ProfileAnswers, ...want: string[]): boolean {
  return want.includes(str(a, "goal"));
}

/* ---------------------------- vocabularies ---------------------------- */

export const GOALS: CatalogueOption[] = [
  { value: "buy", label: "Buy a home", sub: "Looking for a place of my own" },
  { value: "sell", label: "Sell a property", sub: "I have something to list" },
  { value: "both", label: "Sell one, buy another", sub: "A move, both ends" },
  { value: "rent", label: "Rent", sub: "Looking for a lease" },
  { value: "browse", label: "Just watching the market", sub: "No plans yet" },
];

export const TIMELINES: CatalogueOption[] = [
  { value: "asap", label: "As soon as possible", sub: "Ready now" },
  { value: "1-3", label: "Within 3 months" },
  { value: "3-6", label: "3 to 6 months" },
  { value: "6-12", label: "6 to 12 months" },
  { value: "12+", label: "More than a year out" },
  { value: "unsure", label: "Not sure yet", sub: "Still thinking it through" },
];

export const CONTACT_METHODS: CatalogueOption[] = [
  { value: "text", label: "Text message" },
  { value: "call", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "app", label: "In-app messages", sub: "Right here" },
];

export const CONTACT_TIMES: CatalogueOption[] = [
  { value: "anytime", label: "Anytime" },
  { value: "morning", label: "Mornings", sub: "Before noon" },
  { value: "afternoon", label: "Afternoons", sub: "Noon to 5" },
  { value: "evening", label: "Evenings", sub: "After 5" },
  { value: "weekend", label: "Weekends only" },
];

export const HOUSEHOLD: CatalogueOption[] = [
  { value: "solo", label: "Just me" },
  { value: "couple", label: "Me and my partner" },
  { value: "family", label: "Family with children" },
  { value: "multigen", label: "Multi-generational", sub: "Parents or in-laws too" },
  { value: "share", label: "Sharing with others" },
];

export const CURRENT_SITUATION: CatalogueOption[] = [
  { value: "renting", label: "Renting", sub: "Lease may need timing" },
  { value: "own-keep", label: "I own, and I'm keeping it" },
  { value: "own-sell", label: "I own, and I need to sell first", sub: "Sale has to line up" },
  { value: "family", label: "Living with family" },
  { value: "relocating", label: "Relocating from out of area" },
];

export const PROPERTY_TYPES: CatalogueOption[] = [
  { value: "single-family", label: "Single-family home" },
  { value: "condo", label: "Condominium" },
  { value: "townhome", label: "Townhome" },
  { value: "duplex", label: "Duplex or multi-family" },
  { value: "new-construction", label: "New construction" },
  { value: "waterfront", label: "Waterfront" },
  { value: "acreage", label: "Land or acreage" },
  { value: "cabin", label: "Cabin or second home" },
  { value: "manufactured", label: "Manufactured home" },
];

export const BUDGET_BANDS: CatalogueOption[] = [
  { value: "under-250", label: "Under $250,000" },
  { value: "250-400", label: "$250,000 – $400,000" },
  { value: "400-600", label: "$400,000 – $600,000" },
  { value: "600-850", label: "$600,000 – $850,000" },
  { value: "850-1.2m", label: "$850,000 – $1.2M" },
  { value: "1.2m-2m", label: "$1.2M – $2M" },
  { value: "2m-3.5m", label: "$2M – $3.5M" },
  { value: "3.5m-5m", label: "$3.5M – $5M" },
  { value: "5m+", label: "Above $5M" },
  { value: "unsure", label: "Not sure yet", sub: "Happy to be guided" },
];

export const BED_COUNTS: CatalogueOption[] = [
  { value: "any", label: "Any" },
  { value: "1", label: "1 or more" },
  { value: "2", label: "2 or more" },
  { value: "3", label: "3 or more" },
  { value: "4", label: "4 or more" },
  { value: "5", label: "5 or more" },
];

export const BATH_COUNTS: CatalogueOption[] = [
  { value: "any", label: "Any" },
  { value: "1", label: "1 or more" },
  { value: "2", label: "2 or more" },
  { value: "3", label: "3 or more" },
  { value: "4", label: "4 or more" },
];

/**
 * Features people actually name when asked what matters. Deliberately concrete
 * — "good light" and "quiet street" are what buyers say, and a list of MLS
 * field names would not be answerable by a normal person.
 */
export const MUST_HAVES: CatalogueOption[] = [
  { value: "garage", label: "Garage" },
  { value: "yard", label: "Yard or outdoor space" },
  { value: "office", label: "Home office" },
  { value: "primary-main", label: "Primary bedroom on main floor" },
  { value: "open-plan", label: "Open-plan living" },
  { value: "updated-kitchen", label: "Updated kitchen" },
  { value: "natural-light", label: "Lots of natural light" },
  { value: "storage", label: "Real storage" },
  { value: "guest-space", label: "Guest or in-law space" },
  { value: "quiet", label: "Quiet street" },
  { value: "walkable", label: "Walkable neighborhood" },
  { value: "top-schools", label: "Strong school district" },
  { value: "single-level", label: "Single level, no stairs" },
  { value: "view", label: "A view" },
  { value: "water-access", label: "Water access" },
  { value: "workshop", label: "Shop, barn or workshop" },
  { value: "pool", label: "Pool" },
  { value: "move-in-ready", label: "Move-in ready", sub: "No projects" },
  { value: "fixer-ok", label: "Happy with a project" },
  { value: "pet-friendly", label: "Room for pets" },
];

export const PURCHASE_METHODS: CatalogueOption[] = [
  { value: "mortgage", label: "Financing with a mortgage" },
  { value: "cash", label: "Paying cash" },
  { value: "va", label: "VA loan" },
  { value: "fha", label: "FHA loan" },
  { value: "sale-proceeds", label: "Using proceeds from a sale" },
  { value: "unsure", label: "Haven't worked it out yet" },
];

/**
 * Pre-approval status is the single most useful answer on this whole form — it
 * decides whether an agent books showings this week or refers you to a lender
 * first. Asked plainly, with "not started" framed as normal rather than a
 * failing, so people answer honestly instead of over-claiming.
 */
export const APPROVAL_STATUS: CatalogueOption[] = [
  { value: "approved", label: "Pre-approved", sub: "Letter in hand" },
  { value: "prequalified", label: "Pre-qualified", sub: "Verbal or soft check" },
  { value: "in-progress", label: "In progress", sub: "Talking to a lender now" },
  { value: "not-started", label: "Not started", sub: "Would like a recommendation" },
  { value: "cash", label: "Not needed", sub: "Paying cash" },
];

export const OCCUPANCY: CatalogueOption[] = [
  { value: "owner", label: "I live there" },
  { value: "tenant", label: "Tenants live there" },
  { value: "vacant", label: "It's vacant" },
  { value: "second", label: "Second home", sub: "Used part of the year" },
];

export const FIRST_TIME: CatalogueOption[] = [
  { value: "yes", label: "Yes, my first purchase" },
  { value: "no", label: "No, I've bought before" },
];

/* ------------------------------- steps ------------------------------- */

/**
 * The intake flow, in order. Steps whose `showIf` fails are skipped entirely,
 * so a seller never scrolls past mortgage questions and a buyer is never asked
 * for a property address.
 */
export const PROFILE_STEPS: ProfileStep[] = [
  {
    id: "you",
    eyebrow: "STEP ONE",
    title: "How should we reach you?",
    blurb:
      "The basics your agent needs to actually get hold of you. Nothing here is shared beyond them.",
    fields: [
      {
        id: "fullName",
        label: "FULL NAME",
        kind: "text",
        placeholder: "As it would appear on paperwork",
        required: true,
      },
      {
        id: "preferredName",
        label: "WHAT SHOULD THEY CALL YOU?",
        kind: "text",
        placeholder: "First name, nickname, anything",
        hint: "This is the name you'll be greeted by.",
        required: true,
      },
      {
        id: "phone",
        label: "PHONE",
        kind: "phone",
        placeholder: "(208) 555-0134",
        required: true,
        showIf: a => ["text", "call"].includes(str(a, "contactMethod")),
        hint: "Required when you choose calls or texts.",
      },
      {
        id: "contactMethod",
        label: "BEST WAY TO REACH YOU",
        kind: "single",
        options: CONTACT_METHODS,
        placeholder: "Choose one",
        required: true,
      },
      {
        id: "contactTime",
        label: "BEST TIME",
        kind: "single",
        options: CONTACT_TIMES,
        placeholder: "Choose one",
      },
    ],
  },

  {
    id: "move",
    eyebrow: "STEP TWO",
    title: "What are you here to do?",
    blurb:
      "This sets the shape of everything else — the rest of the questions follow your answer.",
    fields: [
      {
        id: "goal",
        label: "I'M LOOKING TO",
        kind: "single",
        options: GOALS,
        placeholder: "Choose one",
        required: true,
      },
      {
        id: "timeline",
        label: "TIMELINE",
        kind: "single",
        options: TIMELINES,
        placeholder: "Choose one",
        hint: "An honest guess is more useful than an optimistic one.",
        required: true,
      },
      {
        id: "household",
        label: "WHO'S MOVING WITH YOU?",
        kind: "single",
        options: HOUSEHOLD,
        placeholder: "Choose one",
        showIf: (a) => !goalIs(a, "browse"),
      },
      {
        id: "situation",
        label: "RIGHT NOW YOU'RE",
        kind: "single",
        options: CURRENT_SITUATION,
        placeholder: "Choose one",
        showIf: (a) => !goalIs(a, "browse"),
      },
      {
        id: "relocatingFrom",
        label: "MOVING FROM",
        kind: "text",
        placeholder: "City and state",
        showIf: (a) => str(a, "situation") === "relocating",
      },
    ],
  },

  {
    id: "search",
    eyebrow: "STEP THREE",
    title: "What are you looking for?",
    blurb:
      "Rough is fine. This is a starting point your agent will refine with you, not a contract.",
    optional: true,
    showIf: (a) => goalIs(a, "buy", "both", "rent", "browse"),
    fields: [
      {
        id: "areas",
        label: "AREAS YOU'RE INTERESTED IN",
        kind: "multi",
        optionsKey: "neighborhoods",
        allowCustom: true,
        hint: "Pick from where your agent works, or type anywhere else.",
      },
      {
        id: "budget",
        label: "BUDGET",
        kind: "single",
        options: BUDGET_BANDS,
        placeholder: "Choose a range",
      },
      { id: "beds", label: "BEDROOMS", kind: "single", options: BED_COUNTS, placeholder: "Any" },
      { id: "baths", label: "BATHROOMS", kind: "single", options: BATH_COUNTS, placeholder: "Any" },
      {
        id: "propertyTypes",
        label: "PROPERTY TYPES",
        kind: "multi",
        options: PROPERTY_TYPES,
        allowCustom: true,
      },
      {
        id: "mustHaves",
        label: "WHAT MATTERS MOST",
        kind: "multi",
        options: MUST_HAVES,
        allowCustom: true,
        hint: "Choose as many as you like — this is what gets matched against.",
      },
      {
        id: "dealBreakers",
        label: "DEAL BREAKERS",
        kind: "longtext",
        placeholder: "Busy road, HOA, long commute — anything that rules a home out",
      },
    ],
  },

  {
    id: "property",
    eyebrow: "YOUR PROPERTY",
    title: "Tell them about the place.",
    blurb: "Enough to prepare properly before the first walkthrough.",
    optional: true,
    showIf: (a) => goalIs(a, "sell", "both"),
    fields: [
      {
        id: "propertyAddress",
        label: "ADDRESS",
        kind: "text",
        placeholder: "Street, city",
      },
      {
        id: "propertyType",
        label: "PROPERTY TYPE",
        kind: "single",
        options: PROPERTY_TYPES,
        placeholder: "Choose one",
        allowCustom: true,
      },
      {
        id: "occupancy",
        label: "WHO'S IN IT",
        kind: "single",
        options: OCCUPANCY,
        placeholder: "Choose one",
      },
      {
        id: "targetPrice",
        label: "PRICE YOU HAVE IN MIND",
        kind: "single",
        options: BUDGET_BANDS,
        placeholder: "Choose a range",
        hint: "Your agent will bring comparable sales to this conversation.",
      },
      {
        id: "propertyNotes",
        label: "ANYTHING THEY SHOULD KNOW",
        kind: "longtext",
        placeholder: "Recent work, known issues, tenants, timing constraints",
      },
    ],
  },

  {
    id: "financing",
    eyebrow: "FINANCING",
    title: "How is the purchase funded?",
    blurb:
      "Sellers ask this before they accept an offer, so knowing it early is what keeps you competitive.",
    optional: true,
    showIf: (a) => goalIs(a, "buy", "both"),
    fields: [
      {
        id: "purchaseMethod",
        label: "HOW YOU'RE PURCHASING",
        kind: "single",
        options: PURCHASE_METHODS,
        placeholder: "Choose one",
      },
      {
        id: "approvalStatus",
        label: "PRE-APPROVAL",
        kind: "single",
        options: APPROVAL_STATUS,
        placeholder: "Choose one",
        hint: "\u201cNot started\u201d is a perfectly normal answer — they can point you to a lender.",
      },
      {
        id: "lender",
        label: "LENDER",
        kind: "text",
        placeholder: "Who you're working with",
        showIf: (a) => ["approved", "prequalified", "in-progress"].includes(str(a, "approvalStatus")),
      },
      {
        id: "firstTime",
        label: "FIRST-TIME BUYER?",
        kind: "single",
        options: FIRST_TIME,
        placeholder: "Choose one",
        hint: "There are programmes and credits that only apply to first purchases.",
      },
    ],
  },

  {
    id: "finishing",
    eyebrow: "LAST ONE",
    title: "Anything else?",
    blurb: "A face to the name, and anything the questions above didn't cover.",
    optional: true,
    fields: [
      {
        id: "photo",
        label: "PROFILE PHOTO",
        kind: "photo",
        hint: "Optional. It helps your agent put a face to your name.",
      },
      {
        id: "note",
        label: "A NOTE TO YOUR AGENT",
        kind: "longtext",
        placeholder: "What you're hoping for, what worries you, anything at all",
      },
    ],
  },
];

/* --------------------------- derived helpers --------------------------- */

/** Steps that apply given the answers so far. */
export function visibleSteps(a: ProfileAnswers): ProfileStep[] {
  return PROFILE_STEPS.filter((s) => (s.showIf ? s.showIf(a) : true));
}

/** Fields within a step that apply given the answers so far. */
export function visibleFields(step: ProfileStep, a: ProfileAnswers): ProfileField[] {
  return step.fields.filter((f) => (f.showIf ? f.showIf(a) : true));
}

export function hasValue(a: ProfileAnswers, id: string): boolean {
  const v = a[id];
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" && v.trim().length > 0;
}

/** Required fields in a step that are still blank. */
export function missingRequired(step: ProfileStep, a: ProfileAnswers): ProfileField[] {
  return visibleFields(step, a).filter((f) => f.required && !hasValue(a, f.id));
}

/**
 * The intake floor — name, contact, goal and timeline. Below this an agent
 * cannot do their job, so this is what "profile complete" is measured against.
 */
export function essentialsMet(a: ProfileAnswers): boolean {
  return visibleSteps(a)
    .flatMap((s) => visibleFields(s, a))
    .filter((f) => f.required)
    .every((f) => hasValue(a, f.id));
}

/** How full the profile is overall, across every applicable field. */
export function completion(a: ProfileAnswers): { done: number; total: number; pct: number } {
  const fields = visibleSteps(a).flatMap((s) => visibleFields(s, a));
  const total = fields.length;
  const done = fields.filter((f) => hasValue(a, f.id)).length;
  return { done, total, pct: total === 0 ? 0 : done / total };
}

/** Human label for a stored value, for read-back on the realtor's side. */
export function labelFor(field: ProfileField, value: string): string {
  const hit = field.options?.find((o) => o.value === value);
  return hit?.label ?? value;
}

/** Find a field anywhere in the schema. Used when rendering saved answers. */
export function fieldById(id: string): ProfileField | undefined {
  for (const s of PROFILE_STEPS) {
    const hit = s.fields.find((f) => f.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * A short line describing the client, assembled from their own answers.
 * Shown on the realtor's roster so the list reads as people rather than rows.
 */
export function profileHeadline(a: ProfileAnswers): string {
  const goal = GOALS.find((g) => g.value === str(a, "goal"))?.label ?? "";
  const time = TIMELINES.find((t) => t.value === str(a, "timeline"))?.label ?? "";
  const budget = BUDGET_BANDS.find((b) => b.value === str(a, "budget"))?.label ?? "";
  return [goal, budget, time].filter(Boolean).join(" · ");
}
