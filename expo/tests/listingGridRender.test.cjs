// The Listings tab rendered (Oct 9 2026 audit: the earlier Listings tests only matched source text). The real
// ListingBrowser and ListingCard components are rendered with React into an element tree (React Native primitives
// as plain host elements), and the tree is checked the way a person would look at the screen: every home is a
// complete card, the number of cards per row at phone, tablet and desktop widths, a single home centered at a
// readable width, the empty state, and what each card says.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');

const host = name => name; // React Native primitives render as host elements named after them.
const stubs = {
  react: React,
  'react-native': { View: host('View'), Text: host('Text'), Pressable: host('Pressable'), useWindowDimensions: () => ({ width: 390, height: 844 }) },
  'expo-image': { Image: host('Image') },
  'lucide-react-native': { Heart: host('Heart') },
  '@/constants/liveThemeDesigns': { liveThemeDesign: () => ({ background: '#101010', panel: '#181818', ink: '#F5F5F5', muted: '#BBBBBB', accent: '#C2A276' }) },
  '@/lib/websitePresentation': { websiteAppearance: () => undefined, websiteFont: f => f },
  '@/lib/websiteDesignRuntime': { presentWebsiteSurface: (background, accent, ink) => ({ background, accent, ink, panel: '#FFFFFF' }) },
};
function load(rel, cache = new Map()) {
  const file = path.join(root, rel);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (id in stubs) return stubs[id];
    if (id.startsWith('@/')) { const base = id.slice(2); return load(fs.existsSync(path.join(root, base + '.tsx')) ? base + '.tsx' : base + '.ts', cache); }
    return require(id);
  }, module, module.exports);
  return module.exports;
}
const browser = load('components/ListingBrowser.tsx');
const ListingBrowser = browser.default;

/** Render to a plain tree: function components are called, host elements keep their props and children. */
function render(node) {
  if (node === null || node === undefined || node === false || node === true) return null;
  if (Array.isArray(node)) return node.map(render).flat().filter(Boolean);
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node.type === 'function') return render(node.type(node.props));
  if (node.type === React.Fragment) return render(node.props.children);
  const children = render(node.props.children);
  return { type: node.type, props: node.props, children: Array.isArray(children) ? children : children === null ? [] : [children] };
}
const all = (tree, match, out = []) => {
  if (!tree || typeof tree === 'string') return out;
  if (Array.isArray(tree)) { tree.forEach(t => all(t, match, out)); return out; }
  if (match(tree)) out.push(tree);
  tree.children.forEach(child => all(child, match, out));
  return out;
};
const text = tree => typeof tree === 'string' ? tree : !tree ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : tree.children.map(text).join(' ');
const style = node => Object.assign({}, ...[node.props.style].flat().filter(Boolean));

const brand = { realtor: { name: 'Cindy Carlson' }, presentation: 'premium', layoutId: 'private-collection', theme: {} };
const home = (i, extra = {}) => ({ id: `home-${i}`, title: `${100 + i} Emerald Dr`, neighborhood: 'Kellogg, ID', price: `$${400 + i},000`, beds: 3, baths: 2,
  sqft: '2,129', image: `https://photos.example/${i}.jpg`, images: [`https://photos.example/${i}.jpg`], tag: '', elizaTake: '', hidden: false, status: 'active', ...extra });
const homes = n => Array.from({ length: n }, (_, i) => home(i));

const WIDTHS = [{ name: 'iPhone (preview frame)', width: 390, columns: 1 }, { name: 'tablet', width: 768, columns: 2 }, { name: 'desktop', width: 1280, columns: 3 }];
const COUNTS = [0, 1, 5, 8, 20, 80];

