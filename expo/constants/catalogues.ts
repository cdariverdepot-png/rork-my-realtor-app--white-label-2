/**
 * Closed-ish vocabularies used by Brand Studio pickers.
 *
 * These exist so the same real-world fact is always stored the same way. A
 * licence line reading "ID" in one record and "Idaho" in another is a
 * compliance bug, and a vibe chip reading "Walkable" next to "very walkable
 * area" is a design bug. Lists that have a genuine long tail (brokerages,
 * degrees, memberships) are paired with `allowCustom` on the field rather than
 * being padded out here.
 *
 * Nothing in this file is marketing copy — the realtor's voice is never picked
 * from a list.
 */

export type CatalogueOption = {
  value: string;
  label: string;
  /** Secondary line shown under the label in the picker sheet. */
  sub?: string;
};

/** Two-letter USPS codes. Stored as the code; shown as the full state name. */
export const US_STATES: CatalogueOption[] = [
  { value: "AL", label: "Alabama", sub: "AL" },
  { value: "AK", label: "Alaska", sub: "AK" },
  { value: "AZ", label: "Arizona", sub: "AZ" },
  { value: "AR", label: "Arkansas", sub: "AR" },
  { value: "CA", label: "California", sub: "CA" },
  { value: "CO", label: "Colorado", sub: "CO" },
  { value: "CT", label: "Connecticut", sub: "CT" },
  { value: "DE", label: "Delaware", sub: "DE" },
  { value: "DC", label: "District of Columbia", sub: "DC" },
  { value: "FL", label: "Florida", sub: "FL" },
  { value: "GA", label: "Georgia", sub: "GA" },
  { value: "HI", label: "Hawaii", sub: "HI" },
  { value: "ID", label: "Idaho", sub: "ID" },
  { value: "IL", label: "Illinois", sub: "IL" },
  { value: "IN", label: "Indiana", sub: "IN" },
  { value: "IA", label: "Iowa", sub: "IA" },
  { value: "KS", label: "Kansas", sub: "KS" },
  { value: "KY", label: "Kentucky", sub: "KY" },
  { value: "LA", label: "Louisiana", sub: "LA" },
  { value: "ME", label: "Maine", sub: "ME" },
  { value: "MD", label: "Maryland", sub: "MD" },
  { value: "MA", label: "Massachusetts", sub: "MA" },
  { value: "MI", label: "Michigan", sub: "MI" },
  { value: "MN", label: "Minnesota", sub: "MN" },
  { value: "MS", label: "Mississippi", sub: "MS" },
  { value: "MO", label: "Missouri", sub: "MO" },
  { value: "MT", label: "Montana", sub: "MT" },
  { value: "NE", label: "Nebraska", sub: "NE" },
  { value: "NV", label: "Nevada", sub: "NV" },
  { value: "NH", label: "New Hampshire", sub: "NH" },
  { value: "NJ", label: "New Jersey", sub: "NJ" },
  { value: "NM", label: "New Mexico", sub: "NM" },
  { value: "NY", label: "New York", sub: "NY" },
  { value: "NC", label: "North Carolina", sub: "NC" },
  { value: "ND", label: "North Dakota", sub: "ND" },
  { value: "OH", label: "Ohio", sub: "OH" },
  { value: "OK", label: "Oklahoma", sub: "OK" },
  { value: "OR", label: "Oregon", sub: "OR" },
  { value: "PA", label: "Pennsylvania", sub: "PA" },
  { value: "RI", label: "Rhode Island", sub: "RI" },
  { value: "SC", label: "South Carolina", sub: "SC" },
  { value: "SD", label: "South Dakota", sub: "SD" },
  { value: "TN", label: "Tennessee", sub: "TN" },
  { value: "TX", label: "Texas", sub: "TX" },
  { value: "UT", label: "Utah", sub: "UT" },
  { value: "VT", label: "Vermont", sub: "VT" },
  { value: "VA", label: "Virginia", sub: "VA" },
  { value: "WA", label: "Washington", sub: "WA" },
  { value: "WV", label: "West Virginia", sub: "WV" },
  { value: "WI", label: "Wisconsin", sub: "WI" },
  { value: "WY", label: "Wyoming", sub: "WY" },
];

