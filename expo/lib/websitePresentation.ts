import type { Brand } from '@/contexts/BrandContext';
import type { ThemeConfig } from '@/constants/theme';
export type { WebsiteDesign, WebsiteAppearance, WebsiteVariant } from '../../supabase/functions/analyze-realtor-build/websiteDesign';
import type { WebsiteAppearance, WebsiteDesign, WebsiteVariant } from '../../supabase/functions/analyze-realtor-build/websiteDesign';

/** Maps observed fonts to the fonts already shipped by the shared native app. */
export function websiteFont(family: string, heading = false): string {
  if (/montserrat/i.test(family)) return 'Montserrat_600SemiBold';
  if (/playfair/i.test(family)) return 'PlayfairDisplay_500Medium';
  if (/cormorant/i.test(family)) return 'CormorantGaramond_500Medium';
  if (/fraunces/i.test(family)) return 'Fraunces_500Medium';
  if (/dm serif/i.test(family)) return 'DMSerifDisplay_400Regular';
  if (/garamond/i.test(family)) return 'EBGaramond_500Medium';
  if (/baskerville/i.test(family)) return 'LibreBaskerville_400Regular';
  if (/lora/i.test(family)) return 'Lora_500Medium';
  if (/grotesk/i.test(family)) return 'SpaceGrotesk_500Medium';
  if (/georgia|times|serif/i.test(family) && !/sans/i.test(family)) return 'Lora_500Medium';
  return heading ? 'Inter_600SemiBold' : 'Inter_400Regular';
}
export function websiteAppearance(brand: Brand): WebsiteAppearance | undefined {
  if (brand.presentation !== 'website') return;
  const variant = brand.websiteVariant ?? 'original';
  return brand.websiteStyles?.[variant] ?? brand.websiteDesign?.[variant];
}
/** Archive current styling before selecting another appearance; never copy business data. */
export function rememberPresentation(brand: Brand): Brand {
  const key = brand.presentation === 'website' ? `website:${brand.websiteVariant ?? 'original'}` : brand.layoutId ?? 'private-collection';
  return { ...brand, presentationStyles: { ...brand.presentationStyles, [key]: brand.theme } };
}
export function websiteCandidate(brand: Brand, variant: WebsiteVariant = 'original'): Brand {
  const remembered = rememberPresentation(brand);
  const appearance = brand.websiteStyles?.[variant] ?? brand.websiteDesign?.[variant];
  if (!appearance) return brand;
  const theme: ThemeConfig = { ...(remembered.presentationStyles?.[`website:${variant}`] ?? brand.theme),
    presentationVersion: 2, website: { ...appearance, font: websiteFont(appearance.headingFontFamily, true) } };
  return { ...remembered, presentation: 'website', websiteVariant: variant, themeChosen: true, theme };
}
/** Refresh only appearance. Personal edits, assets, identity and listing data stay intact. */
export function refreshWebsitePresentation(brand: Brand, design: WebsiteDesign): Brand {
  const next = { ...brand, previousWebsiteDesign: brand.websiteDesign, websiteDesign: design };
  return brand.presentation === 'website' ? websiteCandidate(next, brand.websiteVariant) : next;
}
export function restoreWebsiteOriginal(brand: Brand): Brand {
  if (!brand.websiteDesign) return brand;
  const next = { ...brand, websiteStyles: { ...brand.websiteStyles, original: brand.websiteDesign.original },
    presentationStyles: { ...brand.presentationStyles, 'website:original': undefined } };
  return websiteCandidate(next, 'original');
}
