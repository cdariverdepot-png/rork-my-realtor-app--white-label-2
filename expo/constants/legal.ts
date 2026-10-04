/**
 * Legal copy for the App Store listing and the in-app links.
 *
 * Kept as data rather than JSX so the same text can be rendered in-app and
 * lifted verbatim onto the public website — App Review requires a reachable
 * URL as well as the in-app link, and the two must not disagree.
 *
 * The wording is deliberately specific about this app's actual behaviour. A
 * boilerplate policy that claims we collect analytics we don't collect, or
 * omits the realtor-as-recipient relationship that defines this product, is
 * worse than none: it is a promise we would be breaking on day one.
 */

/** Last substantive revision. Surfaced in the UI so users can see staleness. */
export const LEGAL_UPDATED = "22 August 2026";

/** Where privacy requests and support mail goes. */
export const SUPPORT_EMAIL = "hello@myrealtorapp.com";

export type LegalSection = {
  heading: string;
  /** Paragraphs. Rendered in order with spacing between. */
  body: string[];
  /** Optional bulleted points shown after the paragraphs. */
  bullets?: string[];
};

export type LegalDoc = {
  id: "privacy" | "terms";
  title: string;
  /** One-line summary shown under the title. */
  intro: string;
  sections: LegalSection[];
};

export const PRIVACY: LegalDoc = {
  id: "privacy",
  title: "Privacy Policy",
  intro:
    "What this app collects, why it needs it, and who can see it. Written in plain language because you should not need a lawyer to understand what happens to your information.",
  sections: [
    {
      heading: "The short version",
      body: [
        "This app exists so a real estate professional can serve their clients. If you are a client, the information you provide goes to your realtor and to nobody else. We do not sell data, we do not build advertising profiles, and we do not share anything with third-party marketers.",
      ],
    },
    {
      heading: "What we collect",
      body: ["The information held depends on which side of the app you are on."],
      bullets: [
        "Realtors: your name, email, password, phone number, brokerage and licence details, service area, portrait and branding, your listings, your client roster, your calendar links and any documents you add.",
        "Clients: your name, email, password, phone number, and whatever you choose to enter in your profile — your budget, timeline, preferred areas, financing status and similar. All of it is optional beyond your name, email, phone and how you prefer to be contacted.",
        "Both: messages you send in the app, properties you favourite, appointments you book, and notifications you receive.",
        "Technical: a device push token if you enable notifications, so alerts can reach your phone.",
      ],
    },
    {
      heading: "What we do not collect",
      body: [
        "No advertising identifiers. No third-party analytics or tracking SDKs. No location tracking — the app never asks for your location. No access to your photos, camera or contacts unless you tap a control that needs them, and then only for that action.",
        "Contacts imported by a realtor are read on the device to build their own client roster. They are not uploaded anywhere else.",
      ],
    },
    {
      heading: "Who can see your information",
      body: [
        "If you are a client, your realtor can see your profile, your messages, the properties you favourite and your appointments. That is the point of the app: you are giving your agent the information they need to represent you well.",
        "Your realtor cannot see clients belonging to any other realtor, and no other realtor can see you. Each realtor's app is a separate space.",
        "We use Supabase to store and sync data. They process it on our behalf and do not use it for their own purposes.",
      ],
    },
    {
      heading: "Where it is stored",
      body: [
        "Data is stored on your device and synced to our hosted database so it is available across your devices and reaches the person it is meant for. Passwords are never stored in readable form — only a one-way cryptographic hash, which cannot be reversed back into your password.",
      ],
    },
    {
      heading: "Deleting your account",
      body: [
        "You can delete your account at any time from the Account screen in the app. Deletion is immediate and permanent.",
        "If you are a client, deleting removes your account, your profile, your messages and your favourites, and frees the connection with your realtor. Your realtor may still hold your name and contact details in their own address book, exactly as they would if you had given them a business card — that is their record, not ours, and you should ask them directly to remove it.",
        "If you are a realtor, deleting removes your account, your branding, your listings, your client roster, your messages and your documents. Clients connected to you will lose access to your app.",
      ],
    },
    {
      heading: "Children",
      body: [
        "This app is intended for adults conducting real estate business. It is not directed at children under 13 and we do not knowingly collect their information.",
      ],
    },
    {
      heading: "Changes and contact",
      body: [
        `We will update this policy if what we collect changes, and the date at the top will change with it. Questions, corrections or requests for a copy of your data: ${SUPPORT_EMAIL}.`,
      ],
    },
  ],
};

