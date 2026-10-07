const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(mod, mod.exports);
  return mod.exports;
}
const { classifyWebsiteSection, classifyWebsiteAction, composeWebsiteSections, extractWebsiteDesign, websiteContentLinks, presentWebsiteSurface, websiteCopy, websiteNeedsBrowser } = load('../../supabase/functions/analyze-realtor-build/websiteDesign.ts');
const home = fs.readFileSync(path.resolve(__dirname, '../components/themes/WebsiteHome.tsx'), 'utf8');

test('native features are not turned into extra pages', () => {
  const found = [
    ['Featured Listings', 'A grid of homes.'],
    ['Property Search', ''],
    ['Saved homes', ''],
    ['Contact Us', '123 Main Street Kellogg'],
    ['Stay In Touch', 'Facebook and email'],
    ['Chat with Cindy', ''],
    ['Explore more', ''],
    ['About Us', 'Cindy Carlson has served Silver Valley buyers for twenty years and knows every neighborhood.'],
    ['About The Area', 'The Silver Valley is a string of historic towns along the river, with trails and local shops.'],
  ].map(([title, body]) => ({ kind: 'content', title, body }));
  const composed = composeWebsiteSections(found);
  const row = title => composed.find(section => section.title === title);
  assert.equal(row('Featured Listings').destination, 'native');
  assert.equal(row('Featured Listings').native, 'listings');
  assert.equal(row('Property Search'), undefined);
  assert.equal(row('Saved homes').native, 'saved');
  assert.equal(row('Contact Us').native, 'profile');
  assert.equal(row('Stay In Touch'), undefined);
  assert.equal(row('Chat with Cindy'), undefined);
  assert.equal(row('Explore more'), undefined);
  assert.equal(row('About Us').destination, 'unique');
  assert.equal(row('About The Area').destination, 'unique');
  assert.equal(row('About The Area').intent, 'area');
});

test('ordinary contact copy is not a chat product', () => {
  const contact = classifyWebsiteSection('Contact Us', 'Call 208-555-0100 or email cindy@example.com');
  assert.equal(contact.intent, 'contact');
  assert.equal(contact.destination, 'native');
  assert.notEqual(contact.destination, 'unique');
});

test('the website home does not invent duplicate chat or explore destinations', () => {
  assert.doesNotMatch(home, /Explore more/);
  assert.doesNotMatch(home, /Start a conversation/);
  assert.doesNotMatch(home, /Chat with /);
  assert.match(home, /presentWebsiteSection/);
  assert.match(home, /destination === 'unique'/);
});

test('a simple brokerage page keeps area copy and folds listings and contact into native destinations', () => {
  const html = `<html><body>
    <h1>Cindy Carlson Realty</h1>
    <h2>Featured Listings</h2><p>See the homes currently on the market.</p>
    <h2>Property Search</h2><p>Search the MLS.</p>
    <h2>About The Area</h2><p>The Silver Valley is a string of historic towns along the river, with trails and local shops worth a day.</p>
    <h2>About Us</h2><p>Our team lives here and works with buyers and sellers across Kellogg and Wallace.</p>
    <h2>Contact Us</h2><p>Office address, phone, and email.</p>
    <h2>Stay In Touch</h2><p>Social links.</p>
  </body></html>`;
  const design = extractWebsiteDesign(html, 'https://cindycarlsonrealty.com/');
  const map = Object.fromEntries(design.sections.map(section => [section.title, `${section.intent}:${section.destination}${section.native ? ':' + section.native : ''}`]));
  assert.equal(map['Featured Listings'], 'listings:native:listings');
  assert.equal(map['Property Search'], undefined);
  assert.equal(map['About The Area'], 'area:unique');
  assert.equal(map['About Us'], 'profile:unique');
  assert.equal(map['Contact Us'], 'contact:native:profile');
  assert.equal(map['Stay In Touch'], undefined);
});

