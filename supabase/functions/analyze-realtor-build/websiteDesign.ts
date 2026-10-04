/** Website markup is data, never executable UI. Both variants use native components. */
export type WebsiteVariant = 'original' | 'optimized';
export type WebsitePalette = { accent: string; background: string; ink: string; panel: string; muted: string };
export type WebsiteAppearance = WebsitePalette & {
  fontFamily: string; headingFontFamily: string;
  layout: 'image-overlay' | 'image-first' | 'portrait-split' | 'text-first';
  spacing: number; radius: number; headingSize: number;
  motion: 'none' | 'fade' | 'rise';
};
export type WebsiteSection = { kind: 'about' | 'listings' | 'services' | 'testimonials' | 'contact' | 'content'; title: string; body: string; imageUrl?: string };
export type WebsiteDesign = {
  version: 1; sourceUrl: string; analyzedAt: number;
  logoUrl?: string; heroImageUrl?: string; heroTitle: string; heroSubtitle: string;
  headerImageUrl?: string; backgroundImageUrl?: string;
  sections: WebsiteSection[];
  original: WebsiteAppearance; optimized: WebsiteAppearance;
  evidence: { stylesheets: string[]; colors: string[]; fonts: string[]; warnings: string[] };
};

const entities = (s: string) => s.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
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

