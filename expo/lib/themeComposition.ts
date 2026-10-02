import type { ManagedListing } from '@/contexts/ListingsContext';
import type { ClientLayoutId } from '@/constants/clientLayouts';

export const LIVE_THEME_BACKGROUNDS: Record<ClientLayoutId,string> = {
  'eliza-editorial':'#081E1B', 'coastal-personal':'#EFF2EF', 'advisor-journal':'#111C22',
  'warm-concierge':'#13251F', 'private-collection':'#231420', 'modern-editorial':'#101B24', 'portrait-statement':'#142720',
};
export function liveThemeBackground(id?:ClientLayoutId) { return LIVE_THEME_BACKGROUNDS[id ?? 'private-collection']; }

/** Stable content analysis, after import normalization. No requests or writes on scroll. */
export function themeComposition(layout: ClientLayoutId | undefined, width: number, portraitRatio: number, listings: ManagedListing[]) {
  const items = listings.filter(item => !item.hidden && !item.sourceArchived);
  const wide = width >= 680;
  const journal = layout === 'advisor-journal';
  const portraitFirst = layout === 'warm-concierge' || layout === 'portrait-statement' || portraitRatio >= 1.15;
  const split = wide && portraitRatio < 1.15;
  const collection = layout === 'modern-editorial' ? 'spotlight' : journal ? 'journal' :
    layout === 'private-collection' ? 'gallery' : layout === 'portrait-statement' ? 'minimal' : 'collection';
  // Preserve source/editor order; never manufacture a featured endorsement.
  return { items, split, portraitFirst, collection, cardWidth: items.length === 1 ? Math.min(width - 40, 580) :
    Math.min(width - 64, collection === 'gallery' ? 300 : collection === 'minimal' ? 260 : 320) };
}
