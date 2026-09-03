/**
 * Editorial market & neighborhood content — written in Eliza's voice.
 */

export type Neighborhood = {
  id: string;
  name: string;
  region: string;
  image: string;
  pace: string;
  pricePulse: string;
  blurb: string;
  vibe: string[];
  picks: { kind: "Coffee" | "Dinner" | "Walk" | "School" | "Listen"; name: string; note: string }[];
};

export const neighborhoods: Neighborhood[] = [
  {
    id: "lakeshore",
    name: "Lakeshore Drive",
    region: "Coeur d'Alene",
    image: "https://r2-pub.rork.com/generated-images/5fb2bc37-b818-417d-b0d2-13522cb9cd43.png",
    pace: "Quietly competitive",
    pricePulse: "Up 2.4% YoY · legacy lakefront demand returning",
    blurb:
      "East-shore frontage with real depth at the dock is trading first. Anything renovated, with a covered slip, is going inside ten days.",
    vibe: ["Lakefront", "Legacy", "Family-quiet"],
    picks: [
      { kind: "Coffee", name: "Evans Brothers · Sherman", note: "My Sunday open-house warm-up." },
      { kind: "Dinner", name: "Beverly's at the Resort", note: "I bring sellers here when we go to contract." },
      { kind: "Walk", name: "Tubbs Hill loop", note: "Wildflowers in May are unreal." },
      { kind: "School", name: "Sorensen Magnet zone", note: "If schooling matters, this is the line." },
    ],
  },
  {
    id: "black-rock",
    name: "Black Rock",
    region: "South Shore",
    image: "https://r2-pub.rork.com/generated-images/559a4a6a-2bf0-441f-b9ed-f2ea9d1bcfaa.png",
    pace: "Aggressive, quiet money",
    pricePulse: "Fairway villas tightening · lakefront inventory thin under $6M",
    blurb:
      "If you want the gates, you'll want me on the phone weekly. I see them before the sign goes up.",
    vibe: ["Gated", "Golf-soul", "Discreet"],
    picks: [
      { kind: "Coffee", name: "Calypsos · Coeur d'Alene", note: "Best morning light on Sherman." },
      { kind: "Dinner", name: "The Cellar", note: "Still the right table downtown." },
      { kind: "Walk", name: "Mineral Ridge trail", note: "Show up at sunset; bring a buyer." },
    ],
  },
  {
    id: "hayden-lake",
    name: "Hayden Lake",
    region: "North Idaho",
    image: "https://r2-pub.rork.com/generated-images/11d8a5b2-16b9-43c2-8f31-e0ba4bfd58d3.png",
    pace: "Patient sellers, ready buyers",
    pricePulse: "Below $6M is where the conversation is",
    blurb:
      "Days-on-market is up — but only because sellers are pricing optimistically. The right price still moves in a weekend.",
    vibe: ["Cedar-shingle", "Tree-lined", "Watermark-quiet"],
    picks: [
      { kind: "Coffee", name: "Honey Bakery", note: "Show up at 7. I'm usually there at 7:05." },
      { kind: "Dinner", name: "Porch Public House", note: "Family table when we close in summer." },
      { kind: "Walk", name: "Honeysuckle Beach at 6pm", note: "The light I keep telling buyers about." },
      { kind: "Listen", name: "The Coeur d'Alene Summer Theatre", note: "Worth keeping a Friday open in July." },
    ],
  },
];

export const marketPulse = {
  headline: "What I'm watching this week",
  date: "This week",
  paragraphs: [
    "Inventory at the very top is still tight, but I'm seeing real movement just below $4M — sellers picking up the phone again, buyers writing real offers.",
    "Rates dipped enough to bring back the buyer who waited too long last cycle. If that's you, let's get coffee before the summer market gets noisy.",
    "Lakefront remains personal. I have three off-market I'd walk you through this week if the timing is right.",
  ],
  signoff: "Always personally,",
};