/** A bounded CSS approximation, retaining its evidence and explicit rendering limitations. */
export function extractWebsiteDesign(html: string, sourceUrl: string, stylesheets: { url: string; css: string }[] = []): WebsiteDesign {
  const css = (stylesheets.map(s => s.css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (all, quote, url) => {
    const absolute = websiteAsset(url, s.url); return absolute ? `url("${absolute}")` : all;
  })).join('\n') + '\n' + [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n')).replace(/\/\*[\s\S]*?\*\//g, '');
  // Match selectors against actual markup, so unused Bootstrap/IDX/plugin styles
  // cannot masquerade as the site's branding. Supports the common static cascade.
  type Node = { tag: string; markup: string; classes: string[]; id: string; parent?: Node };
  const nodes: Node[] = [], stack: Node[] = [];
  const cleanMarkup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const match of cleanMarkup.matchAll(/<(\/)?([a-z][\w-]*)\b[^>]*>/gi)) {
    const tag = match[2].toLowerCase();
    if (match[1]) { const index = stack.map(n => n.tag).lastIndexOf(tag); if (index >= 0) stack.splice(index); continue; }
    const node: Node = { tag, markup: match[0], classes: attr(match[0], 'class').split(/\s+/), id: attr(match[0], 'id'), parent: stack.at(-1) };
    if (nodes.length < 6000) nodes.push(node);
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !/\/>$/.test(match[0])) stack.push(node);
  }
  const simple = (node: Node, selector: string) => {
    if (/:hover|:focus|:disabled|:before|:after|:not\(|:has\(|\[|@/.test(selector)) return false;
    const bare = selector.replace(/:[\w-]+(?:\([^)]*\))?/g, '');
    const tag = bare.match(/^[\w-]+/)?.[0];
    if (tag && node.tag !== tag.toLowerCase()) return false;
    return [...bare.matchAll(/([.#])([\w-]+)/g)].every(m => m[1] === '#' ? node.id === m[2] : node.classes.includes(m[2]));
  };
  const matches = (node: Node, selector: string) => {
    const parts = selector.trim().split(/\s+/); let current: Node | undefined = node;
    if (!simple(node, parts.pop() ?? '*')) return false;
    while (parts.length) {
      const part = parts.pop()!;
      if (part === '>') { current = current?.parent; if (!current || !simple(current, parts.pop() ?? '*')) return false; }
      else { current = current?.parent; while (current && !simple(current, part)) current = current.parent; if (!current) return false; }
    }
    return true;
  };
  const variables = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) variables.set(m[1], m[2].trim());
  const resolve = (v: string): string => {
    for (let i = 0; i < 5 && /var\(/.test(v); i++) v = v.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (_, k, fallback) => variables.get(k) ?? fallback ?? '');
    return v.trim();
  };
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(m => m[1].split(',').map(selector => ({ selector: selector.trim(), body: m[2] }))).filter(r => !/::|@font-face|keyframes/.test(r.selector));
  const valueFrom = (body: string, property: string) => resolve(body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'))?.[1]?.replace(/!important/g, '') ?? '');
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
      if (!relevance.test(rule.selector) || /@font-face|keyframes|hover|focus|disabled|\.idx|\.ihf|\.dsidx/i.test(rule.selector) || !nodes.some(n => matches(n, rule.selector))) continue;
      const value = resolve(rule.body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'))?.[1]?.replace(/!important/g, '') ?? '');
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
  const headingFont = pick('font-family', /h[1-3]|heading|hero|banner/i)?.split(',')[0].replace(/["']/g, '').trim() ?? bodyFont;
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const h1 = text(clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
  const metaDescription = (html.match(/<meta\b[^>]*>/gi) ?? []).find(t => attr(t, 'name').toLowerCase() === 'description');
  const heroSubtitle = metaDescription ? attr(metaDescription, 'content').slice(0, 500) : '';
  const imgs = (clean.match(/<img\b[^>]*>/gi) ?? []).map(tag => ({ tag, url: websiteAsset(attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src'), sourceUrl) })).filter(i => !!i.url);
  const logo = imgs.find(i => /logo|brand.*mark/i.test(i.tag) && !/equal.?housing|realtor.?logo|footer|ftr-logo/i.test(i.tag));
  const backgroundImage = pick('background(?:-image)?', /hero|banner|masthead|slider|cover|header|elementor-section/i)?.match(/url\(["']?([^)'"\s]+)["']?\)/)?.[1];
  const inlineBackground = clean.match(/(?:hero|banner|cover|slider)[^>]{0,800}background(?:-image)?\s*:[^>]{0,100}?url\(["']?([^)'"\s]+)/i)?.[1];
  const headerImageUrl = websiteAsset(pick('background(?:-image)?', /site-title|header-image|custom-logo/i)?.match(/url\(["']?([^)'"\s]+)["']?\)/)?.[1] ?? '', sourceUrl);
  const bodyBackground = websiteAsset((bodyNode && computed(bodyNode, 'background(?:-image)?'))?.match(/url\(["']?([^)'"\s]+)["']?\)/)?.[1] ?? '', sourceUrl);
  const overlayNode = nodes.find(n => /img-overlay|hero|masthead|banner|cover/i.test(n.classes.join(' ')) && /url\(/i.test(attr(n.markup, 'style')));
  const overlayImage = overlayNode && attr(overlayNode.markup, 'style').match(/url\(["']?([^)'"\s]+)["']?\)/)?.[1];
  const heroImageUrl = websiteAsset(overlayImage || backgroundImage || inlineBackground || '', sourceUrl) || imgs.find(i => i !== logo && /hero|banner|slider|landscape|lake|mountain|home-page/i.test(i.tag) && !/transparent|logo/i.test(i.tag))?.url ||
    imgs.find(i => i !== logo && Number(attr(i.tag, 'width')) >= 700)?.url;
  const sections: WebsiteSection[] = [];
  for (const m of clean.matchAll(/<h([2-3])\b[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[1-3]\b|$)/gi)) {
    const title = text(m[2]).slice(0, 180), body = text(m[3]).slice(0, 900);
    if (!title || /cookie|privacy|subscribe|login|sign in|menu|sidebar|skip to|footer/i.test(title) || sections.some(s => s.title === title)) continue;
    const kind: WebsiteSection['kind'] = /listing|propert|featured home|available home/i.test(title) ? 'listings' : /about|meet|welcome|story/i.test(title) ? 'about' : /testimonial|review|client.*say/i.test(title) ? 'testimonials' : /contact|connect|touch/i.test(title) ? 'contact' : /buy|sell|service|relocat/i.test(title) ? 'services' : 'content';
    const img = m[3].match(/<img\b[^>]*>/i)?.[0];
    sections.push({ kind, title, body, imageUrl: img ? websiteAsset(attr(img, 'data-src') || attr(img, 'src'), sourceUrl) : undefined });
    if (sections.length >= 8) break;
  }
  const numeric = (value?: string, fallback = 0) => { const n = Number.parseFloat(value ?? ''); return Number.isFinite(n) ? n : fallback; };
  const appearance: WebsiteAppearance = { accent, background, ink, panel: background, muted: ink,
    fontFamily: bodyFont, headingFontFamily: headingFont,
    layout: /(?:hero|banner)[^{}]*\{[^}]*position\s*:\s*(?:absolute|relative)/i.test(css) && heroImageUrl ? 'image-overlay' : heroImageUrl ? 'image-first' : imgs.some(i => /portrait|headshot|agent/i.test(i.tag)) ? 'portrait-split' : 'text-first',
    spacing: Math.min(48, Math.max(16, numeric(pick('padding(?:-top)?', /section|container|hero/i), 24))),
    radius: Math.min(32, Math.max(0, numeric(pick('border-radius', /button|btn|card/i), 0))),
    headingSize: Math.min(52, Math.max(28, numeric(pick('font-size', /h1|hero.*title|heading-title/i), 38))),
    motion: /fade.?in/i.test(css) ? 'fade' : /slide.?up|translateY/i.test(css) ? 'rise' : 'none',
  };
  return { version: 1, sourceUrl, analyzedAt: Date.now(), logoUrl: logo?.url, headerImageUrl, backgroundImageUrl: bodyBackground, heroImageUrl, heroTitle: h1, heroSubtitle, sections,
    original: appearance,
    optimized: { ...appearance, ink: readableWebsiteInk(background, ink), spacing: 24, radius: Math.max(12, appearance.radius), headingSize: 36, layout: heroImageUrl ? 'image-overlay' : 'portrait-split', motion: 'rise' },
    evidence: { stylesheets: stylesheets.map(s => s.url), colors: observedColors.slice(0, 30), fonts: fonts.slice(0, 12),
      warnings: ['Native adaptation uses observed HTML and CSS; script-generated layouts and unavailable fonts may need a supported fallback.'] } };
}