test('resource titles that merely contain ask are not chat, and an address block is not a page', () => {
  const guide = classifyWebsiteSection('4 Questions to Ask Before Buying a Home', 'A short guide for buyers comparing neighborhoods and schools before they write an offer.');
  assert.notEqual(guide.intent, 'contact');
  assert.equal(classifyWebsiteSection('We are located at:', '123 Main Street, Kellogg, Idaho').native, 'profile');
  assert.equal(classifyWebsiteSection('Chat with Cindy', '').destination, 'native');
  assert.equal(classifyWebsiteSection('Message your realtor', 'Start a conversation').destination, 'native');
  assert.notEqual(classifyWebsiteSection('Start a conversation', '').destination, 'unique');
  assert.equal(classifyWebsiteSection('Explore more', 'Read more about this page and then click here.').destination, 'omit');
});

test('equivalent contact and explore actions collapse onto native destinations', () => {
  const actions = [
    ['Explore more', 'https://example.com/'],
    ['Learn more', 'https://example.com/about'],
    ['Read more', 'https://example.com/blog/post'],
    ['View More', 'https://example.com/properties/'],
    ['Chat with Cindy', 'https://example.com/contact'],
    ['Message your realtor', 'https://example.com/contact'],
    ['Start a conversation', 'https://example.com/contact'],
    ['Contact Us', 'https://example.com/contact/'],
    ['Featured Listings', 'https://example.com/featured-listings/'],
    ['About The Area', 'https://example.com/about-the-area/'],
  ].map(([label, href]) => ({ label, ...classifyWebsiteAction(label, href) }));
  assert.equal(actions.filter(item => item.destination === 'unique').length, 0);
  assert.equal(actions.find(item => item.label === 'View More').native, 'listings');
  assert.equal(actions.find(item => item.label === 'Featured Listings').native, 'listings');
  assert.equal(actions.find(item => item.label === 'Contact Us').native, 'profile');
  assert.equal(actions.find(item => item.label === 'Explore more').destination, 'omit');
  const composed = composeWebsiteSections(actions.map(item => ({ kind: 'content', title: item.label, body: item.label === 'About The Area' ? 'The Silver Valley is a string of historic towns along the river, with trails and local shops worth a day.' : '' })));
  assert.equal(composed.filter(section => section.destination === 'unique').length, 1);
  assert.equal(composed.find(section => section.destination === 'unique').intent, 'area');
  assert.equal(composed.filter(section => section.intent === 'contact').length, 1);
  assert.equal(composed.filter(section => section.intent === 'listings').length, 1);
  assert.equal(composed.some(section => section.destination === 'unique' && /explore|chat with|message your|start a conversation/i.test(section.title)), false);
});

test('a learn-more button that points at area or about is read once, not titled explore', () => {
  const html = `<nav>
    <a href="/featured-listings/">Explore more</a>
    <a href="/about-the-area/">Learn more</a>
    <a href="/about-us/">Read more</a>
    <a href="/contact/">Chat with Cindy</a>
    <a href="/contact/">Message your realtor</a>
  </nav>`;
  const links = websiteContentLinks(html, 'https://cindycarlsonrealty.com/');
  assert.deepEqual(links.map(link => [link.title, link.intent]), [['About the area', 'area'], ['About', 'profile']]);
});

test('a profile card starts on the bio, not the phone line', () => {
  const copy = websiteCopy('Cell Phone (208) 512-0078 | Email: cindy@cindycarlsonrealty.com Member of the local association. Cindy Carlson is a long time Silver Valley broker who raised her family in Kellogg and still works there.');
  assert.match(copy, /^Cindy Carlson/);
  assert.doesNotMatch(copy, /512-0078/);
});

test('brand color is not used as the reading surface', () => {
  const surface = presentWebsiteSurface('#990303', '#990303', '#ffffff');
  assert.notEqual(surface.background, surface.accent);
  assert.equal(surface.ink, '#15191d');
});