/**
 * Regulated professional titles. Many states restrict who may call themselves
 * a Broker or use the REALTOR® mark, and the ® is easily lost in free text.
 */
export const AGENT_TITLES: CatalogueOption[] = [
  { value: "REALTOR®", label: "REALTOR®", sub: "Member of the National Association of REALTORS®" },
  { value: "Real Estate Broker", label: "Real Estate Broker" },
  { value: "Associate Broker", label: "Associate Broker" },
  { value: "Managing Broker", label: "Managing Broker" },
  { value: "Broker Associate", label: "Broker Associate" },
  { value: "Real Estate Salesperson", label: "Real Estate Salesperson" },
  { value: "Licensed Real Estate Agent", label: "Licensed Real Estate Agent" },
  { value: "Private Real Estate Advisor", label: "Private Real Estate Advisor" },
  { value: "Luxury Property Specialist", label: "Luxury Property Specialist" },
  { value: "Founding Partner", label: "Founding Partner" },
];

/** Academic credentials. Long tail is real, so pair with allowCustom. */
export const DEGREES: CatalogueOption[] = [
  { value: "B.A.", label: "B.A.", sub: "Bachelor of Arts" },
  { value: "B.S.", label: "B.S.", sub: "Bachelor of Science" },
  { value: "B.B.A.", label: "B.B.A.", sub: "Bachelor of Business Administration" },
  { value: "B.Arch.", label: "B.Arch.", sub: "Bachelor of Architecture" },
  { value: "M.A.", label: "M.A.", sub: "Master of Arts" },
  { value: "M.S.", label: "M.S.", sub: "Master of Science" },
  { value: "M.B.A.", label: "M.B.A.", sub: "Master of Business Administration" },
  { value: "M.Arch.", label: "M.Arch.", sub: "Master of Architecture" },
  { value: "J.D.", label: "J.D.", sub: "Juris Doctor" },
  { value: "Ph.D.", label: "Ph.D.", sub: "Doctor of Philosophy" },
  { value: "A.A.", label: "A.A.", sub: "Associate of Arts" },
  { value: "Certificate", label: "Certificate" },
];

/** National brands cover most agents; independents type their own. */
export const BROKERAGES: CatalogueOption[] = [
  { value: "Compass", label: "Compass" },
  { value: "Sotheby's International Realty", label: "Sotheby's International Realty" },
  { value: "Christie's International Real Estate", label: "Christie's International Real Estate" },
  { value: "Coldwell Banker", label: "Coldwell Banker" },
  { value: "Coldwell Banker Global Luxury", label: "Coldwell Banker Global Luxury" },
  { value: "Keller Williams", label: "Keller Williams" },
  { value: "RE/MAX", label: "RE/MAX" },
  { value: "Douglas Elliman", label: "Douglas Elliman" },
  { value: "Berkshire Hathaway HomeServices", label: "Berkshire Hathaway HomeServices" },
  { value: "Corcoran", label: "Corcoran" },
  { value: "eXp Realty", label: "eXp Realty" },
  { value: "Century 21", label: "Century 21" },
  { value: "Engel & Völkers", label: "Engel & Völkers" },
  { value: "Windermere", label: "Windermere" },
  { value: "John L. Scott", label: "John L. Scott" },
  { value: "@properties", label: "@properties" },
  { value: "Howard Hanna", label: "Howard Hanna" },
  { value: "Realty ONE Group", label: "Realty ONE Group" },
  { value: "Side", label: "Side" },
  { value: "The Agency", label: "The Agency" },
];

/** Professional bodies. Local boards are typed in as custom entries. */
export const MEMBERSHIPS: CatalogueOption[] = [
  { value: "National Association of REALTORS®", label: "National Association of REALTORS®", sub: "NAR" },
  { value: "Institute for Luxury Home Marketing", label: "Institute for Luxury Home Marketing" },
  { value: "Luxury Portfolio International", label: "Luxury Portfolio International" },
  { value: "Leading Real Estate Companies of the World", label: "Leading Real Estate Companies of the World" },
  { value: "Who's Who in Luxury Real Estate", label: "Who's Who in Luxury Real Estate" },
  { value: "REALTORS® Land Institute", label: "REALTORS® Land Institute" },
  { value: "Women's Council of REALTORS®", label: "Women's Council of REALTORS®" },
  { value: "Certified Commercial Investment Member Institute", label: "CCIM Institute" },
  { value: "Asian Real Estate Association of America", label: "Asian Real Estate Association of America" },
  { value: "National Association of Hispanic Real Estate Professionals", label: "NAHREP" },
  { value: "LGBTQ+ Real Estate Alliance", label: "LGBTQ+ Real Estate Alliance" },
];

