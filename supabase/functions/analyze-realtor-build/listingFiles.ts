import type { DiscoveredListing } from "./listingDiscovery.ts";

const text = (value: unknown, max = 1200) => typeof value === "string"
  ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const number = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const publicUrl = (value: unknown) => {
  try {
    const url = new URL(text(value, 2048));
    if (url.protocol !== "https:" || url.username || url.password ||
      url.hostname === "localhost" || /\.(?:local|internal)$/.test(url.hostname) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(":")) return "";
    return url.toString();
  } catch { return ""; }
};

export function listingFromFileRecord(record: Record<string, unknown>): DiscoveredListing | null {
  const title = text(record.title, 160);
  if (!title) return null;
  const price = number(record.price);
  const neighborhood = text(record.neighborhood, 160);
  const images = (Array.isArray(record.images) ? record.images : []).map(publicUrl).filter(Boolean).slice(0, 12);
  const sourceUrl = publicUrl(record.sourceUrl);
  const listingId = text(record.listingId, 100);
  // A report is provenance, not an invented public property URL. Stable identities
  // let reordered/re-uploaded reports update the same properties.
  const importKey = `report:${listingId}|${title}|${neighborhood}`.toLowerCase();
  return { title, description: text(record.description), price: price ? `$${price.toLocaleString("en-US")}` : "",
    beds: number(record.beds), baths: number(record.baths), sqft: number(record.sqft) ? number(record.sqft).toLocaleString("en-US") : "",
    neighborhood, images, image: images[0] ?? "", sourceUrl, importKey };
}

/** RFC-style quoted CSV, including embedded commas/newlines and common MLS delimiters. */
export function parseListingCsv(csv: string): DiscoveredListing[] {
  csv = csv.replace(/^\uFEFF/, "");
  const firstLine = csv.split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i <= csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === delimiter || ch === "\n" || ch === undefined)) {
      row.push(cell.replace(/\r$/, "")); cell = "";
      if (ch !== delimiter) { if (row.some(v => v.trim())) rows.push(row); row = []; }
      if (rows.length > 1001) throw new Error("Please export 1,000 or fewer listing rows per file.");
    } else cell += ch ?? "";
  }
  if (quoted) throw new Error("This CSV has an unfinished quoted field. Export it again and retry.");
  if (rows.length < 2) return [];
  const headers = rows.shift()!.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!headers.some(h => ["listprice", "currentprice", "price", "askingprice", "listingid", "listingkey", "mlsnumber", "mls", "mlsid"].includes(h))) {
    throw new Error("This CSV does not look like a listing export. Include property addresses, prices or MLS numbers; contact lists use a separate importer.");
  }
  const found: DiscoveredListing[] = [];
  for (const values of rows) {
    const field = (...names: string[]) => {
      for (const name of names) {
        const index = headers.indexOf(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
        if (index >= 0 && values[index]?.trim()) return values[index].trim();
      }
      return "";
    };
    const title = field("StreetAddress", "UnparsedAddress", "Address", "AddressLine1", "PropertyAddress") ||
      [field("StreetNumber"), field("StreetDirPrefix"), field("StreetName"), field("StreetSuffix"), field("StreetDirSuffix")].filter(Boolean).join(" ");
    // Contact exports cannot become properties; a real address column is required.
    if (!title) continue;
    const rawImages = field("PhotoURLs", "Photos", "ImageURLs", "PhotoURL", "PrimaryPhotoURL", "ImageURL");
    let images: unknown[] = [];
    try { const parsed = JSON.parse(rawImages); if (Array.isArray(parsed)) images = parsed; } catch { images = rawImages.split(/[|;]/); }
    const item = listingFromFileRecord({ title,
      listingId: field("ListingId", "ListingKey", "MLSNumber", "MLS#", "MLSID"),
      price: field("ListPrice", "CurrentPrice", "Price", "AskingPrice"),
      beds: field("BedroomsTotal", "BedsTotal", "Bedrooms", "Beds"),
      baths: field("BathroomsTotalInteger", "BathroomsTotalDecimal", "BathsTotal", "Bathrooms", "Baths"),
      sqft: field("LivingArea", "BuildingAreaTotal", "TotalSqFt", "SquareFeet", "SqFt"),
      neighborhood: [field("City", "AddressLocality"), field("StateOrProvince", "State", "AddressRegion")].filter(Boolean).join(", "),
      description: field("PublicRemarks", "PublicDescription", "Description"),
      images, sourceUrl: field("PublicURL", "ListingURL", "PropertyURL"),
    });
    if (!item) continue;
    // The export's own MLS number and status, as published; an unrecognized status is left unclaimed.
    const listingNumber = field("ListingId", "MLSNumber", "MLS#", "MLSID", "ListingKey");
    const status = field("StandardStatus", "MlsStatus", "ListingStatus", "Status");
    found.push({ ...item, ...(listingNumber ? { listingNumber: listingNumber.slice(0, 60) } : {}), ...(status ? { fileStatus: status.slice(0, 60) } : {}) } as DiscoveredListing);
  }
  return found;
}

export function validateFileListings(value: unknown, sourceIds: Set<string>): DiscoveredListing[] {
  if (!value || typeof value !== "object") throw new Error("The listing report could not be read. Try a PDF report or CSV export.");
  const records = (value as { listings?: unknown }).listings;
  if (!Array.isArray(records)) throw new Error("The listing report could not be read. Try a PDF report or CSV export.");
  return records.filter((record): record is Record<string, unknown> => !!record && typeof record === "object")
    .filter(record => sourceIds.has(String(record.sourceId)) && text(record.locator, 300))
    .map(listingFromFileRecord).filter((item): item is DiscoveredListing => !!item).slice(0, 100);
}

export function mergeFileListings(current: DiscoveredListing[], incoming: DiscoveredListing[]): DiscoveredListing[] {
  const records = new Map<string, DiscoveredListing>();
  for (const item of [...current, ...incoming]) records.set(item.sourceUrl || item.importKey || `${item.title}|${item.neighborhood}`, item);
  return [...records.values()];
}