test('about and area links are readable pages; contact and listings are not', () => {
  const html = `<nav>
    <a href="/featured-listings/">Featured Listings</a>
    <a href="/about-the-area/">About The Area</a>
    <a href="/about-us/">About Us</a>
    <a href="/contact/">Contact Us</a>
    <a href="https://facebook.com/cindy">Facebook</a>
  </nav>`;
  const links = websiteContentLinks(html, 'https://cindycarlsonrealty.com/');
  assert.deepEqual(links.map(link => [link.title, link.intent]), [['About The Area', 'area'], ['About Us', 'profile']]);
});

function cards(design) {
  return design.sections.filter(section => section.destination === 'unique').map(section => section.title);
}
function canonicals(design, render) {
  return design.evidence.routing.filter(route => route.render === render).map(route => route.canonical);
}

test('six brokerage patterns collapse to one native destination and keep only real copy', () => {
  const area = 'The Silver Valley is a string of historic towns along the river, with trails and local shops worth a full day.';
  const bio = 'Cindy Carlson has served Silver Valley buyers and sellers for more than twenty years and still lives in Kellogg.';
  const cases = [
    {
      name: 'cindy',
      html: `<html><head><style>body{background:#990303;color:#ffffff}a{color:#990303}</style></head><body>
        <nav class="nav-primary"><a href="/">Home</a><a href="/featured-listings/">Featured Listings</a><a href="/property-search/">Property Search</a>
        <a href="/about-the-area/">About The Area</a><a href="/about-us/">About Us</a><a href="/contact-us/">Contact Us</a>
        <a href="https://facebook.com/cindy">Facebook</a><a href="/wp-login.php">Log in</a>
        <a href="/chat">Chat with Cindy</a><a href="/contact-us/">Message your realtor</a><a href="/explore">Explore more</a></nav>
        <h1>Welcome To Cindy Carlson Realty</h1>
        <h2>Home</h2><p>Home Featured Listings Property Search About The Area About Us Contact Us</p>
        <h2>Primary Sidebar</h2><p>Widgets and feeds and menus and links and nothing else worth reading here.</p>
        <h2>Stay In Touch</h2><p>Facebook and the office email.</p>
        <h2>Property Search</h2><p>Featured Listings and more listings.</p>
        <h2>We are located at:</h2><p>202 W Cameron Avenue Kellogg, ID 83837 Office: (208) 783-2544</p>
        <h2>Facebook Feed</h2><p>Copyright and comments and a long widget that should never become an article in the app.</p>
        <h2>Chat with Cindy</h2><p>Start a conversation with the office.</p>
        <h2>Explore more</h2><p>Click here for another copy of the menu.</p>
        <h2>About Us</h2><p>Cell Phone (208) 512-0078. ${bio}</p>
        <h2>About The Area</h2><p>${area}</p>
        <h2>Account verification in progress</h2><p>Please wait. Verify your email address in order to log in to your account. The page will reload automatically.</p>
      </body></html>`,
      cards: ['About Us', 'About The Area'],
      absent: /home|sidebar|facebook|chat with|explore more|property search|stay in touch|contact|log in|message your|account verification/i,
    },
    {
      name: 'sparks',
      html: `<body>
        <h2>Featured Listings</h2><p>A grid of homes.</p><h2>Property Search</h2><p>Search the market.</p>
        <h2>Top Areas</h2><p>Coeur d'Alene, Post Falls, Hayden, Rathdrum, Sandpoint, Spirit Lake.</p>
        <h2>About Susan</h2><p>Susan has guided North Idaho buyers for two decades and knows the neighborhoods street by street.</p>
        <h2>What clients say</h2><p>Clients describe patient guidance, clear pricing advice, and a calm closing from offer to keys.</p>
        <a href="/blog/post">Learn more</a><a href="/blog/post">Read more</a><a href="/signin">Sign in</a><a href="/calculators/mortgage">Calculate Mortgage</a>
        <h2>Learn more</h2><p>Read more</p><h2>Sign in</h2><h2>Mortgage Calculator</h2><h2>Get in touch</h2><p>Call the office.</p>
      </body>`,
      cards: ['About Susan', 'What clients say'],
      absent: /top areas|learn more|read more|sign in|mortgage|featured|property search|get in touch/i,
    },
    {
      name: 'houses',
      html: `<body>
        <h2>Home</h2><p>Home Featured Listings Contact Us Blog Explore more</p>
        <h2>Featured Listings</h2><p>See the homes.</p>
        <h2>Communities</h2><p>Each community along the water has its own downtown, schools, and weekend market that buyers ask about first.</p>
        <h2>Blog</h2><p>An empty list of posts with no article under the heading.</p>
        <h2>How to choose a waterfront street</h2><p>Buyers comparing waterfront streets should walk them at midday and again at dusk before they write an offer.</p>
        <h2>Refine Results</h2><h2>Get Alerts</h2><h2>Calculate Mortgage</h2><h2>Explore more</h2><h2>Contact Us</h2><h2>Email Us</h2>
      </body>`,
      cards: ['Communities', 'How to choose a waterfront street'],
      absent: /^(?:home|blog|featured|refine|alerts|mortgage|explore|contact|email)/i,
    },
    {
      name: 'powers',
      html: `<body style="background:#990303;color:#990303">
        <h2>A quieter way to see the estates</h2><p>The luxury collection is a quieter way to see estates, acreage, and waterfront homes without paging through the entire market.</p>
        <h2>Services</h2><p>The team advises buyers and sellers through pricing, preparation, and negotiation, then stays available through closing.</p>
        <h2>Counties</h2><p>The practice covers several counties, and each one has a different pace, shoreline, and second-home market worth knowing.</p>
        <a href="/properties/">View More</a><a href="/privacy">Privacy</a><a href="/admin">Admin</a><a href="/sitemap">Sitemap</a><a href="/contact">Contact</a>
        <h2>View More</h2><p>$900,000 4 beds 3 baths and another grid of listings.</p>
        <h2>Privacy</h2><h2>Admin</h2><h2>Sitemap</h2><h2>Contact</h2>
      </body>`,
      cards: ['A quieter way to see the estates', 'Services', 'Counties'],
      absent: /view more|privacy|admin|sitemap|contact/i,
    },
    {
      name: 'brenda',
      html: `<body>
        <h2>Featured areas</h2><p>The island neighborhoods are walkable, and buyers usually start with the villages that still have a working harbor.</p>
        <h2>Meet Brenda</h2><p>Brenda has sold coastal homes for eighteen years and still meets clients in the same harbor town where she grew up.</p>
        <h2>Our Listings</h2><p>See the homes.</p><h2>More Listings</h2><p>See more of the same homes.</p>
        <h2>Phone</h2><p>(555) 201-1000</p><h2>Contact</h2><p>Write the office.</p>
        <h2>What's Your Home Really Worth?</h2><p>A valid address is required to continue. Step 1 Enter Property Address. Step 2 Property Details. Powered by Lofty.</p>
        <h2>TEAM LEADER</h2><p>Brenda has sold coastal homes for eighteen years and still meets clients in the same harbor town where she grew up.</p>
        <h2>Chat with Brenda</h2><h2>Message your realtor</h2><h2>Start a conversation</h2>
      </body>`,
      cards: ['Featured areas', 'Meet Brenda'],
      absent: /listings|phone|contact|chat with|message your|start a conversation|home really worth|team leader/i,
    },
    {
      name: 'leatherman',
      html: `<body>
        <h2>Nassau County</h2><p>Nassau County communities mix harbor towns and tree streets, and families tend to choose a village before they choose a house.</p>
        <h2>Meet the agents</h2><p>The agents live in the county they sell, and they split showings so someone local is always available on a weekend.</p>
        <h2>Buy</h2><p>Buying here starts with a village, then a school street, then a house that can be walked to the station on a winter morning.</p>
        <h2>Sell</h2><p>Selling starts with pricing against the last six harbor sales, then preparing the house before it is photographed.</p>
        <h2>We love working with sellers and look forward to sharing our home-selling plan with you!</h2><p>Submit Please enter valid address. Copyright 2026. All Rights Reserved.</p>
        <h2>Learn More</h2><p>Buying here starts with a village, then a school street, then a house that can be walked to the station on a winter morning.</p>
        <h2>Featured Listings</h2><h2>More Listings</h2>
        <h2>Get more information</h2><p>Call the office or send a note.</p>
        <a href="/buy/">Learn More</a><a href="/buy/">Learn More</a><a href="/featured-listings/">More Listings</a>
      </body>`,
      cards: ['Nassau County', 'Meet the agents', 'Buy', 'Sell'],
      absent: /learn more|featured|more listings|get more information|valid address|we love working/i,
    },
  ];
  for (const sample of cases) {
    const design = extractWebsiteDesign(sample.html, `https://${sample.name}.example/`);
    const titles = cards(design);
    assert.deepEqual(titles, sample.cards, sample.name);
    assert.equal(new Set(titles).size, titles.length, sample.name);
    assert.ok(titles.every(title => !sample.absent.test(title)), `${sample.name} ${titles.join(' | ')}`);
    assert.equal(canonicals(design, 'native').filter(item => item === 'listings').length, 1, sample.name);
    assert.ok(canonicals(design, 'native').includes('profile'), sample.name);
    assert.equal(design.sections.filter(section => section.destination === 'unique' && section.intent === 'contact').length, 0, sample.name);
    const surface = presentWebsiteSurface(design.original.background, design.original.accent, design.original.ink);
    assert.notEqual(surface.background, surface.accent, sample.name);
    assert.notEqual(surface.ink.toLowerCase(), surface.background.toLowerCase(), sample.name);
  }
  const cindy = cases[0];
  const cindyDesign = extractWebsiteDesign(cindy.html, 'https://cindy.example/');
  const about = cindyDesign.sections.find(section => section.title === 'About Us');
  assert.match(about.body, /Cindy Carlson/);
  assert.doesNotMatch(about.body, /512-0078/);
  assert.ok(canonicals(cindyDesign, 'native').includes('chat'));
  assert.equal(canonicals(cindyDesign, 'native').filter(item => item === 'listings').length, 1);
  assert.equal(websiteContentLinks(cindy.html, 'https://cindy.example/').map(link => link.intent).join(','), 'area,profile');
});

