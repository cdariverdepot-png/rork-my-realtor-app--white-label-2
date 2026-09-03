/**
 * Single source of truth for realtor persona, listings, testimonials
 * and the personal note. All copy is written in the realtor's voice.
 */

export type Listing = {
  id: string;
  title: string;
  neighborhood: string;
  price: string;
  beds: number;
  baths: number;
  sqft: string;
  image: string;
  elizaTake: string;
  tag: "Off-market" | "Quiet listing" | "New" | "Just reduced";
};

export const realtor = {
  name: "Eliza Vance",
  title: "Private Real Estate Advisor",
  city: "Coeur d'Alene · North Idaho",
  yearsActive: 14,
  closedVolume: "$320M",
  phone: "+1 (208) 555-0144",
  email: "eliza@vanceprivate.com",
  tagline: "The lake is personal. So is the way I find your place on it.",
  heroMessage:
    "I don't have a thousand listings.\nI have the right one for you.",
  welcomeNote:
    "Hello — I'm so glad you're here. Take a quiet moment to look through what I'm watching this week on the lake. If something stops you, send me a note. I read every one myself.",
};

export const listings: Listing[] = [
  {
    id: "lakeshore-estate",
    title: "Lakeshore Drive Estate",
    neighborhood: "Coeur d'Alene · Lakeshore",
    price: "$11.9M",
    beds: 5,
    baths: 5.5,
    sqft: "6,420 sqft",
    image: "https://r2-pub.rork.com/generated-images/871f2ba8-1348-412f-97a6-3cd1dd67fd08.png",
    tag: "Off-market",
    elizaTake:
      "This one almost never came to me — the owner is a private client. 180 feet of frontage, a covered slip and a pebble beach the kids actually use. If you've been waiting for a true legacy lakefront on the east shore, this is it.",
  },
  {
    id: "black-rock-villa",
    title: "Black Rock Fairway Villa",
    neighborhood: "Black Rock · South Shore",
    price: "$5.85M",
    beds: 5,
    baths: 5.5,
    sqft: "5,180 sqft",
    image: "https://r2-pub.rork.com/generated-images/ac5303f8-fcbd-4c0d-bef5-0b96769ff128.png",
    tag: "Quiet listing",
    elizaTake:
      "Inside the gates at Black Rock, the kind of build people stop renovating once they see it. The light off the lake at five in the afternoon is something you have to feel in person — let me show you.",
  },
  {
    id: "sanders-beach-cottage",
    title: "Sanders Beach Cottage",
    neighborhood: "Sanders Beach · Downtown",
    price: "$3.95M",
    beds: 3,
    baths: 3,
    sqft: "2,860 sqft",
    image: "https://r2-pub.rork.com/generated-images/d6689720-be2d-4053-ad84-db0aa654568e.png",
    tag: "Just reduced",
    elizaTake:
      "Walk-to-the-lake cottage, taken back to studs and rebuilt right. The seller adjusted this week — at this number it won't last the month. I'd act on it.",
  },
  {
    id: "hayden-lake-lodge",
    title: "Hayden Lake Lodge",
    neighborhood: "Hayden Lake · West Bay",
    price: "$8.4M",
    beds: 6,
    baths: 6.5,
    sqft: "7,100 sqft",
    image: "https://r2-pub.rork.com/generated-images/05d3611b-34ff-41bf-be78-c075ab6d2bc6.png",
    tag: "New",
    elizaTake:
      "I previewed this Tuesday before it goes wide. Two-slip boathouse, deep water, sunset exposure. Hayden lakefront of this caliber comes once or twice a year — and it never sits.",
  },
  {
    id: "gozzer-ridge-retreat",
    title: "Gozzer Ridge Retreat",
    neighborhood: "Gozzer Ranch · Ridge",
    price: "$6.75M",
    beds: 4,
    baths: 4.5,
    sqft: "4,820 sqft",
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&q=80",
    tag: "Quiet listing",
    elizaTake:
      "Inside the gates at Gozzer, sitting on the ridge with full lake exposure. The kitchen was redone last spring by a Sun Valley designer — every surface, the right one. Memberships transfer with the home.",
  },
  {
    id: "tubbs-hill-residence",
    title: "Tubbs Hill Residence",
    neighborhood: "Coeur d'Alene · Tubbs Hill",
    price: "$4.2M",
    beds: 4,
    baths: 3.5,
    sqft: "3,640 sqft",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80",
    tag: "New",
    elizaTake:
      "Walk to the lake, walk to dinner downtown. Architect-built in 2019 with a roof deck that catches every sunset over the resort. A rare in-town home that doesn't compromise on light or privacy.",
  },
];

export const personalNote = {
  date: "This week",
  title: "What I'm seeing this week",
  body: [
    "Inventory at the very top of the lake market is still tight — but I'm noticing a quiet shift below $4M. Sellers who weren't moving in February are picking up the phone again, and a few of my favorite homes off Lakeshore have whisper listings I'd love to walk you through.",
    "Rates dipped just enough to bring a particular kind of buyer back: the one who waited too long last cycle. If that's you, let's talk before the summer market gets loud.",
    "And if you're selling — pricing is everything right now. I'd rather price you sharp and have three offers in ten days than chase the market down for ninety.",
  ],
  signoff: "Always personally,",
};

export const marketBeat = {
  headline: "The honest read on the market — from me, not a chart.",
  bullets: [
    {
      label: "Lakefront",
      copy: "Moving again. Best inventory I've seen in 18 months between $3M–$6M.",
    },
    {
      label: "Black Rock & Gozzer",
      copy: "Quiet but real. Sellers are listening — write the offer that's right for you.",
    },
    {
      label: "Hayden Lake",
      copy: "Always personal. I have three off-market I can introduce you to this week.",
    },
  ],
};

export const testimonials = [
  {
    quote:
      "Eliza found us a lake home that was never on the market. We closed in nineteen days. There is no one else I'd call.",
    author: "M. & J. Halberg",
    detail: "Closed · Lakeshore Drive · $7.2M",
  },
  {
    quote:
      "She told me not to buy a place I loved. She was right. Three months later she put me in something I love more — for less money.",
    author: "Daniel R.",
    detail: "Closed · Black Rock · $4.6M",
  },
  {
    quote:
      "The most discreet, prepared, calm person I've worked with in twenty years of buying real estate.",
    author: "Confidential client",
    detail: "Closed · Hayden Lake · $9.8M",
  },
];

export const recentlyClosed = [
  { address: "E Lakeshore Dr · Coeur d'Alene", price: "$5.1M", days: "12 days" },
  { address: "Bozanta Dr · Hayden Lake", price: "$8.4M", days: "31 days" },
  { address: "Sanders Beach · 12th St", price: "$3.8M", days: "8 days" },
];
