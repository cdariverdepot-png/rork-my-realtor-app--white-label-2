/**
 * Example copy shown as greyed-out placeholder text inside Brand Studio fields.
 *
 * These are NEVER saved as values — they exist only to show the realtor the
 * shape of what a field wants (a title, a sentence, a paragraph). The field
 * stays genuinely empty until the realtor types over it, which is what keeps
 * the go-live checklist honest and stops demo copy reading as their own.
 */
export const studioPlaceholders = {
  profile: {
    name: "Jordan Ellis",
    title: "Private Real Estate Advisor",
    city: "Coeur d'Alene · North Idaho",
    phone: "+1 (208) 555-0144",
    email: "you@yourbrand.com",
    yearsActive: "14",
    closedVolume: "$320M",
    tagline: "The lake is personal. So is the way I find your place on it.",
  },
  hero: {
    monogram: "JE",
    brandName: "ELLIS",
    brandSub: "PRIVATE · EST. 2011",
    heroEyebrow: "A PERSONAL INTRODUCTION",
    heroMessage: "I don't have a thousand listings.\nI have the right one for you.",
    primaryCta: "Show me what's quiet",
    secondaryCta: "A private note",
    welcomeNote:
      "Hello — I'm so glad you're here. Take a quiet moment to look through what I'm watching this week. If something stops you, send me a note. I read every one myself.",
  },
  note: {
    date: "This week",
    title: "What I'm seeing this week",
    opener: "Hello, friend —",
    body: "Inventory at the top of the market is still tight — but I'm noticing a quiet shift. Sellers who weren't moving in February are picking up the phone again.",
    signoff: "Always personally,",
  },
  beat: {
    headline: "The honest read on the market — from me, not a chart.",
    label: "Lakefront",
    copy: "Moving again. Best inventory I've seen in 18 months between $3M–$6M.",
  },
  pulse: {
    date: "This week",
    headline: "This week's market pulse",
    paragraph:
      "Pricing, inventory, and the moves worth making — written in your own voice, for your own clients.",
    signoff: "Always personally,",
  },
  credentials: {
    eyebrow: "Background",
    title: "Credentials & training.",
    institution: "University of Washington",
    credential: "B.A. Architecture",
    year: "2007",
    awardTitle: "Top 1% Statewide",
    issuer: "Idaho REALTORS®",
    membership: "National Association of REALTORS®",
    language: "French",
    licenseNumber: "SP00-000000",
    licenseState: "ID",
    brokerage: "Ellis Private Brokerage",
    since: "2011",
    designation: "Certified Negotiation Expert",
  },
  copyright: "Ellis Private. By appointment only.",
} as const;