test('a linked place name stays an area card and a platform tagline is not the hero', () => {
  const area = 'The Silver Valley is a string of historic towns along the river, with trails and local shops worth a full day.';
  const composed = composeWebsiteSections([{ kind: 'content', title: "North Idaho's Silver Valley", body: area, intent: 'area', destination: 'unique' }]);
  assert.equal(composed[0].intent, 'area');
  assert.equal(composed[0].destination, 'unique');
  const design = extractWebsiteDesign('<html><head><meta name="description" content="A real estate website you\'ll love creating. No code necessary. Get started with the Newbury design. 30-day Free Trial."></head><body><h1>Susan Sparks Watt</h1></body></html>', 'https://sparks.example/');
  assert.equal(design.heroSubtitle, '');
});

test('a block page contributes no hero and no cards', () => {
  const html = `<html><head><title>Attention Required! | Cloudflare</title></head><body>
    <h1>Sorry, you have been blocked</h1>
    <h2>Why have I been blocked?</h2><p>This website is using a security service to protect itself from online attacks. The action you just performed triggered the security solution.</p>
    <div class="cf-wrapper">Cloudflare</div></body></html>`;
  const design = extractWebsiteDesign(html, 'https://houseswa.com/');
  assert.equal(design.heroTitle, '');
  assert.equal(design.heroSubtitle, '');
  assert.deepEqual(design.sections, []);
  assert.match(design.evidence.warnings.join(' '), /blocked/i);
});