for (const screen of WIDTHS) for (const count of COUNTS) {
  test(`Listings at ${screen.name} width (${screen.width}px) with ${count} ${count === 1 ? 'home' : 'homes'}`, () => {
    const opened = [];
    const tree = render(React.createElement(ListingBrowser, { brand, listings: homes(count), width: screen.width, onOpen: id => opened.push(id), onFavorite: () => {}, isFavorite: () => false }));
    const container = all(tree, n => n.props.testID === 'listing-browser')[0];
    assert.ok(container, 'the browser renders');
    assert.equal(style(container).height, undefined, 'no fixed-height container');
    const grid = browser.listingGrid(screen.width);
    const cards = all(tree, n => n.props.testID === 'listing-card');
    assert.equal(cards.length, count, 'every home is on the screen as its own card');
    if (!count) {
      assert.match(text(tree), /No active listings yet/);
      assert.match(text(tree), /New homes will appear here/);
      return;
    }
    assert.match(text(tree), new RegExp(`Cindy’s listings\\s+${count} ${count === 1 ? 'home' : 'homes'}`));
    const row = all(tree, n => style(n).flexWrap === 'wrap')[0];
    const content = style(row).width, gap = style(row).gap;
    assert.equal(content, grid.content);
    assert.ok(content <= screen.width - 32, 'side margins are kept');
    const widths = cards.map(card => style(card).width);
    assert.ok(widths.every(w => w === widths[0] && w > 0), 'every card has the same complete width');
    const perRow = Math.floor((content + gap) / (widths[0] + gap));
    if (count === 1) {
      assert.ok(widths[0] <= 560 && widths[0] <= content, 'a single home keeps a readable width');
      assert.equal(style(row).justifyContent, 'center', 'a single home is centered, not stranded at one side');
    } else {
      assert.equal(perRow, screen.columns, 'cards per row');
      assert.ok(perRow * widths[0] + (perRow - 1) * gap <= content, 'no card is clipped by the row');
    }
    // Each card opens its own home.
    for (const card of cards) all(card, n => n.type === 'Pressable' && n.props.accessibilityRole === 'button' && !!n.props.onPress && !/Save home|Remove saved home/.test(n.props.accessibilityLabel ?? ''))[0].props.onPress();
    assert.deepEqual(opened, homes(count).map(h => h.id));
  });
}

test('a card shows the photo, status, price, street, area, and specifications with their units', () => {
  const tree = render(React.createElement(ListingBrowser, { brand, listings: [home(1)], width: 390 }));
  const card = all(tree, n => n.props.testID === 'listing-card')[0];
  assert.equal(all(card, n => n.type === 'Image')[0].props.source.uri, 'https://photos.example/1.jpg');
  const words = text(card);
  for (const expected of ['ACTIVE', '$401,000', '101 Emerald Dr', 'Kellogg, ID', '3 beds · 2 baths · 2,129 sq ft']) assert.ok(words.includes(expected), expected);
});

test('a home without a published status has no badge, and IDX full-address titles show the street line', () => {
  const idx = home(2, { status: undefined, title: '41723 O Road, Paonia, Colorado CO 81428', neighborhood: 'Paonia, CO', sqft: '1,850 sq ft' });
  const tree = render(React.createElement(ListingBrowser, { brand, listings: [idx], width: 390 }));
  const words = text(tree);
  assert.doesNotMatch(words, /\bLISTING\b/);
  assert.match(words, /41723 O Road\s+Paonia, CO/);
  assert.doesNotMatch(words, /Colorado CO 81428/);
  assert.match(words, /1,850 sq ft/);
  assert.doesNotMatch(words, /sq ft sq ft/);
});

test('hidden and archived homes never appear, and saved homes use the same complete cards', () => {
  const tree = render(React.createElement(ListingBrowser, { brand, listings: [home(1), home(2, { hidden: true }), home(3, { sourceArchived: true })], width: 390, title: 'Saved homes' }));
  assert.equal(all(tree, n => n.props.testID === 'listing-card').length, 1);
  assert.match(text(tree), /Saved homes\s+1 home/);
});

test('the live Listings screen lays out the same grid, virtualized, with the bottom navigation clear of the last card', () => {
  for (const { width, columns } of WIDTHS) assert.equal(browser.listingGrid(width).columns, columns, String(width));
  const screen = fs.readFileSync(path.join(root, 'app/listings.tsx'), 'utf8');
  assert.match(screen, /<FlatList/);
  assert.match(screen, /numColumns=\{single \? 1 : grid\.columns\}/);
  assert.match(screen, /paddingBottom: insets\.bottom \+ 116/);
});
