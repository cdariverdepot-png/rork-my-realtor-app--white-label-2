// After a diagnostic run: what each site's throwaway account actually saved (read-only). Finds the
// guest realtor created inside the site's run window and reads its listings collection, so accuracy
// is judged from saved data rather than from streamed response bodies.
//   SUPABASE_ACCESS_TOKEN=... node scripts/diagnostic-saved-listings.cjs DIR
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const ref = process.env.SUPABASE_PROJECT_REF || 'xdcqjaodcvnlawqcunrr';
const query = async sql => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) }); // SELECT only
  if (!res.ok) throw Error(`query ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};
const iso = value => { const d = new Date(value); if (Number.isNaN(+d)) throw Error('bad time'); return d.toISOString(); };
(async () => {
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.saved.json'))) {
    const result = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!result.window) continue;
    const rows = await query(`select r.id, r.created_at,
        (select k.value from public.app_kv k where k.key = r.id::text || ':listings.v2') as listings,
        (select k.value from public.app_kv k where k.key = r.id::text || ':listing-sources.v1') as sources
      from public.realtors r where r.created_at between '${iso(result.window.startedAt)}' and '${iso(result.window.endedAt)}' order by r.created_at`);
    const saved = rows.map(row => ({ realtorId: row.id, createdAt: row.created_at, sources: row.sources?.sources ?? [],
      listings: (row.listings?.items ?? []).map(item => ({ title: item.title, price: item.price, status: item.status, sourceUrl: item.sourceUrl,
        photos: item.images?.length ?? 0, descriptionLength: item.description?.length ?? 0, detailsComplete: !!item.detailsComplete,
        detailAttempted: !!item.detailAttemptAt, facts: item.facts, beds: item.beds, baths: item.baths, sqft: item.sqft,
        listingOffice: item.listingOffice, ownership: item.ownership })) }));
    fs.writeFileSync(path.join(dir, file.replace('.json', '.saved.json')), JSON.stringify(saved, null, 2));
    console.log(file, saved.map(s => s.listings.length));
  }
})().catch(error => { console.error(error); process.exit(1); });