export const TERMS: LegalDoc = {
  id: "terms",
  title: "Terms of Use",
  intro:
    "The agreement between you and us for using this app. Short, and worth reading — especially the part about what this app is not.",
  sections: [
    {
      heading: "What this app is",
      body: [
        "This app is a tool that lets a real estate professional present their listings and communicate with their clients under their own branding. We provide the software. We are not a party to any real estate transaction, we are not a broker, and we do not represent anyone in a deal.",
      ],
    },
    {
      heading: "What this app is not",
      body: [
        "Nothing in this app is legal, financial, tax or investment advice. Property information, prices, availability and market figures are supplied by the realtor or by third-party sources and may be out of date or incorrect. Always verify anything you intend to rely on before making a decision.",
        "Booking a viewing or sending a message through this app does not create an agency relationship, an offer, or a binding agreement of any kind.",
      ],
    },
    {
      heading: "Your account",
      body: [
        "You are responsible for keeping your password confidential and for what happens under your account. Provide accurate information when you sign up. One account per person.",
        "Realtors are additionally responsible for the accuracy and legality of everything they publish through the app: listing details, licence and brokerage information, claims about their track record, and any required disclosures in their jurisdiction. Fair housing and real estate advertising law applies to what you put here exactly as it does anywhere else.",
      ],
    },
    {
      heading: "Acceptable use",
      body: ["You agree not to:"],
      bullets: [
        "Use the app for anything unlawful, deceptive or discriminatory.",
        "Upload content you do not have the rights to, including listing photographs you did not licence.",
        "Attempt to access another realtor's or client's data.",
        "Interfere with, overload or reverse engineer the service.",
      ],
    },
    {
      heading: "Content you provide",
      body: [
        "You keep ownership of everything you upload. You grant us only the permission needed to store it, sync it between devices and display it to the people you are sharing it with. We do not use your content for anything else.",
      ],
    },
    {
      heading: "Paid plans",
      body: [
        "Realtors receive full standard evaluation access for up to three connected client accounts, with no evaluation expiration or payment details required. Clients never pay. Monthly and annual standard subscriptions provide identical features and unlimited connected clients. Monthly pricing is $49/month. Annual pricing is $490/year, billed annually; the full annual amount is charged upfront. Subscriptions renew until canceled through the supported billing provider. Cancellation takes effect at the end of the paid period shown in account billing. Former subscribers do not regain evaluation access. Payment failures are handled separately through the billing provider's recovery process.",
        "The custom app service costs $499 for setup plus a required $49/month or $490/year service subscription. Hosting, standard platform updates and bug fixes are included; additional custom design and features are separately quoted. Publication is directly through the realtor's own Apple Developer account, with membership fees paid separately. Store approval is subject to Apple review. Billing remains in test mode during implementation.",
      ],
    },
    {
      heading: "Availability and liability",
      body: [
        "The service is provided as is. We work to keep it running and your data safe, but we cannot guarantee uninterrupted availability or that it will be free of faults. Keep your own copies of anything you cannot afford to lose.",
        "To the fullest extent the law allows, we are not liable for indirect or consequential losses, lost profits, or losses arising from a real estate transaction. Nothing here limits liability that cannot legally be limited.",
      ],
    },
    {
      heading: "Ending it",
      body: [
        "You can delete your account at any time from the Account screen. We may suspend or close an account that breaches these terms. On termination your right to use the app ends and your data is removed as described in the Privacy Policy.",
      ],
    },
    {
      heading: "Contact",
      body: [`Questions about these terms: ${SUPPORT_EMAIL}.`],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDoc["id"], LegalDoc> = {
  privacy: PRIVACY,
  terms: TERMS,
};
