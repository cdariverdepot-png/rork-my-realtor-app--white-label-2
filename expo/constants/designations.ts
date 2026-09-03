/**
 * The professional designations that actually matter in residential real
 * estate, stored as a pick-list rather than free text.
 *
 * Two reasons this is a catalogue and not a text field: these are trademarked
 * terms that get misspelled constantly, and structured codes let every theme
 * choose whether to render the short mark ("ABR") or the full name. A realtor
 * can still add anything missing as a custom entry.
 */
export type DesignationDef = {
  code: string;
  mark: string;
  name: string;
  /** One-line plain-English explanation, shown in the picker only. */
  blurb: string;
};

export const DESIGNATIONS: DesignationDef[] = [
  { code: "ABR", mark: "ABR", name: "Accredited Buyer's Representative", blurb: "Buyer-side specialist" },
  { code: "AHWD", mark: "AHWD", name: "At Home With Diversity", blurb: "Inclusive practice certification" },
  { code: "ALC", mark: "ALC", name: "Accredited Land Consultant", blurb: "Land and acreage" },
  { code: "CCIM", mark: "CCIM", name: "Certified Commercial Investment Member", blurb: "Commercial investment" },
  { code: "CIPS", mark: "CIPS", name: "Certified International Property Specialist", blurb: "International buyers" },
  { code: "CLHMS", mark: "CLHMS", name: "Certified Luxury Home Marketing Specialist", blurb: "Luxury market" },
  { code: "CRB", mark: "CRB", name: "Certified Real Estate Brokerage Manager", blurb: "Brokerage management" },
  { code: "CRS", mark: "CRS", name: "Certified Residential Specialist", blurb: "Top-tier residential" },
  { code: "C2EX", mark: "C2EX", name: "Commitment to Excellence", blurb: "NAR excellence endorsement" },
  { code: "GRI", mark: "GRI", name: "Graduate, REALTOR® Institute", blurb: "Broad professional training" },
  { code: "GREEN", mark: "GREEN", name: "NAR's Green Designation", blurb: "Energy-efficient homes" },
  { code: "MRP", mark: "MRP", name: "Military Relocation Professional", blurb: "Military families" },
  { code: "PSA", mark: "PSA", name: "Pricing Strategy Advisor", blurb: "Valuation and pricing" },
  { code: "RENE", mark: "RENE", name: "Real Estate Negotiation Expert", blurb: "Negotiation" },
  { code: "RSPS", mark: "RSPS", name: "Resort & Second-Home Property Specialist", blurb: "Resort and second homes" },
  { code: "SFR", mark: "SFR", name: "Short Sales & Foreclosure Resource", blurb: "Distressed property" },
  { code: "SRES", mark: "SRES", name: "Seniors Real Estate Specialist", blurb: "Clients over 50" },
  { code: "SRS", mark: "SRS", name: "Seller Representative Specialist", blurb: "Listing-side specialist" },
  { code: "e-PRO", mark: "e-PRO", name: "e-PRO® Certification", blurb: "Digital marketing" },
];

export const findDesignation = (code: string): DesignationDef | undefined =>
  DESIGNATIONS.find((d) => d.code === code);