test('article display keeps the strongest few after a wider discovery pass', () => {
  const prose = (name, words) => `${name} explains how buyers compare streets, schools, and timing before they write an offer. ${words}`;
  const composed = composeWebsiteSections([
    { kind: 'content', title: 'Menu leftover', body: 'Home listings search about', intent: 'content', destination: 'unique' },
    { kind: 'content', title: 'About Susan', body: 'Susan has guided North Idaho buyers for two decades and knows the neighborhoods street by street.', intent: 'profile', destination: 'unique' },
    { kind: 'content', title: 'First essay', body: prose('The first essay', 'It is specific enough to keep.'), intent: 'content', destination: 'unique' },
    { kind: 'content', title: 'Second essay', body: prose('The second essay', 'It is also specific enough to keep.'), intent: 'content', destination: 'unique' },
    { kind: 'content', title: 'Third essay', body: prose('The third essay', 'Staging, pricing, and photography still belong in the discovery set.'), intent: 'content', destination: 'unique' },
    { kind: 'content', title: 'Fourth essay', body: 'Too thin.', intent: 'content', destination: 'unique' },
    { kind: 'content', title: 'Clients love', body: 'Clients describe patient guidance, clear pricing advice, and a calm closing from offer to keys.', intent: 'testimonials', destination: 'unique' },
  ]);
  const titles = composed.filter(section => section.destination === 'unique').map(section => section.title);
  assert.deepEqual(titles, ['About Susan', 'First essay', 'Second essay', 'Third essay', 'Clients love']);
});

