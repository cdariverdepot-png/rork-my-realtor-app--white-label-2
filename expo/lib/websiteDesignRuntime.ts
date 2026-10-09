/** Website markup is data, never executable UI. Both variants use native components. */
export type WebsiteVariant = 'original' | 'optimized';
export type WebsitePalette = { accent: string; background: string; ink: string; panel: string; muted: string };
export type WebsiteAppearance = WebsitePalette & {
  fontFamily: string; headingFontFamily: string;
  layout: 'image-overlay' | 'image-first' | 'portrait-split' | 'text-first';
  spacing: number; radius: number; headingSize: number;
  motion: 'none' | 'fade' | 'rise';
};
export type WebsiteIntent = 'listings' | 'saved' | 'contact' | 'profile' | 'area' | 'services' | 'testimonials' | 'content';
export type WebsiteSection = {
  kind: 'about' | 'listings' | 'services' | 'testimonials' | 'contact' | 'content';
  title: string;
  body: string;
  imageUrl?: string;
  imageFit?: 'contain' | 'cover';
  imageRole?: ImageRole;
  imageWidth?: number;
  imageHeight?: number;
  /** What the heading is trying to do, independent of the source button label. */
  intent?: WebsiteIntent;
  /** native = existing app destination. unique = show this copy once. omit = no page. */
  destination?: 'native' | 'unique' | 'omit';
  native?: 'listings' | 'saved' | 'chat' | 'profile';
};
/** A source content image kept with the copy it accompanies on the submitted site. */
export type SupportingImage = { url: string; fit: 'contain' | 'cover'; role: ImageRole; width?: number; height?: number };
export type WebsiteDesign = {
  version: 1; sourceUrl: string; analyzedAt: number;
  /** Image the source places with the main heading/intro copy (never promoted to hero or portrait). */
  introImage?: SupportingImage;
  logoUrl?: string; heroImageUrl?: string; portraitImageUrl?: string; heroTitle: string; heroSubtitle: string;
  headerImageUrl?: string; backgroundImageUrl?: string;
  imagery?: { logo?: ImageDiagnostic; portrait?: ImageDiagnostic; hero?: ImageDiagnostic; images: ImageDiagnostic[] };
  sections: WebsiteSection[];
  original: WebsiteAppearance; optimized: WebsiteAppearance;
  evidence: { stylesheets: string[]; colors: string[]; fonts: string[]; warnings: string[]; routing?: WebsiteRoute[] };
};

export type WebsiteRoute = {
  /** The label or heading that was classified. */
  source: string;
  intent: string;
  /** listings, profile, chat, saved, card:<intent>, or omit. */
  canonical: string;
  render: 'card' | 'native' | 'omit';
};

const entities = (s: string) => s.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
  .replace(/&ldquo;|&rdquo;/gi, '"').replace(/&lsquo;|&rsquo;/gi, "'").replace(/&hellip;/gi, '\u2026').replace(/&mdash;/gi, '\u2014').replace(/&ndash;/gi, '\u2013')
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16))))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
  .replace(/[\uE000-\uF8FF]/g, '').replace(/&middot;/gi, '·').replace(/&copy;/gi, '©');
const text = (s: string) => entities(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag: string, name: string) => entities(tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2] ?? '');
export function websiteAsset(raw: string, base: string): string | undefined {
  if (!raw.trim()) return;
  try {
    const u = new URL(entities(raw), base), h = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') ||
      /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(h) || h.includes(':') || /\.(local|internal)$/.test(h)) return;
    return u.toString();
  } catch { return; }
}

/** Decide whether a discovered heading is a native app feature, unique copy, or noise. */
const GENERIC_LABEL = /^(?:explore more|learn more|read more|click here|view more|see more|find out more|discover more|get started|more information|more info|get more information|read the full story)$/i;
const ALWAYS_CHROME = /cookie|privacy|subscribe|sidebar|skip to|footer|facebook feed|social feed|comments|sitemap|site map|accessibility|captcha|password|share this|hold on|equal housing|disclaimer|terms of use|refine results|get alerts|calculat|mortgage|sign in|log in|login|wp-admin|widget|copyright|account verification|verify your email|reset password|change password|forgot password/i;
const LISTING_LABEL = /listing|propert(?:y|ies)|featured home|homes for sale|property search|search homes|\bidx\b|our listings|for sale|more listings|view listings|view homes|search properties/i;
const CONTACT_LABEL = /located at|our office|visit us|office hours|stay in touch|follow us|connect with us|social media|we are located|here to help|get in touch|have a question|contact form|contact us|call us|email us|text us|reach us|free market report/i;
const CHAT_LABEL = /chat with|message your|start a conversation|send (?:a |us )?message|text with/i;
const AREA_LABEL = /about the area|our area|\bthe area\b|neighborhoods?|\bcommunity\b|communities|local guide|living in|things to do|explore (?:the )?(?:area|valley|city|town)|featured areas|top areas|counties/i;