/** Spoken languages. Stored as the English exonym for consistent rendering. */
export const LANGUAGES: CatalogueOption[] = [
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish", sub: "Español" },
  { value: "French", label: "French", sub: "Français" },
  { value: "German", label: "German", sub: "Deutsch" },
  { value: "Italian", label: "Italian", sub: "Italiano" },
  { value: "Portuguese", label: "Portuguese", sub: "Português" },
  { value: "Mandarin", label: "Mandarin", sub: "普通话" },
  { value: "Cantonese", label: "Cantonese", sub: "廣東話" },
  { value: "Japanese", label: "Japanese", sub: "日本語" },
  { value: "Korean", label: "Korean", sub: "한국어" },
  { value: "Vietnamese", label: "Vietnamese", sub: "Tiếng Việt" },
  { value: "Tagalog", label: "Tagalog" },
  { value: "Hindi", label: "Hindi", sub: "हिन्दी" },
  { value: "Punjabi", label: "Punjabi", sub: "ਪੰਜਾਬੀ" },
  { value: "Urdu", label: "Urdu", sub: "اردو" },
  { value: "Arabic", label: "Arabic", sub: "العربية" },
  { value: "Hebrew", label: "Hebrew", sub: "עברית" },
  { value: "Russian", label: "Russian", sub: "Русский" },
  { value: "Ukrainian", label: "Ukrainian", sub: "Українська" },
  { value: "Polish", label: "Polish", sub: "Polski" },
  { value: "Dutch", label: "Dutch", sub: "Nederlands" },
  { value: "Swedish", label: "Swedish", sub: "Svenska" },
  { value: "Norwegian", label: "Norwegian", sub: "Norsk" },
  { value: "Danish", label: "Danish", sub: "Dansk" },
  { value: "Greek", label: "Greek", sub: "Ελληνικά" },
  { value: "Turkish", label: "Turkish", sub: "Türkçe" },
  { value: "Farsi", label: "Farsi", sub: "فارسی" },
  { value: "Thai", label: "Thai", sub: "ไทย" },
  { value: "American Sign Language", label: "American Sign Language", sub: "ASL" },
];

/**
 * Curated vocabulary for neighborhood chips.
 *
 * A fixed set keeps the chip row visually even across cards — the reason this
 * is a picker is typographic, not organisational.
 */
export const VIBE_TAGS: CatalogueOption[] = [
  { value: "Walkable", label: "Walkable" },
  { value: "Waterfront", label: "Waterfront" },
  { value: "Lakefront", label: "Lakefront" },
  { value: "Mountain views", label: "Mountain views" },
  { value: "Old growth", label: "Old growth" },
  { value: "Historic", label: "Historic" },
  { value: "New build", label: "New build" },
  { value: "Golf", label: "Golf" },
  { value: "Ski-in", label: "Ski-in" },
  { value: "Equestrian", label: "Equestrian" },
  { value: "Acreage", label: "Acreage" },
  { value: "Gated", label: "Gated" },
  { value: "Private dock", label: "Private dock" },
  { value: "Quiet streets", label: "Quiet streets" },
  { value: "Family-first", label: "Family-first" },
  { value: "Top schools", label: "Top schools" },
  { value: "Nightlife", label: "Nightlife" },
  { value: "Arts district", label: "Arts district" },
  { value: "Downtown", label: "Downtown" },
  { value: "Rural", label: "Rural" },
  { value: "Seasonal", label: "Seasonal" },
  { value: "Investment", label: "Investment" },
];

/**
 * Descending list of plausible years, newest first.
 *
 * @param back How many years into the past to offer.
 * @param forward How many years into the future (0 for historical fields).
 */
export function yearOptions(back: number = 60, forward: number = 0): CatalogueOption[] {
  const now = new Date().getFullYear();
  const out: CatalogueOption[] = [];
  for (let y = now + forward; y >= now - back; y--) out.push({ value: String(y), label: String(y) });
  return out;
}
