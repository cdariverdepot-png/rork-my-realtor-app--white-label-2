import type { ClientLayoutId } from "@/constants/clientLayouts";
import type { Brand } from "@/contexts/BrandContext";

/** User-supplied, bundled showroom assets only. Never a fallback for real users. */
const portraits: Partial<Record<ClientLayoutId, number>> = {
  "private-collection": require("../assets/theme-portraits/michael-dam-mEZ3PoFGs_k-unsplash.jpg"),
  "eliza-editorial": require("../assets/theme-portraits/eliza.png"),
  "advisor-journal": require("../assets/theme-portraits/vance.png"),
  "coastal-personal": require("../assets/theme-portraits/marissa.png"),
  "warm-concierge": require("../assets/theme-portraits/brooke-balentine-cdZcNIca4w0-unsplash.jpg"),
  "modern-editorial": require("../assets/theme-portraits/noah.png"),
  "portrait-statement": require("../assets/theme-portraits/aiease_1778303545504.jpg"),
};

export function withSamplePortrait<T extends { brand: Brand; sample: boolean }>(preview: T): T & { portraitSource?: number } {
  return { ...preview, portraitSource: preview.sample && preview.brand.layoutId ? portraits[preview.brand.layoutId] : undefined };
}