export function isGenericWebsiteLabel(label: string): boolean {
  return GENERIC_LABEL.test(label.replace(/\s+/g, ' ').trim());
}
function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}
/** A run of menu labels is not an article, even when it is long enough to look like a paragraph. */
function navigationResidue(copy: string): boolean {
  if (/[.!?]/.test(copy) && /\b(?:is|are|was|were|has|have|offers|offer|lives|lived|served|known|specializ\w*|looking|works|working|provides|provide|includes|include|features|home to)\b/i.test(copy)) return false;
  const words = copy.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  const hits = words.filter(word => /^(?:home|featured|listings?|property|properties|search|about|area|contact|menu|blog|login|services?|buy|sell|the|us|our|more|view|testimonials?|communities|neighborhoods?)$/i.test(word.replace(/[^A-Za-z]/g, ''))).length;
  return hits / words.length >= 0.55;
}
/** "Coeur d'Alene, Post Falls, Hayden" is a city index, not area writing. */
function cityListOnly(copy: string): boolean {
  const commas = (copy.match(/,/g) ?? []).length;
  if (commas < 3) return false;
  const verbs = copy.match(/\b(?:is|are|was|were|has|have|offers|includes|features|known|located|living|historic|trails?|schools?|market|buyers|sellers|community life|neighborhood)\b/gi);
  return !verbs || verbs.length < 2;
}
function meaningfulProse(copy: string): boolean {
  const clean = copy.replace(/\s+/g, ' ').trim();
  if (wordCount(clean) < 12 || !/[.!?]/.test(clean)) return false;
  if (navigationResidue(clean) || cityListOnly(clean)) return false;
  return true;
}
function contactShaped(copy: string): boolean {
  return /(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})|@|\b(?:tel|mailto):/i.test(copy) && wordCount(copy) < 40;
}
/** A lead form or valuation wizard is not an article, even when the steps are long. */
function formWidget(copy: string): boolean {
  if (!/(?:valid address is required|enter (?:your |a |the )?(?:property )?address|please enter valid address|property valuation|powered by lofty)/i.test(copy)) return false;
  return !/\b(?:advise|advises|guide|guides|prepare|prepares|negotiat\w*|throughout closing)\b/i.test(copy);
}
function proseWithoutContact(copy: string): string {
  return copy.split(/(?<=[.!?])\s+/).filter(sentence => !/(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})|@/.test(sentence)).join(' ').trim();
}
function reviewShaped(copy: string): boolean {
  return /["“”]|★|stars?|recommend|testimonial|\d(?:\.\d)?\s*\/\s*5|zillow/i.test(copy)
    || /\b(?:clients?|buyers?|sellers?)\b/i.test(copy) && /\b(?:said|says|told|love|loved|helped|recommend|experience|closing|smooth|priority)\b/i.test(copy);
}
function platformBoilerplate(copy: string): boolean {
  return /no code necessary|free trial|placester|newbury design|website you(?:'|’)ll love creating|get started with the/i.test(copy);
}
/** A bot wall is not a website. Challenge copy must never become cards or a hero. */
export function blockedWebsiteDocument(html: string): boolean {
  const title = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  if (/^(?:attention required|just a moment|robot validate|client challenge)\b/i.test(title)) return true;
  const head = html.slice(0, 12000);
  if (/you have been blocked|sorry, you have been blocked/i.test(head) && /cloudflare|cf-wrapper|cf-error|attention required/i.test(head)) return true;
  if (/<form\b[^>]*id=["'](?:challenge-form|cf-challenge)/i.test(head)) return true;
  return false;
}

/** Browser fallback is for a block interstitial or a client shell that has no prose yet. */
export function websiteNeedsBrowser(html: string, design: Pick<WebsiteDesign, 'heroTitle' | 'sections'>): 'access-interstitial' | 'client-shell-without-prose' | null {
  if (blockedWebsiteDocument(html)) return 'access-interstitial';
  if (design.sections.some(section => section.destination === 'unique')) return null;
  const chime = /static\.chimeroi\.com|cdn\.chime\.me|sitePageJSON|pageJsonAndGlobalData/i.test(html);
  const emptyRoot = /<(?:div|main)\b[^>]*\bid=["'](?:root|app|__next)["'][^>]*>\s*<\/(?:div|main)>/i.test(html) && /<script\b[^>]*\bsrc\s*=/i.test(html);
  if (chime || emptyRoot) return 'client-shell-without-prose';
  if (design.heroTitle.trim()) return null;
  return null;
}
function listingShaped(copy: string): boolean {
  return /(?:\$\s?\d|\bmls\b|\bbeds?\b|\bbaths?\b|sq\.?\s*ft)/i.test(copy) && /listing|home|propert|\$\s?\d/i.test(copy) && !meaningfulProse(copy);
}
export function websiteRoute(source: string, decision: Pick<WebsiteSection, 'intent' | 'destination' | 'native'>): WebsiteRoute {
  const render = decision.destination === 'unique' ? 'card' : decision.destination === 'native' ? 'native' : 'omit';
  const canonical = decision.destination === 'native' && decision.native ? decision.native
    : decision.destination === 'unique' ? `card:${decision.intent}` : 'omit';
  return { source, intent: decision.intent ?? 'content', canonical, render };
}
export function readableSectionTitle(title: string, body: string): string {
  const heading = title.replace(/\s+/g, ' ').trim();
  if (!isGenericWebsiteLabel(heading) && !/^(?:home|blog|our blog)$/i.test(heading) && !/^write (?:a |us )?recommendation\b|^leave a review\b|^submit a review\b/i.test(heading)) return heading;
  const sentence = body.split(/(?<=[.!?])\s+/).find(part => wordCount(part) >= 6 && !isGenericWebsiteLabel(part.replace(/[.!?]+$/, '')));
  return sentence ? sentence.replace(/[.!?]+$/, '').slice(0, 90) : heading;
}

export function classifyWebsiteSection(title: string, body = ''): Pick<WebsiteSection, 'kind' | 'intent' | 'destination' | 'native'> {
  const heading = title.replace(/\s+/g, ' ').trim();
  const copy = body.replace(/\s+/g, ' ').trim();
  const native = (kind: WebsiteSection['kind'], intent: WebsiteIntent, target: NonNullable<WebsiteSection['native']>) =>
    ({ kind, intent, destination: 'native' as const, native: target });
  const unique = (kind: WebsiteSection['kind'], intent: WebsiteIntent) =>
    ({ kind, intent, destination: 'unique' as const });
  const omit = (kind: WebsiteSection['kind'] = 'content', intent: WebsiteIntent = 'content') =>
    ({ kind, intent, destination: 'omit' as const });
  const meaningful = meaningfulProse(copy);
  if (!heading || ALWAYS_CHROME.test(heading)) return omit();
  if (formWidget(copy)) return omit('services', 'services');
  if (listingShaped(copy)) return native('listings', 'listings', 'listings');
  if (/^(?:home|search|menu|blog|our blog|sign in|sign up|log in|login|admin|get alerts!?|refine results|privacy(?: policy)?|sitemap|sidebar|facebook|instagram|linkedin|youtube|pinterest|tiktok)(?:\s*[:|–—-].*)?$/i.test(heading)) return omit();
  if (isGenericWebsiteLabel(heading)) {
    if (listingShaped(copy)) return native('listings', 'listings', 'listings');
    if (contactShaped(copy) || (/\b(?:call|email|e-mail|phone|office|address)\b/i.test(copy) && !meaningful)) return native('contact', 'contact', 'profile');
    if (CHAT_LABEL.test(copy) && !meaningful) return native('contact', 'contact', 'chat');
    if (!meaningful) return omit();
    if (AREA_LABEL.test(copy)) return unique('content', 'area');
    if (/^about\b|about us|about me|\bmeet\b|our team|biography/i.test(copy)) return unique('about', 'profile');
    if (/testimonial|reviews?|what (?:our )?clients/i.test(copy)) return unique('testimonials', 'testimonials');
    if (/service|relocat|buying|selling|looking to (?:buy|sell)/i.test(copy) && copy.length >= 80) return unique('services', 'services');
    return copy.length >= 80 ? unique('content', 'content') : omit();
  }
  if (/favorit|saved (?:home|propert|search)|watch\s*list/i.test(heading)) return native('content', 'saved', 'saved');
  if (LISTING_LABEL.test(heading) || listingShaped(copy) && LISTING_LABEL.test(heading)) return native('listings', 'listings', 'listings');
  if (AREA_LABEL.test(heading)) return meaningful ? unique('content', 'area') : omit('content', 'area');
  if (/^about\b|about us|about me|\bmeet\b|our team|our associates|our agents|my story|biography|who we are|the team|your guide/i.test(heading)) {
    return meaningful && meaningfulProse(proseWithoutContact(copy)) ? unique('about', 'profile') : native('about', 'profile', 'profile');
  }
  if (/testimonial|reviews?|clients?(?:'|’) ?love|what (?:our )?clients/i.test(heading)) {
    return meaningful && reviewShaped(copy) ? unique('testimonials', 'testimonials') : omit('testimonials', 'testimonials');
  }
  // Ordinary contact data is the profile. A message CTA uses the one native chat. Neither is a new page.
  if (CHAT_LABEL.test(heading) || (/^(?:ask)\b|ask (?:us|me)\b/i.test(heading) && !/question/i.test(heading))) return native('contact', 'contact', 'chat');
  if (CONTACT_LABEL.test(heading) || /contact|get in touch|call us|email us|text us|reach us/i.test(heading)) return native('contact', 'contact', 'profile');
  if (/phone|e-?mail|address|office/i.test(heading) && copy.length < 220 && !/about|area|neighborhood/i.test(heading)) return native('contact', 'contact', 'profile');
  if (/calculat|mortgage|affordability|closing costs|sign in|register/i.test(heading)) return omit('services', 'services');
  if (/^(?:buy|sell|buying|selling|services?|relocation)\b|looking to (?:buy|sell)|sell with us/i.test(heading) || /service|relocat|home worth|valuation|buyer resource|seller resource/i.test(heading)) {
    return meaningful && copy.length >= 80 ? unique('services', 'services') : omit('services', 'services');
  }
  if (navigationResidue(copy) && !meaningful) return omit();
  return meaningful && copy.length >= 80 ? unique('content', 'content') : omit();
}

/** One native destination per intent. Unique copy is kept once, and repeated articles collapse. */
function sectionRank(section: WebsiteSection): number {
  let score = section.intent === 'profile' || section.intent === 'area' || section.intent === 'services' || section.intent === 'testimonials' ? 2 : 0;
  if (/about|meet the|meet |our team|our associates|featured areas|communities|counties|clients/i.test(section.title)) score += 3;
  if (section.title.length > 90 || /^["“]/.test(section.title)) score -= 3;
  return score;
}
function bodiesOverlap(a: string, b: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const left = norm(a), right = norm(b);
  if (left.length < 80 || right.length < 80) return false;
  return left.includes(right.slice(0, 110)) || right.includes(left.slice(0, 110));
}
export function presentWebsiteSection(section: WebsiteSection): WebsiteSection | null {
  const title = readableSectionTitle(section.title, section.body);
  const decision = classifyWebsiteSection(title, section.body);
  const specific = section.intent === 'area' || section.intent === 'profile' || section.intent === 'services' || section.intent === 'testimonials';
  const keep = specific && decision.intent === 'content' && decision.destination === 'unique' && meaningfulProse(section.body) && !formWidget(section.body);
  const next: WebsiteSection = keep
    ? { ...section, ...decision, title, body: websiteCopy(section.body), intent: section.intent, destination: 'unique', kind: section.kind }
    : { ...section, ...decision, title, body: websiteCopy(section.body) };
  if (next.destination === 'omit' || isGenericWebsiteLabel(title)) return null;
  return next;
}
export function composeWebsiteSections(sections: WebsiteSection[]): WebsiteSection[] {
  const seen = new Set<string>();
  let services = 0, areas = 0, profiles = 0, quotes = 0;
  const composed: { section: WebsiteSection; index: number }[] = [];
  const articles: { section: WebsiteSection; index: number }[] = [];
  sections.forEach((section, index) => {
    const next = presentWebsiteSection(section);
    if (!next) return;
    if (next.destination === 'unique') {
      const pool = [...composed, ...articles];
      const overlap = pool.findIndex(existing => existing.section.destination === 'unique' && bodiesOverlap(existing.section.body, next.body));
      if (overlap >= 0) {
        if (sectionRank(next) > sectionRank(pool[overlap].section)) pool[overlap].section = next;
        return;
      }
    }
    if (next.destination === 'unique' && next.intent === 'content') {
      const fingerprint = next.body.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 180);
      const key = `unique:content:${fingerprint && wordCount(fingerprint) >= 8 ? fingerprint : next.title.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      articles.push({ section: next, index });
      return;
    }
    if (next.destination === 'unique' && next.intent === 'services' && ++services > 2) return;
    if (next.destination === 'unique' && next.intent === 'area' && ++areas > 2) return;
    if (next.destination === 'unique' && next.intent === 'profile' && ++profiles > 1) return;
    if (next.destination === 'unique' && next.intent === 'testimonials' && ++quotes > 1) return;
    const fingerprint = next.body.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 180);
    const key = next.destination === 'unique'
      ? `unique:${next.intent}:${fingerprint && wordCount(fingerprint) >= 8 ? fingerprint : next.title.toLowerCase()}`
      : `native:${next.intent}`;
    if (seen.has(key)) return;
    seen.add(key);
    composed.push({ section: next, index });
  });
  // Discovery can see every article. Display keeps the strongest few, preferring earlier copy when quality is close.
  const displayed = articles
    .map(item => ({ ...item, score: wordCount(item.section.body) + (meaningfulProse(item.section.body) ? 40 : 0) - item.index * 8 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index);
  return [...composed, ...displayed].sort((a, b) => a.index - b.index).map(item => item.section);
}

/**
 * Text a page carries that is not the section's copy: CMS shortcodes ([our-stories-count type="active"]),
 * stray comment markers, form residue ("j6ac7108ab9bd1 Submit") and the site footer from its copyright
 * line onward ("© Copyright 2026 … All Rights Reserved … Website Design by …").
 */
const FORM_FIELD = "(?:(?:first|last|full)\\s+name|name|e-?mail(?:\\s+address)?|phone(?:\\s+number)?|message|comments?|subject)";
export function withoutSiteChrome(body: string): string {
  return body
    .replace(/\[\/?[a-z][a-z0-9]*[-_][\w-]*(?:\s+[^\]]*)?\]|\[\/?[a-z][\w-]*(?:\s+[a-z_-]+=(?:"[^"]*"|'[^']*'|[^\s\]]+))+\s*\/?\]/gi, ' ')
    .replace(/<!--|-->/g, ' ')
    .replace(/\s+(?:©|\(c\)|copyright\b)[\s\S]*$/i, '')
    .replace(/\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{10,}\s+submit\b/gi, ' ')
    .replace(/\b(?:scroll up|back to top)\b/gi, ' ')
    // A contact form's field labels in a row ("First Name Last Name Email Message SEND Thank you for submitting!").
    .replace(new RegExp(`\\b${FORM_FIELD}(?:\\s+${FORM_FIELD}){2,}(?:\\s+(?:send|submit))?(?:\\s+thank you for (?:submitting|your (?:message|submission))!?)?`, 'gi'), ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Display copy for a mobile card: the site's sentences, without contact lines or a trailing generic CTA. */
export function websiteCopy(body: string): string {
  const clean = withoutSiteChrome(body.replace(/\s+/g, ' ').trim());
  const cut = clean.replace(/\s*\b(?:explore more|learn more|read more|view more|see more|click here|more information|chat with [a-z]+|message your realtor|start a conversation|stay in touch|follow us)\b[\s\S]*$/i, '').trim();
  const contactLine = (sentence: string) => /(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})|@|\b(?:office|cell|fax|phone|email)\s*:|\b\d{1,6}\s+[A-Za-z][\w.'’-]*(?:\s+[A-Za-z][\w.'’-]*){0,3}\s+(?:avenue|ave|street|st|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct)\b/i.test(sentence);
  const sentences = (cut || clean).split(/(?<=[.!?])\s+/).filter(sentence => !contactLine(sentence));
  const prose = sentences.join(' ').trim();
  const kept = prose.split(/\s+/).filter(Boolean).length >= 12 ? prose : (cut || clean);
  if (kept.length <= 520) return kept;
  const sentence = kept.slice(0, 520).replace(/\s+\S*$/, '');
  return /[.!?]/.test(sentence) ? sentence.replace(/[^.!?]*$/, '').trim() || kept.slice(0, 480) : kept.slice(0, 480);
}

/** A button or nav label, classified before it can become a page. Generic labels never win a title. */
const LISTING_PATH = /propert(?:y|ies)|listings?|\/search\b|homes-for-sale|featured-listings|featured-homes|\/idx\b|our-listings|inventory/;
const CONTACT_PATH = /contact|get-in-touch|our-office|\/office\b/;
const CHAT_PATH = /\/chat\b|conversation|message-us/;
const TOOL_PATH = /calculat|mortgage|affordab|alert|refine|wp-login|\/login|sign-?in|\/admin|privacy|sitemap|disclaimer|register|my-account/;
export function classifyWebsiteAction(label: string, href = ''): Pick<WebsiteSection, 'kind' | 'intent' | 'destination' | 'native'> {
  const heading = label.replace(/\s+/g, ' ').trim();
  const path = href.toLowerCase();
  const native = (kind: WebsiteSection['kind'], intent: WebsiteIntent, target: NonNullable<WebsiteSection['native']>) =>
    ({ kind, intent, destination: 'native' as const, native: target });
  const omit = (kind: WebsiteSection['kind'] = 'content', intent: WebsiteIntent = 'content') =>
    ({ kind, intent, destination: 'omit' as const });
  if (/^(?:mailto|tel):/.test(path)) return native('contact', 'contact', 'profile');
  if (/facebook\.|instagram\.|twitter\.|linkedin\.|youtube\.|pinterest\.|tiktok\.|(?:^|\.)x\.com/.test(path)) return omit('contact', 'contact');
  if (TOOL_PATH.test(path) && !LISTING_PATH.test(path)) return omit();
  if (isGenericWebsiteLabel(heading) || /^(?:home|menu|search|blog)$/i.test(heading)) {
    if (LISTING_PATH.test(path)) return native('listings', 'listings', 'listings');
    if (CONTACT_PATH.test(path) || /^(?:mailto|tel):/.test(path)) return native('contact', 'contact', 'profile');
    if (CHAT_PATH.test(path) || CHAT_LABEL.test(heading)) return native('contact', 'contact', 'chat');
    return omit();
  }
  if (LISTING_PATH.test(path) && !AREA_LABEL.test(heading) && !/^about\b/i.test(heading)) return native('listings', 'listings', 'listings');
  if ((CONTACT_PATH.test(path) || CHAT_LABEL.test(heading)) && CHAT_LABEL.test(heading)) return native('contact', 'contact', 'chat');
  if (CONTACT_PATH.test(path) && !AREA_LABEL.test(heading) && !/^about\b|about us|our team|\bmeet\b/i.test(heading)) return native('contact', 'contact', 'profile');
  return classifyWebsiteSection(heading, '');
}

/** Same-site pages that contain unique copy. Listings, contact, chat, and tools stay native and are not fetched. */
export type WebsiteContentIntent = 'area' | 'profile' | 'services' | 'testimonials' | 'content';
export function websiteContentLinks(html: string, base: string): { url: string; title: string; intent: WebsiteContentIntent }[] {
  const found: { url: string; title: string; intent: WebsiteContentIntent }[] = [];
  const counts: Record<WebsiteContentIntent, number> = { area: 0, profile: 0, services: 0, testimonials: 0, content: 0 };
  const caps: Record<WebsiteContentIntent, number> = { area: 2, profile: 1, services: 3, testimonials: 1, content: 8 };
  const intentOf = (title: string, href: string): WebsiteContentIntent | null => {
    const generic = isGenericWebsiteLabel(title);
    const path = href.toLowerCase();
    const blob = `${title} ${path}`;
    if (/^(?:mailto|tel|javascript|data):/.test(path) || TOOL_PATH.test(path)) return null;
    if (/facebook\.|instagram\.|twitter\.|linkedin\.|youtube\.|pinterest\.|tiktok\.|(?:^|\.)x\.com/.test(path)) return null;
    if (/about-the-area|\/the-area\b|\/our-area|\/communities\b|\/neighborhoods?\b|top-areas|featured-areas|\/county|counties/.test(blob)
      || (!generic && AREA_LABEL.test(title))) return 'area';
    if (LISTING_PATH.test(path) || (!generic && LISTING_LABEL.test(title))) return null;
    if (CONTACT_PATH.test(path) || CHAT_LABEL.test(title) || (!generic && CONTACT_LABEL.test(title))) return null;
    if (/\/about\b|about-us|about-me|our-team|our-story|meet-the|meet-our|our-agents|\/agents\b/.test(blob)
      || (!generic && /^about\b|about us|about me|our team|\bmeet\b/i.test(title) && !/\b(?:area|listing|home)s?\b/i.test(title))) return 'profile';
    if (/testimonial|\/reviews?\b|client-stories/.test(blob) && !generic) return 'testimonials';
    if (/\/services?\b|\/buying\b|\/selling\b|(?:^|\/)buy(?:\/|$)|(?:^|\/)sell(?:\/|$)|relocation/.test(path)
      || (!generic && /^(?:buy|sell|buying|selling|services?)\b/i.test(title))) return 'services';
    if (/\/blog\/[^/?#]+|\/news\/[^/?#]+|\/articles?\/[^/?#]+|\/community\/[^/?#]+/.test(path)) return 'content';
    if (/\/(?:19|20)\d{2}\/\d{2}\/\d{2}\/[^/?#]+/.test(path) && !generic) return 'content';
    return null;
  };
  const contentTitle = (title: string, intent: WebsiteContentIntent, href: string) => {
    if (title && !isGenericWebsiteLabel(title)) return title.slice(0, 80);
    if (intent === 'area') return 'About the area';
    if (intent === 'profile') return 'About';
    if (intent === 'testimonials') return 'Testimonials';
    if (intent === 'services') return /sell/i.test(href) ? 'Selling' : /buy/i.test(href) ? 'Buying' : 'Services';
    const slug = href.split('?')[0].split('/').filter(Boolean).pop() || 'From the site';
    return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()).slice(0, 80);
  };
  for (const tag of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []) {
    const title = text(tag);
    const href = attr(tag, 'href');
    const intent = intentOf(title, href);
    if (!intent) continue;
    const url = websiteAsset(href, base);
    if (!url) continue;
    let target: URL, origin: URL;
    try { target = new URL(url); origin = new URL(base); } catch { continue; }
    if (target.hostname !== origin.hostname || target.pathname === origin.pathname) continue;
    if (found.some(item => item.url === url) || counts[intent] >= caps[intent]) continue;
    counts[intent] += 1;
    found.push({ url, title: contentTitle(title, intent, href), intent });
    if (found.length >= 12) break;
  }
  return found;
}

/** Drop navigation chrome so a menu heading cannot swallow the article beneath it. */
function withoutNavigation(html: string): string {
  let out = '';
  const stack: { tag: string; drop: boolean }[] = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g;
  let last = 0, dropping = 0;
  for (const match of html.matchAll(re)) {
    const index = match.index ?? 0;
    if (dropping === 0) out += html.slice(last, index);
    const before = dropping;
    if (!match[0].startsWith('<!--')) {
      const tag = (match[1] || '').toLowerCase();
      const closing = match[0].startsWith('</');
      const self = /\/>$/.test(match[0]) || /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag);
      if (!closing && !self) {
        const classId = `${attr(match[0], 'class')} ${attr(match[0], 'id')} ${attr(match[0], 'role')}`;
        const drop = tag === 'nav' || /^(?:navigation|menu)$/i.test(attr(match[0], 'role')) || /\b(?:nav-primary|nav-menu|mobile-menu|menu-main)\b/i.test(classId);
        stack.push({ tag, drop });
        if (drop) dropping += 1;
      } else if (closing) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag !== tag) continue;
          if (stack[i].drop) dropping = Math.max(0, dropping - 1);
          stack.splice(i, 1);
          break;
        }
      }
    }
    if (before === 0 && dropping === 0) out += match[0];
    last = index + match[0].length;
  }
  if (dropping === 0) out += html.slice(last);
  return out;
}

export function websiteStylesheetUrls(html: string, base: string): string[] {
  const urls = [...new Set((html.match(/<link\b[^>]*>/gi) ?? []).filter(t => /stylesheet/i.test(attr(t, 'rel')))
    .map(t => websiteAsset(attr(t, 'href'), base)).filter((u): u is string => !!u))];
  const chosen = new Set([...urls].sort((a, b) => stylesheetPriority(b) - stylesheetPriority(a)).slice(0, 6));
  // Prioritize downloads without changing the observed CSS cascade order.
  return urls.filter(url => chosen.has(url));
}
function stylesheetPriority(url: string) {
  let score = 0;
  if (/\/themes\//i.test(url)) score += 12;
  if (/custom|site[-_.]|main[-_.]|global|elementor\/css\/post/i.test(url)) score += 8;
  if (/\/plugins\//i.test(url)) score -= 5;
  if (/wp-includes|bootstrap|dashicon|font.?awesome|jetpack|idx|ihf|dsidx|google|icon/i.test(url)) score -= 10;
  return score;
}
export function normalizeWebsiteColor(raw: string): string | undefined {
  const s = raw.trim().toLowerCase();
  if (/^#[\da-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map(c => c + c).join('');
  if (/^#[\da-f]{6}$/.test(s)) return s;
  const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  if (m && (m[4] === undefined || Number(m[4]) >= 0.8)) return '#' + m.slice(1, 4).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  return ({ white: '#ffffff', black: '#000000', navy: '#000080', ivory: '#fffff0' } as Record<string, string>)[s];
}
export function websiteLuminance(color: string): number {
  const rgb = normalizeWebsiteColor(color) ?? '#ffffff';
  const c = [1, 3, 5].map(i => parseInt(rgb.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
export function readableWebsiteInk(background: string, preferred?: string): string {
  const l = websiteLuminance(background), p = preferred ? websiteLuminance(preferred) : undefined;
  if (p !== undefined && (Math.max(l, p) + .05) / (Math.min(l, p) + .05) >= 4.5) return preferred!;
  return l > .179 ? '#15191d' : '#ffffff';
}

/** Brand red used as the page wash is a button color, not the reading surface. */
export function presentWebsiteSurface(background: string, accent: string, ink?: string): { background: string; accent: string; ink: string; panel: string } {
  const bg = normalizeWebsiteColor(background) ?? '#f6f3ee';
  const ac = normalizeWebsiteColor(accent) ?? '#34566a';
  const delta = (color: string) => {
    const n = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    return Math.max(...n) - Math.min(...n);
  };
  const dist = (a: string, b: string) => [1, 3, 5].reduce((sum, i) => sum + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0);
  let canvas = bg;
  if (delta(ac) > 18 && dist(bg, ac) < 72) canvas = websiteLuminance(ac) > 0.5 ? '#16191c' : '#f6f3ee';
  // A saturated brand wash is an accent, not the reading surface, even when the accent itself differs.
  if (canvas === bg && delta(bg) > 36 && websiteLuminance(bg) > 0.05 && websiteLuminance(bg) < 0.72) {
    canvas = websiteLuminance(bg) > 0.45 ? '#16191c' : '#f6f3ee';
  }
  const reading = readableWebsiteInk(canvas, ink);
  return { background: canvas, accent: ac, ink: reading, panel: websiteLuminance(canvas) > 0.9 ? '#fffdf9' : canvas };
}

/** A bounded CSS approximation, retaining its evidence and explicit rendering limitations. */
/**
 * sectionsOnly: the caller needs only the page's heading and sections (a linked page, or a first look
 * that decides whether a browser is needed). The style cascade and image analysis, by far the most
 * expensive work, are not computed for it; heroTitle and sections are exactly what the full pass returns.
 */
export function extractWebsiteDesign(html: string, sourceUrl: string, stylesheets: { url: string; css: string }[] = [], options?: { sectionsOnly?: boolean }): WebsiteDesign {
  const sectionsOnly = options?.sectionsOnly === true;
  if (blockedWebsiteDocument(html)) {
    const neutral: WebsiteAppearance = { accent: '#34566a', background: '#ffffff', ink: '#1c1c1c', panel: '#fffdf9', muted: '#1c1c1c', fontFamily: 'Inter', headingFontFamily: 'Inter', layout: 'text-first', spacing: 24, radius: 0, headingSize: 38, motion: 'none' };
    return { version: 1, sourceUrl, analyzedAt: Date.now(), heroTitle: '', heroSubtitle: '', sections: [],
      original: neutral, optimized: { ...neutral, radius: 12, headingSize: 36, layout: 'portrait-split', motion: 'rise' },
      evidence: { stylesheets: [], colors: [], fonts: [], routing: [], warnings: ['Access to this page was blocked. No site content was imported from the block page.'] } };
  }
  const css = sectionsOnly ? '' : (stylesheets.map(s => s.css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (all, quote, url) => {
    const absolute = websiteAsset(url, s.url); return absolute ? `url("${absolute}")` : all;
  })).join('\n') + '\n' + [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n')).replace(/\/\*[\s\S]*?\*\//g, '');
  // Match selectors against actual markup, so unused Bootstrap/IDX/plugin styles
  // cannot masquerade as the site's branding. Supports the common static cascade.
  type Node = { tag: string; markup: string; classes: string[]; id: string; parent?: Node };
  const nodes: Node[] = [], stack: Node[] = [];
  const cleanMarkup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const match of sectionsOnly ? [] : cleanMarkup.matchAll(/<(\/)?([a-z][\w-]*)\b[^>]*>/gi)) {
    const tag = match[2].toLowerCase();
    if (match[1]) { const index = stack.map(n => n.tag).lastIndexOf(tag); if (index >= 0) stack.splice(index); continue; }
    const node: Node = { tag, markup: match[0], classes: attr(match[0], 'class').split(/\s+/), id: attr(match[0], 'id'), parent: stack.at(-1) };
    if (nodes.length < 6000) nodes.push(node);
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !/\/>$/.test(match[0])) stack.push(node);
  }
  // Each selector is parsed once, not once per node and rule visit: large stylesheets times thousands
  // of nodes made re-parsing the dominant cost of a whole import. Matching semantics are unchanged.
  type Compound = { unsupported: boolean; tag?: string; ids: string[]; classes: string[] };
  const compoundCache = new Map<string, Compound>();
  const compound = (part: string): Compound => {
    let parsed = compoundCache.get(part);
    if (!parsed) {
      const unsupported = /:hover|:focus|:disabled|:before|:after|:not\(|:has\(|\[|@/.test(part);
      const bare = unsupported ? '' : part.replace(/:[\w-]+(?:\([^)]*\))?/g, '');
      const tag = bare.match(/^[\w-]+/)?.[0]?.toLowerCase();
      const ids: string[] = [], classes: string[] = [];
      for (const m of bare.matchAll(/([.#])([\w-]+)/g)) (m[1] === '#' ? ids : classes).push(m[2]);
      parsed = { unsupported, tag, ids, classes };
      compoundCache.set(part, parsed);
    }
    return parsed;
  };
  const simple = (node: Node, part: string | Compound) => {
    const c = typeof part === 'string' ? compound(part) : part;
    if (c.unsupported) return false;
    if (c.tag && node.tag !== c.tag) return false;
    for (const id of c.ids) if (node.id !== id) return false;
    for (const name of c.classes) if (!node.classes.includes(name)) return false;
    return true;
  };
  // A selector compiles to its compounds, right to left; '>' stays a child combinator.
  const compiledSelectors = new Map<string, (Compound | '>')[]>();
  const compiled = (selector: string) => {
    let parts = compiledSelectors.get(selector);
    if (!parts) {
      parts = selector.trim().split(/\s+/).map(part => part === '>' ? '>' as const : compound(part)).reverse();
      compiledSelectors.set(selector, parts);
    }
    return parts;
  };
  const star = compound('*');
  const matches = (node: Node, selector: string) => {
    const parts = compiled(selector);
    let i = 0;
    const next = () => (i < parts.length ? parts[i++] : undefined);
    let current: Node | undefined = node;
    const last = next();
    if (!simple(node, last === undefined || last === '>' ? (last === '>' ? compound('>') : star) : last)) return false;
    while (i < parts.length) {
      const part = next()!;
      if (part === '>') {
        current = current?.parent;
        const target = next();
        if (!current || !simple(current, target === undefined ? star : target === '>' ? compound('>') : target)) return false;
      } else { current = current?.parent; while (current && !simple(current, part)) current = current.parent; if (!current) return false; }
    }
    return true;
  };
  // Candidate elements for a selector come from its rightmost compound (id, class or tag index).
  const byId = new Map<string, Node[]>(), byClass = new Map<string, Node[]>(), byTag = new Map<string, Node[]>();
  const index = (map: Map<string, Node[]>, key: string, node: Node) => { if (!key) return; const list = map.get(key); if (list) list.push(node); else map.set(key, [node]); };
  for (const node of nodes) {
    index(byId, node.id, node);
    index(byTag, node.tag, node);
    for (const name of new Set(node.classes)) index(byClass, name, node);
  }
  // Whether any element on the page uses a selector does not change between properties.
  const usedSelectors = new Map<string, boolean>();
  const selectorUsed = (selector: string) => {
    let used = usedSelectors.get(selector);
    if (used === undefined) {
      const right = compiled(selector)[0];
      const candidates = right === undefined || right === '>' || right.unsupported ? nodes
        : right.ids.length ? byId.get(right.ids[0]) ?? []
        : right.classes.length ? byClass.get(right.classes[0]) ?? []
        : right.tag ? byTag.get(right.tag) ?? [] : nodes;
      used = candidates.some(n => matches(n, selector));
      usedSelectors.set(selector, used);
    }
    return used;
  };
  const variables = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) variables.set(m[1], m[2].trim());
  const resolve = (v: string): string => {
    for (let i = 0; i < 5 && /var\(/.test(v); i++) v = v.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (_, k, fallback) => variables.get(k) ?? fallback ?? '');
    return v.trim();
  };
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(m => m[1].split(',').map(selector => ({ selector: selector.trim(), body: m[2] }))).filter(r => !/::|@font-face|keyframes/.test(r.selector));
  const propertyPatterns = new Map<string, RegExp>();
  const propertyPattern = (property: string) => {
    let pattern = propertyPatterns.get(property);
    if (!pattern) { pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'); propertyPatterns.set(property, pattern); }
    return pattern;
  };
  const valueFrom = (body: string, property: string) => resolve(body.match(propertyPattern(property))?.[1]?.replace(/!important/g, '') ?? '');
  const computed = (node: Node, property: string, allow?: (value: string) => boolean) => {
    let value: string | undefined, score = -1;
    for (const rule of rules) {
      const candidate = valueFrom(rule.body, property);
      if (!candidate || allow && !allow(candidate) || !matches(node, rule.selector)) continue;
      const specificity = (rule.selector.match(/#/g)?.length ?? 0) * 100 + (rule.selector.match(/\./g)?.length ?? 0) * 10 + (rule.selector.match(/(?:^|\s)[a-z]/g)?.length ?? 0);
      if (specificity >= score) { value = candidate; score = specificity; }
    }
    const inline = valueFrom(attr(node.markup, 'style'), property);
    return inline && (!allow || allow(inline)) ? inline : value;
  };
  const pick = (property: string, relevance: RegExp, allow?: (v: string) => boolean): string | undefined => {
    let best: string | undefined, score = -1;
    for (const rule of rules) {
      if (!relevance.test(rule.selector) || /@font-face|keyframes|hover|focus|disabled|\.idx|\.ihf|\.dsidx/i.test(rule.selector) || !selectorUsed(rule.selector)) continue;
      const value = resolve(rule.body.match(propertyPattern(property))?.[1]?.replace(/!important/g, '') ?? '');
      if (!value || (allow && !allow(value))) continue;
      const weight = (/hero|banner|masthead|site-header|primary|brand|h1|\.elementor-heading-title/i.test(rule.selector) ? 3 : 1) + (/^body$|^:root$/.test(rule.selector) ? 4 : 0);
      if (weight >= score) { best = value; score = weight; }
    }
    return best;
  };
  const color = (property: string, re: RegExp) => normalizeWebsiteColor(pick(property, re, v => !!normalizeWebsiteColor(v)) ?? '');
  const observedColors = [...new Set([...css.matchAll(/#[\da-f]{3,8}\b|rgba?\([^)]{3,70}\)/gi)].map(m => normalizeWebsiteColor(m[0])).filter((c): c is string => !!c))];
  const chromatic = (v: string) => { const c = normalizeWebsiteColor(v); if (!c) return false; const n = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); return Math.max(...n) - Math.min(...n) > 20; };
  const brandedVar = [...variables].find(([k, v]) => /(?:^--brand-|^--accent|^--primary-color|^--e-global-color-primary$)/i.test(k) && chromatic(resolve(v)));
  const accentNodes = nodes.filter(n => /button|btn|current-menu-item|primary|submit|nav-link|elementor-button/.test(n.classes.join(' ')) || n.tag === 'button').slice(0, 30);
  const liveAccent = accentNodes.map(n => normalizeWebsiteColor(computed(n, 'background(?:-color)?', chromatic) ?? '')).find(Boolean);
  const accent = (brandedVar && normalizeWebsiteColor(resolve(brandedVar[1]))) ?? liveAccent ?? normalizeWebsiteColor(pick('color', /current-menu|button|btn|heading|site-title|(?:^|\s)a(?:$|\s)/i, chromatic) ?? '') ?? observedColors.find(c => {
    const n = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); return Math.max(...n) - Math.min(...n) > 30;
  }) ?? '#34566a';
  const canvas = nodes.find(n => /^(site-inner|site-container|site-content|page-container)$/.test(n.classes.join(' '))) ?? nodes.find(n => n.tag === 'body');
  const background = (canvas && normalizeWebsiteColor(computed(canvas, 'background(?:-color)?', v => !!normalizeWebsiteColor(v)) ?? '')) ?? color('background(?:-color)?', /(?:^|[,\s])body\b|\.site\b|:root/i) ?? '#ffffff';
  const ink = readableWebsiteInk(background, color('color', /(?:^|[,\s])body\b|p\b|main\b/i));
  const fonts = [...new Set([...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map(m => resolve(m[1]).split(',')[0].replace(/["']/g, '').trim()).filter(f => f && !/inherit|initial|var\(/.test(f)))];
  const bodyNode = nodes.find(n => n.tag === 'body');
  const bodyFont = (bodyNode && computed(bodyNode, 'font-family'))?.split(',')[0].replace(/["']/g, '').trim() ?? pick('font-family', /body|:root|\.site\b|p\b/i)?.split(',')[0].replace(/["']/g, '').trim() ?? 'Inter';
  let headingFont = pick('font-family', /h[1-3]|heading|hero|banner/i)?.split(',')[0].replace(/["']/g, '').trim() ?? bodyFont;
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const headings = [...clean.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)];
  const mainHeading = headings.find(h => !/site-title|logo|screen-reader/i.test(h[1]) && text(h[2])) ?? headings[0];
  const h1 = text(mainHeading?.[2] ?? '');
  const headingInline = [mainHeading?.[1] ?? '', ...(mainHeading?.[2].match(/<[^>]+>/g) ?? [])]
    .map(tag => attr(' '+tag, 'style')).join(';');
  const inlineFont = headingInline.match(/font-family\s*:\s*([^;]+)/i)?.[1];
  if (inlineFont) headingFont = inlineFont.split(',')[0].replace(/["']/g, '').trim();
  const metaDescription = (html.match(/<meta\b[^>]*>/gi) ?? []).find(t => attr(t, 'name').toLowerCase() === 'description');
  const described = metaDescription ? attr(metaDescription, 'content').slice(0, 500) : '';
  const heroSubtitle = platformBoilerplate(described) ? '' : described;
  const media: PageImagery = sectionsOnly ? { all: [] } : assignPageImages(describePageImages(clean, css, raw => websiteAsset(raw, sourceUrl)));
  const logo = media.logo;
  const heroImageUrl = media.hero?.selectedUrl;
  const portraitImageUrl = media.portrait?.selectedUrl;
  const overlaySafe = !!media.hero && media.hero.fit === 'cover' && media.hero.crop !== 'rejected';
  const headerImageUrl = websiteAsset(pick('background(?:-image)?', /site-title|header-image|custom-logo/i)?.match(/url\(["']?([^)'"\s]+)["']?\)/)?.[1] ?? '', sourceUrl);
  const bodyBackground = websiteAsset((bodyNode && computed(bodyNode, 'background(?:-image)?'))?.match(/url\(["']?([^)'"\s]+)["']?\)/)?.[1] ?? '', sourceUrl);
  const contentHtml = withoutNavigation(clean);
  const sections: WebsiteSection[] = [];
  const routes: WebsiteRoute[] = [];
  const routeKeys = new Set<string>();
  let keptListingHeading = false;
  const sectionByRawTitle = new Map<string, WebsiteSection>();
  const remember = (route: WebsiteRoute) => {
    const key = route.render === 'card' ? `${route.canonical}:${route.source.toLowerCase()}` : route.render === 'native' ? route.canonical : `omit:${route.source.toLowerCase()}`;
    if (routeKeys.has(key)) return;
    routeKeys.add(key);
    routes.push(route);
  };
  for (const tag of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []) {
    const label = text(tag).slice(0, 80);
    if (!label) continue;
    remember(websiteRoute(label, classifyWebsiteAction(label, attr(tag, 'href'))));
    if (routes.length >= 24) break;
  }
  for (const m of contentHtml.matchAll(/<h([2-3])\b[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[1-3]\b|$)/gi)) {
    const rawTitle = text(m[2]).slice(0, 180), body = text(m[3]).slice(0, 900);
    if (!rawTitle || rawTitle.toLowerCase() === h1.toLowerCase()) continue;
    if (/^(?:home|blog|our blog)$/i.test(rawTitle)) { remember(websiteRoute(rawTitle, classifyWebsiteSection(rawTitle, ''))); continue; }
    const title = readableSectionTitle(rawTitle, body);
    if (!title || sections.some(s => s.title.toLowerCase() === title.toLowerCase())) continue;
    const decision = classifyWebsiteSection(title, body);
    if (decision.destination !== 'unique') remember(websiteRoute(rawTitle, decision));
    if (decision.destination === 'omit' || isGenericWebsiteLabel(title)) continue;
    if (decision.destination === 'native' && decision.native === 'listings') {
      if (keptListingHeading) continue;
      keptListingHeading = true;
    }
    const section: WebsiteSection = { ...decision, title, body };
    sectionByRawTitle.set(rawTitle.toLowerCase(), section);
    sections.push(section);
    if (sections.length >= 24) break;
  }
  // Source composition: every meaningful content image stays with the copy it sits in on the
  // submitted page (the main heading's intro or a section). Roles decide slots (logo, portrait, hero,
  // listing); an image not suited to one role is still placed where the source put it, never dropped.
  const anchored = anchorContentImages(contentHtml, media, h1, sectionByRawTitle, raw => websiteAsset(raw, sourceUrl));
  for (const [section, image] of anchored.sections) Object.assign(section, { imageUrl: image.url, imageFit: image.fit, imageRole: image.role, imageWidth: image.width, imageHeight: image.height });
  const introImage = anchored.intro;
  const composed = composeWebsiteSections(sections).filter(section => section.destination !== 'omit' && section.title.toLowerCase() !== h1.toLowerCase());
  for (const section of composed) if (section.destination === 'unique') remember(websiteRoute(section.title, section));
  const neutral = (value?: string) => {
    const c = value ? normalizeWebsiteColor(value) : undefined;
    if (!c) return false;
    const n = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    return Math.max(...n) - Math.min(...n) <= 22 && websiteLuminance(c) > 0.82;
  };
  const contentCanvas = nodes.filter(n => n.tag === 'main' || n.tag === 'article' || /content|site-inner|entry-content|page-content/.test(n.classes.join(' ')))
    .slice(0, 8)
    .map(n => normalizeWebsiteColor(computed(n, 'background(?:-color)?', v => !!normalizeWebsiteColor(v)) ?? ''))
    .find(c => neutral(c));
  const surface = presentWebsiteSurface(contentCanvas ?? background, accent, ink);
  const numeric = (value?: string, fallback = 0) => { const n = Number.parseFloat(value ?? ''); return Number.isFinite(n) ? n : fallback; };
  const appearance: WebsiteAppearance = { accent: surface.accent, background: surface.background, ink: surface.ink, panel: surface.panel, muted: surface.ink,
    fontFamily: bodyFont, headingFontFamily: headingFont,
    layout: /(?:hero|banner)[^{}]*\{[^}]*position\s*:\s*(?:absolute|relative)/i.test(css) && overlaySafe ? 'image-overlay' : overlaySafe ? 'image-first' : portraitImageUrl ? 'portrait-split' : heroImageUrl ? 'image-first' : 'text-first',
    spacing: Math.min(48, Math.max(16, numeric(pick('padding(?:-top)?', /section|container|hero/i), 24))),
    radius: Math.min(32, Math.max(0, numeric(pick('border-radius', /button|btn|card/i), 0))),
    headingSize: Math.min(52, Math.max(28, numeric(headingInline.match(/font-size\s*:\s*([^;]+)/i)?.[1] ?? pick('font-size', /h1|hero.*title|heading-title/i), 38))),
    motion: /fade.?in/i.test(css) ? 'fade' : /slide.?up|translateY/i.test(css) ? 'rise' : 'none',
  };
  return { version: 1, sourceUrl, analyzedAt: Date.now(), logoUrl: logo?.selectedUrl, headerImageUrl, backgroundImageUrl: bodyBackground, heroImageUrl, portraitImageUrl, introImage, heroTitle: h1, heroSubtitle, sections: composed,
    imagery: { logo: media.logo, portrait: media.portrait, hero: media.hero, images: media.all },
    original: appearance,
    optimized: { ...appearance, spacing: 24, radius: Math.max(12, appearance.radius), headingSize: 36, layout: overlaySafe ? 'image-overlay' : portraitImageUrl ? 'portrait-split' : 'text-first', motion: 'rise' },
    evidence: { stylesheets: stylesheets.map(s => s.url), colors: observedColors.slice(0, 30), fonts: fonts.slice(0, 12), routing: routes.slice(0, 40),
      warnings: ['Native adaptation uses observed HTML and CSS; script-generated layouts and unavailable fonts may need a supported fallback.'] } };
}

/** Source images stay source images. Composition follows the file, not the other way around. */

export type ImageRole = 'logo' | 'portrait' | 'hero' | 'listing' | 'article' | 'icon' | 'background';
export type ImageFit = 'contain' | 'cover';
export type ImageCrop = 'none' | 'modest' | 'rejected';

export type ImageVariant = { url: string; width?: number; height?: number };

export type ImageDiagnostic = {
  /** The URL the page actually pointed at, which may be a thumbnail. */
  sourceUrl: string;
  variants: ImageVariant[];
  role: ImageRole;
  selectedUrl: string;
  width?: number;
  height?: number;
  destination: 'logo' | 'portrait' | 'hero' | 'article' | 'listing' | 'background' | 'omit';
  fit: ImageFit;
  renderedWidth: number;
  renderedHeight: number;
  upscaleRatio: number;
  crop: ImageCrop;
  /** Higher means the page asked for this job more clearly. CSS heroes outrank a nearby image. */
  rank: number;
};

export type ImageSlot = { width: number; height: number; purpose: 'hero' | 'portrait' | 'logo' | 'article' | 'listing' | 'background' };

const MAX_UPSCALE = 1.35;
const REFERENCE_DPR = 2;

function sizeFromUrl(url: string): { width?: number; height?: number } {
  const box = url.match(/[?&](?:resize|fit)=(\d+)(?:%2C|,)(\d+)/i);
  if (box) return { width: Number(box[1]), height: Number(box[2]) };
  const width = url.match(/[?&]w=(\d+)\b/i);
  return width ? { width: Number(width[1]) } : {};
}

function parseSrcset(value: string, resolve: (raw: string) => string | undefined): ImageVariant[] {
  const variants: ImageVariant[] = [];
  // Candidates are separated by a comma followed by whitespace; image CDNs (Wix) put commas inside URLs.
  for (const part of value.split(/,\s+/)) {
    const bits = part.trim().replace(/,$/, '').split(/\s+/);
    const url = resolve(bits[0] ?? '');
    if (!url) continue;
    const mark = bits[1] ?? '';
    const width = /w$/i.test(mark) ? Number(mark.slice(0, -1)) : undefined;
    const fromUrl = sizeFromUrl(url);
    variants.push({ url, width: Number.isFinite(width) ? width : fromUrl.width, height: fromUrl.height });
  }
  return variants;
}

type Candidate = {
  sourceUrl: string;
  variants: ImageVariant[];
  width?: number;
  height?: number;
  role: ImageRole;
  explicitHero: boolean;
  cssHero: boolean;
  hint: string;
};

function aspectOf(width?: number, height?: number): number | undefined {
  if (!width || !height || width <= 0 || height <= 0) return;
  return width / height;
}

/**
 * Role from the page's own structure first, proportions last. `floated` marks an image the author
 * placed inside article copy (WordPress/Gutenberg alignleft/alignright): it illustrates the text it
 * sits in and is never promoted to the page hero just because it is landscape.
 */
function classify(hint: string, width?: number, height?: number, explicitHero = false, floated = false): ImageRole {
  const aspect = aspectOf(width, height);
  if (/equal.?housing|eho\b|realtor.?logo|mls.?logo|sprite|favicon|wp-emoji|gravatar/i.test(hint)) return 'icon';
  if (/logo|wordmark|brand.?mark|custom-logo|site-logo/i.test(hint) && !/headshot|portrait/i.test(hint)) return 'logo';
  if (width && height && width <= 96 && height <= 96 && !/headshot|portrait|agent/i.test(hint)) return 'icon';
  if (/headshot|portrait|agent|realtor|team|staff|broker|bio|profile|head-shot/i.test(hint) && !/logo|listing|property|office|banner|hero/i.test(hint)) return 'portrait';
  if (aspect && aspect >= 0.55 && aspect <= 0.92 && (height ?? 0) >= 140 && !explicitHero) return 'portrait';
  if (/listing|property|mls|idx|dsidx|floorplan|floor-plan/i.test(hint) && !/hero|banner/i.test(hint)) return 'listing';
  if (explicitHero || /hero|banner|masthead|slider|billboard/i.test(hint)) return 'hero';
  if (floated) return 'article';
  if (aspect && aspect >= 1.35 && (width ?? 0) >= 320) return 'hero';
  if (/background|texture|pattern/i.test(hint)) return 'background';
  return 'article';
}

function legitimate(variants: ImageVariant[], intrinsicWidth?: number): ImageVariant[] {
  const unique = new Map<string, ImageVariant>();
  for (const variant of variants) {
    if (!variant.url) continue;
    if (intrinsicWidth && variant.width && variant.width > intrinsicWidth * 1.02) continue;
    const prior = unique.get(variant.url);
    if (!prior || (variant.width ?? 0) > (prior.width ?? 0)) unique.set(variant.url, variant);
  }
  return [...unique.values()];
}

/** Smallest variant that covers the slot, otherwise the largest real file. Never a thumbnail when a larger sibling exists. */
export function selectImageVariant(variants: ImageVariant[], neededPixels: number, intrinsicWidth?: number): ImageVariant | undefined {
  const usable = legitimate(variants, intrinsicWidth);
  if (!usable.length) return;
  const sized = usable.filter(variant => (variant.width ?? 0) > 0).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  if (!sized.length) return usable[0];
  const enough = sized.filter(variant => (variant.width ?? 0) >= Math.max(1, neededPixels) * 0.9);
  if (enough.length) return enough[0];
  return sized[sized.length - 1];
}

function cropLoss(sourceAspect: number, slotAspect: number): number {
  if (sourceAspect <= 0 || slotAspect <= 0) return 1;
  return sourceAspect > slotAspect ? 1 - slotAspect / sourceAspect : 1 - sourceAspect / slotAspect;
}

/** How an imported file is allowed to sit in a component. Low-resolution files shrink; they are not blown up. */
export function frameForSlot(source: { width?: number; height?: number; role: ImageRole }, slot: ImageSlot, dpr = REFERENCE_DPR): { fit: ImageFit; width: number; height: number; upscaleRatio: number; crop: ImageCrop } {
  const density = Math.min(3, Math.max(1, dpr));
  const aspect = aspectOf(source.width, source.height);
  const round = (n: number) => Math.max(1, Math.round(n));
  const contained = (maxWidth: number, maxHeight: number) => {
    if (!source.width || !source.height || !aspect) {
      return { fit: 'contain' as const, width: round(Math.min(slot.width, maxWidth)), height: round(Math.min(slot.height, maxHeight)), upscaleRatio: 1, crop: 'none' as const };
    }
    const width = Math.min(slot.width, maxWidth, source.width * MAX_UPSCALE / density);
    const height = Math.min(slot.height, maxHeight, width / aspect, source.height * MAX_UPSCALE / density);
    const fittedWidth = Math.min(width, height * aspect);
    return { fit: 'contain' as const, width: round(fittedWidth), height: round(fittedWidth / aspect), upscaleRatio: Number(((fittedWidth * density) / source.width).toFixed(2)), crop: 'none' as const };
  };
  if (slot.purpose === 'logo' || source.role === 'logo' || source.role === 'icon') return contained(190, 64);
  if (source.role === 'portrait' || slot.purpose === 'portrait' || (aspect !== undefined && aspect < 0.95 && slot.purpose === 'hero')) {
    const frame = contained(280, 420);
    return slot.purpose === 'hero' && source.role !== 'portrait' ? { ...frame, crop: 'rejected' } : slot.purpose === 'hero' ? { ...frame, crop: 'rejected' } : frame;
  }
  if (!source.width || !source.height) {
    if (slot.purpose === 'hero' && source.role === 'hero') {
      return { fit: 'cover', width: round(slot.width), height: round(slot.height), upscaleRatio: 1, crop: 'modest' };
    }
    return { fit: 'contain', width: round(Math.min(slot.width, slot.purpose === 'background' ? slot.width : 320)), height: round(Math.min(slot.height, 220)), upscaleRatio: 1, crop: 'none' };
  }
  const slotAspect = slot.width / Math.max(1, slot.height);
  const loss = aspect ? cropLoss(aspect, slotAspect) : 1;
  const coverScale = Math.max(slot.width / source.width, slot.height / source.height) * density;
  const coverOk = coverScale <= MAX_UPSCALE && loss <= (slot.purpose === 'listing' ? 0.4 : 0.28) && (slot.purpose !== 'hero' || (aspect ?? 0) >= 1.25);
  if ((slot.purpose === 'hero' || slot.purpose === 'listing' || slot.purpose === 'article') && coverOk) {
    return { fit: 'cover', width: round(slot.width), height: round(slot.height), upscaleRatio: Number(coverScale.toFixed(2)), crop: loss > 0.08 ? 'modest' : 'none' };
  }
  const frame = contained(slot.width, slot.purpose === 'hero' ? Math.min(slot.height, 280) : slot.height);
  return { ...frame, crop: slot.purpose === 'hero' || slot.purpose === 'article' ? 'rejected' : frame.crop };
}

function destinationFor(role: ImageRole, frame: { fit: ImageFit; crop: ImageCrop }): ImageDiagnostic['destination'] {
  if (role === 'icon') return 'omit';
  if (role === 'logo') return 'logo';
  if (role === 'portrait') return 'portrait';
  if (role === 'background') return 'background';
  if (role === 'listing') return 'listing';
  if (role === 'hero') return 'hero';
  return 'article';
}

function diagnose(candidate: Candidate, slot: ImageSlot, dpr: number): ImageDiagnostic {
  const intrinsicWidth = candidate.width;
  const probe = frameForSlot({ width: candidate.width, height: candidate.height, role: candidate.role }, slot, dpr);
  const needed = probe.width * Math.min(3, Math.max(1, dpr));
  const selected = selectImageVariant(candidate.variants, needed, intrinsicWidth) ?? candidate.variants[0];
  const selectedSize = sizeFromUrl(selected?.url ?? '');
  const width = candidate.width || selected?.width || selectedSize.width;
  const height = candidate.height || selected?.height || selectedSize.height;
  const frame = frameForSlot({ width, height, role: candidate.role }, slot, dpr);
  return {
    sourceUrl: candidate.sourceUrl,
    variants: candidate.variants,
    role: candidate.role,
    selectedUrl: selected?.url ?? candidate.sourceUrl,
    width, height,
    destination: destinationFor(candidate.role, frame),
    fit: frame.fit,
    renderedWidth: frame.width,
    renderedHeight: frame.height,
    upscaleRatio: frame.upscaleRatio,
    crop: frame.crop,
    rank: candidate.cssHero ? 3 : candidate.explicitHero ? 2 : 1,
  };
}

function addVariant(list: ImageVariant[], resolve: (raw: string) => string | undefined, raw?: string, width?: number, height?: number) {
  const url = raw ? resolve(raw) : undefined;
  if (!url) return;
  const fromUrl = sizeFromUrl(url);
  list.push({ url, width: width || fromUrl.width, height: height || fromUrl.height });
}

/** Every usable file behind one <img>, including srcset, lazy attributes and WordPress original/large files. */
export function collectPageImages(html: string, css: string, resolve: (raw: string) => string | undefined): Candidate[] {
  const found: Candidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: Candidate) => {
    if (!candidate.variants.length || seen.has(candidate.sourceUrl)) return;
    seen.add(candidate.sourceUrl);
    found.push(candidate);
  };
  const pictures = html.match(/<picture\b[\s\S]*?<\/picture>/gi) ?? [];
  const consumed = new Set<string>();
  for (const picture of pictures) {
    const image = picture.match(/<img\b[^>]*>/i)?.[0];
    if (!image) continue;
    consumed.add(image);
    const variants: ImageVariant[] = [];
    for (const source of picture.match(/<source\b[^>]*>/gi) ?? []) {
      variants.push(...parseSrcset(attr(source, 'srcset'), resolve));
    }
    push(candidateFromTag(image, variants, resolve));
  }
  for (const image of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (consumed.has(image)) continue;
    push(candidateFromTag(image, [], resolve));
  }
  for (const tag of html.match(/<[a-z][\w-]*\b[^>]*\bstyle\s*=\s*["'][^"']*url\([^)]+\)[^"']*["'][^>]*>/gi) ?? []) {
    const hint = `${attr(tag, 'class')} ${attr(tag, 'id')}`;
    if (!/hero|banner|masthead|slider|cover|elementor-section/i.test(hint) || /logo|site-title/i.test(hint)) continue;
    const raw = attr(tag, 'style').match(/url\((['"]?)([^)'"\s]+)/i)?.[2];
    const resolved = raw ? resolve(raw) : undefined;
    if (!resolved) continue;
    push({ sourceUrl: resolved, variants: [{ url: resolved, ...sizeFromUrl(resolved) }], role: 'hero', explicitHero: true, cssHero: true, hint });
  }
  for (const rule of css.match(/([^{}]+)\{([^{}]*)\}/g) ?? []) {
    const selector = rule.slice(0, rule.indexOf('{'));
    const body = rule.slice(rule.indexOf('{') + 1);
    const url = body.match(/background(?:-image)?\s*:[^;]*url\((['"]?)([^)'"\s]+)\1\)/i)?.[2];
    if (!url || /logo|site-title|custom-logo/i.test(selector)) continue;
    const explicit = /hero|banner|masthead|slider|billboard/i.test(selector);
    const background = /(?:^|[\s.#])body\b|custom-background|texture|pattern/i.test(selector);
    if (!explicit && !background) continue;
    const resolved = resolve(url);
    if (!resolved) continue;
    push({
      sourceUrl: resolved,
      variants: [{ url: resolved }],
      role: explicit ? 'hero' : 'background',
      explicitHero: explicit,
      cssHero: explicit,
      hint: selector,
    });
  }
  const og = (html.match(/<meta\b[^>]*>/gi) ?? []).find(tag => attr(tag, 'property').toLowerCase() === 'og:image');
  const ogUrl = og ? resolve(attr(og, 'content')) : undefined;
  if (ogUrl && !found.some(item => item.role === 'hero' || item.role === 'portrait' || item.variants.some(variant => variant.url.split('?')[0] === ogUrl.split('?')[0]))) {
    push({ sourceUrl: ogUrl, variants: [{ url: ogUrl, ...sizeFromUrl(ogUrl) }], role: 'hero', explicitHero: false, cssHero: false, hint: 'og:image' });
  }
  return found;
}

function candidateFromTag(tag: string, extra: ImageVariant[], resolve: (raw: string) => string | undefined): Candidate {
  const variants: ImageVariant[] = [...extra];
  const orig = attr(tag, 'data-orig-size').match(/(\d+)\s*,\s*(\d+)/);
  const intrinsicWidth = orig ? Number(orig[1]) : undefined;
  const intrinsicHeight = orig ? Number(orig[2]) : undefined;
  addVariant(variants, resolve, attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original'));
  addVariant(variants, resolve, attr(tag, 'data-orig-file'), intrinsicWidth, intrinsicHeight);
  addVariant(variants, resolve, attr(tag, 'data-large-file'));
  variants.push(...parseSrcset(attr(tag, 'srcset') || attr(tag, 'data-srcset'), resolve));
  const lazy = attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original');
  if (!lazy) addVariant(variants, resolve, attr(tag, 'src'));
  const layoutWidth = Number(attr(tag, 'width')) || undefined;
  const layoutHeight = Number(attr(tag, 'height')) || undefined;
  const width = intrinsicWidth || layoutWidth;
  const height = intrinsicHeight || layoutHeight;
  const usable = legitimate(variants, intrinsicWidth);
  const hint = `${attr(tag, 'class')} ${attr(tag, 'id')} ${attr(tag, 'alt')} ${attr(tag, 'src')} ${attr(tag, 'data-image-title')}`;
  const explicitHero = /hero|banner|masthead|slider|billboard/i.test(hint);
  const floated = /(?:^|\s)align(?:left|right)(?:\s|$)/i.test(attr(tag, 'class'));
  const pageSrc = resolve(attr(tag, 'src'));
  const sourceUrl = pageSrc || usable[0]?.url || variants[0]?.url || '';
  return { sourceUrl, variants: usable.length ? usable : variants, width, height, role: classify(hint, width, height, explicitHero, floated), explicitHero, cssHero: false, hint };
}

const slotFor = (role: ImageRole): ImageSlot => role === 'portrait'
  ? { width: 280, height: 360, purpose: 'portrait' }
  : role === 'logo' || role === 'icon'
    ? { width: 190, height: 64, purpose: 'logo' }
    : role === 'listing'
      ? { width: 320, height: 200, purpose: 'listing' }
      : role === 'background'
        ? { width: 390, height: 240, purpose: 'background' }
        : role === 'hero'
          ? { width: 390, height: 220, purpose: 'hero' }
          : { width: 320, height: 200, purpose: 'article' };

export function describePageImages(html: string, css: string, resolve: (raw: string) => string | undefined, dpr = REFERENCE_DPR): ImageDiagnostic[] {
  return collectPageImages(html, css, resolve).map(candidate => diagnose(candidate, slotFor(candidate.role), dpr));
}

export type PageImagery = {
  logo?: ImageDiagnostic;
  portrait?: ImageDiagnostic;
  hero?: ImageDiagnostic;
  all: ImageDiagnostic[];
};

/** Pick one image per job. A portrait is never asked to become a landscape hero. */
export function assignPageImages(images: ImageDiagnostic[]): PageImagery {
  const usable = images.filter(image => image.destination !== 'omit' && image.role !== 'icon');
  const logo = usable.find(image => image.role === 'logo');
  const portrait = usable.filter(image => image.role === 'portrait')
    .sort((a, b) => (b.variants.reduce((max, variant) => Math.max(max, variant.width ?? 0), 0)) - (a.variants.reduce((max, variant) => Math.max(max, variant.width ?? 0), 0)))[0];
  const heroes = usable.filter(image => image.role === 'hero' && image !== portrait && image !== logo)
    .sort((a, b) => b.rank - a.rank || (b.variants.reduce((max, variant) => Math.max(max, variant.width ?? 0), 0)) - (a.variants.reduce((max, variant) => Math.max(max, variant.width ?? 0), 0)));
  // A hero is either asked for by the page (CSS/explicit hero, rank >= 2) or able to fill the hero
  // slot. A proportion-guessed image that can only be shown small is not a hero.
  const hero = heroes.find(image => image.fit === 'cover' && image.crop !== 'rejected') ?? heroes.find(image => image.rank >= 2);
  return { logo, portrait, hero, all: images };
}

/** Content images that may accompany copy: not brand, person, listing, decorative, or the chosen hero. */
export function supportingImage(image: ImageDiagnostic | undefined, media: Pick<PageImagery, 'hero' | 'portrait' | 'logo'>): SupportingImage | undefined {
  if (!image || image.destination === 'omit') return;
  if (image.role === 'icon' || image.role === 'logo' || image.role === 'portrait' || image.role === 'listing' || image.role === 'background') return;
  if (image === media.hero || image === media.portrait || image === media.logo) return;
  const frame = frameForSlot({ width: image.width, height: image.height, role: 'article' }, { width: 320, height: 200, purpose: 'article' });
  return { url: image.selectedUrl, fit: frame.fit, role: 'article', width: image.width, height: image.height };
}

/**
 * Pair each content image with the heading whose copy it sits in. The nearest preceding kept
 * heading wins; an image that precedes its copy (or sits under a generic page title such as "Home")
 * belongs to the next kept heading. Images in unrelated chrome (sidebars, widgets) stay unplaced.
 */
export function anchorContentImages(contentHtml: string, media: PageImagery, mainHeading: string, sections: Map<string, WebsiteSection>, resolve: (raw: string) => string | undefined): { intro?: SupportingImage; sections: Map<WebsiteSection, SupportingImage> } {
  type Mark = { index: number; label: string; anchor: 'intro' | WebsiteSection | null };
  const main = mainHeading.toLowerCase();
  const headings: Mark[] = [...contentHtml.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => {
    const label = text(m[2]).slice(0, 180).toLowerCase();
    return { index: m.index ?? 0, label, anchor: label && label === main ? 'intro' as const : sections.get(label) ?? null };
  }).filter(h => h.label); // empty spacer headings carry no meaning
  // A page-title heading ("Home") carries no content of its own; images under it lead into the next copy.
  const pageTitle = (h: Mark) => /^(?:home|homepage|welcome|blog|our blog)$/.test(h.label);
  const result: { intro?: SupportingImage; sections: Map<WebsiteSection, SupportingImage> } = { sections: new Map() };
  for (const m of contentHtml.matchAll(/<img\b[^>]*>/gi)) {
    const image = supportingImage(imageForTag(m[0], media.all, resolve), media);
    if (!image) continue;
    const at = m.index ?? 0;
    const before = headings.filter(h => h.index < at).at(-1);
    const after = headings.find(h => h.index > at);
    let anchor: Mark['anchor'] = null;
    if (before?.anchor) anchor = before.anchor;
    else if ((!before || pageTitle(before)) && after?.anchor) anchor = after.anchor;
    if (!anchor) continue; // e.g. sidebar or widget imagery under an unrelated heading
    if (anchor === 'intro') { result.intro ??= image; continue; }
    if (!result.sections.has(anchor)) result.sections.set(anchor, image);
  }
  return result;
}

/**
 * The hero image a renderer may show, including designs saved before roles were tightened.
 * Requires the page to have asked for a hero (rank >= 2) or the file to fill the hero slot without
 * a rejected crop. Older designs without diagnostics keep their saved hero URL.
 */
export function renderableHero(design: Pick<WebsiteDesign, 'heroImageUrl' | 'imagery'>, dpr = REFERENCE_DPR): { uri: string; frame?: ReturnType<typeof frameForSlot> } | null {
  const meta = design.imagery?.hero;
  const uri = meta?.selectedUrl || design.heroImageUrl;
  if (!uri) return null;
  if (!meta) return { uri };
  const frame = frameForSlot({ width: meta.width, height: meta.height, role: meta.role }, { width: 390, height: 220, purpose: 'hero' }, dpr);
  if (meta.role !== 'hero') return null;
  return meta.rank >= 2 || (frame.fit === 'cover' && frame.crop !== 'rejected') ? { uri, frame } : null;
}

/**
 * The image to show with the intro copy. Designs saved before intro anchoring stored an in-copy
 * image as the hero; when that hero is not renderable it is shown here instead of being dropped.
 */
export function introSupportingImage(design: Pick<WebsiteDesign, 'introImage' | 'heroImageUrl' | 'imagery' | 'portraitImageUrl'>, dpr = REFERENCE_DPR): SupportingImage | undefined {
  if (design.introImage) return design.introImage;
  const meta = design.imagery?.hero;
  if (!meta || renderableHero(design, dpr)) return;
  if (meta.role === 'portrait' || design.portraitImageUrl && meta.selectedUrl.split('?')[0] === design.portraitImageUrl.split('?')[0]) return;
  const frame = frameForSlot({ width: meta.width, height: meta.height, role: 'article' }, { width: 320, height: 200, purpose: 'article' }, dpr);
  return { url: meta.selectedUrl, fit: frame.fit, role: 'article', width: meta.width, height: meta.height };
}

export function imageForTag(tag: string, images: ImageDiagnostic[], resolve: (raw: string) => string | undefined): ImageDiagnostic | undefined {
  const raw = attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-orig-file') || attr(tag, 'src');
  const url = resolve(raw);
  if (!url) return;
  const path = url.split('?')[0];
  return images.find(image => image.selectedUrl.split('?')[0] === path || image.sourceUrl.split('?')[0] === path || image.variants.some(variant => variant.url.split('?')[0] === path));
}

export const IMAGE_UPSCALE_LIMIT = MAX_UPSCALE;


/**
 * Whether the page captions this image with the agent's name: the image's alt text, or the text right
 * beside it ("Cindy Carlson Broker, Realtor®" under a headshot), names both the first and last name.
 * Used only to accept the page's own portrait-shaped image as the agent's portrait; never guesses a face.
 */
export function imageCaptionedWithName(html: string, imageUrl: string, name: string): boolean {
  const words = name.toLowerCase().normalize("NFKD").replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(word => word.length >= 2);
  if (words.length < 2) return false;
  const [first, last] = [words[0], words[words.length - 1]];
  let tail = "";
  try { tail = new URL(imageUrl).pathname.split("/").filter(Boolean).slice(-3).join("/"); } catch { return false; }
  if (!tail || tail.length < 6) return false;
  const plain = (markup: string) => markup.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").toLowerCase();
  const names = (value: string) => new RegExp(`\\b${first}\\b`).test(value) && new RegExp(`\\b${last}\\b`).test(value);
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!tag.includes(tail)) continue;
    if (names(plain(attr(tag, "alt")))) return true;
    const at = match.index ?? 0;
    const after = plain(html.slice(at + tag.length, at + tag.length + 1500)).trim().slice(0, 160);
    const before = plain(html.slice(Math.max(0, at - 800), at)).trim().slice(-120);
    if (names(after) || names(before)) return true;
  }
  return false;
}