test('browser fallback is only for a block or a client shell without prose', () => {
  const unique = { heroTitle: '', sections: [{ destination: 'unique' }] };
  const empty = { heroTitle: '', sections: [] };
  assert.equal(websiteNeedsBrowser('<script src="https://cdn.chime.me/app.js"></script>', unique), null);
  assert.equal(websiteNeedsBrowser('<h1>Welcome</h1><p>A static brokerage page.</p>', { heroTitle: 'Welcome', sections: [] }), null);
  assert.equal(websiteNeedsBrowser('<script src="https://static.chimeroi.com/app.js"></script><div id="root"></div>', empty), 'client-shell-without-prose');
  assert.equal(websiteNeedsBrowser('<div id="app"></div><script src="/client.js"></script>', empty), 'client-shell-without-prose');
  assert.equal(websiteNeedsBrowser('<html><head><title>Just a moment...</title></head><body>checking</body></html>', { heroTitle: 'Just a moment...', sections: [{ destination: 'unique' }] }), 'access-interstitial');
  assert.equal(websiteNeedsBrowser('<html><head><title>Client Challenge</title></head></html>', empty), 'access-interstitial');
});

test('the production bundle embeds the semantic design engine', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/websiteDesign.ts'), 'utf8').replace(/^export /gm, '');
  const bundle = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/deploy.bundle.ts'), 'utf8');
  assert.ok(bundle.includes(source), 'production bundle drifted from websiteDesign.ts');
  assert.match(bundle, /composeWebsiteSections\(\[\.\.\.linked, \.\.\.design\.sections\]\)/);
});

test('a captured brokerage homepage does not turn its menu into cards', () => {
  const captured = path.resolve(__dirname, 'fixtures/listing-compatibility/cindy-carlson-1791176729259.json');
  if (!fs.existsSync(captured)) return;
  const page = JSON.parse(fs.readFileSync(captured, 'utf8')).pages[0];
  const design = extractWebsiteDesign(page.html, page.finalUrl || page.url);
  const titles = cards(design);
  assert.ok(titles.every(title => !/sidebar|facebook|property search|stay in touch|log in|explore more|chat with|contact us/i.test(title)), titles.join(' | '));
  assert.equal(canonicals(design, 'native').filter(item => item === 'listings').length, 1);
  assert.ok(canonicals(design, 'native').includes('profile'));
  assert.equal(design.original.background.toLowerCase(), '#f6f3ee');
  assert.notEqual(design.original.background.toLowerCase(), design.original.accent.toLowerCase());
});

