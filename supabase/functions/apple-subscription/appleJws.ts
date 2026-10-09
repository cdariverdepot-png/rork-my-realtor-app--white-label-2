/**
 * Verifies Apple-signed JWS values (StoreKit 2 transactions, renewal info and App Store Server
 * Notifications V2) with WebCrypto only, so it runs unchanged in Deno and Node.
 *
 * Checks, in order: ES256 header with a three-certificate x5c chain; the chain root matches a
 * pinned Apple Root CA fingerprint; each certificate is signed by the next; certificates are
 * valid at the signing date; the leaf and intermediate carry Apple's marker extensions; and the
 * JWS signature verifies with the leaf key. Returns the decoded payload only when all pass.
 */

/** Apple Root CA - G3 (ECDSA P-384, expires 2039-04-30). Source: support.apple.com/en-us/126047. */
export const APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

const LEAF_MARKER = "1.2.840.113635.100.6.11.1";
const INTERMEDIATE_MARKER = "1.2.840.113635.100.6.2.1";

/** Typed-array → BufferSource for WebCrypto across TS lib versions. */
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

type Tlv = { tag: number; start: number; contentStart: number; end: number };

function readTlv(der: Uint8Array, offset: number): Tlv {
  const tag = der[offset];
  let length = der[offset + 1];
  let contentStart = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count < 1 || count > 4) throw new Error("Unsupported DER length");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + der[offset + 2 + i];
    contentStart += count;
  }
  const end = contentStart + length;
  if (end > der.length) throw new Error("Truncated DER");
  return { tag, start: offset, contentStart, end };
}

function children(der: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let at = parent.contentStart; at < parent.end;) { const t = readTlv(der, at); out.push(t); at = t.end; }
  return out;
}

export function encodeOid(oid: string): Uint8Array {
  const parts = oid.split(".").map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const stack = [part & 0x7f];
    for (let v = part >>> 7; v > 0; v >>>= 7) stack.unshift((v & 0x7f) | 0x80);
    bytes.push(...stack);
  }
  return new Uint8Array(bytes);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function containsOidTlv(der: Uint8Array, region: Tlv, oid: string): boolean {
  const body = encodeOid(oid);
  const needle = new Uint8Array([0x06, body.length, ...body]);
  outer: for (let i = region.contentStart; i <= region.end - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (der[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

const P256 = encodeOid("1.2.840.10045.3.1.7");
const P384 = encodeOid("1.3.132.0.34");
const ECDSA_SHA256 = encodeOid("1.2.840.10045.4.3.2");
const ECDSA_SHA384 = encodeOid("1.2.840.10045.4.3.3");

function parseTime(der: Uint8Array, t: Tlv): number {
  const s = new TextDecoder().decode(der.slice(t.contentStart, t.end));
  const full = t.tag === 0x17 ? (Number(s.slice(0, 2)) < 50 ? "20" : "19") + s : s; // UTCTime vs GeneralizedTime
  return Date.UTC(+full.slice(0, 4), +full.slice(4, 6) - 1, +full.slice(6, 8), +full.slice(8, 10), +full.slice(10, 12), +full.slice(12, 14));
}

export type ParsedCertificate = {
  der: Uint8Array; tbs: Uint8Array; signature: Uint8Array; hash: "SHA-256" | "SHA-384";
  spki: Uint8Array; curve: "P-256" | "P-384"; notBefore: number; notAfter: number; extensions: Tlv | null;
};

export function parseCertificate(der: Uint8Array): ParsedCertificate {
  const cert = readTlv(der, 0);
  const [tbsTlv, algTlv, sigTlv] = children(der, cert);
  if (!tbsTlv || !algTlv || !sigTlv || sigTlv.tag !== 0x03) throw new Error("Invalid certificate");
  const algOid = children(der, algTlv)[0];
  const algBytes = der.slice(algOid.contentStart, algOid.end);
  const hash = sameBytes(algBytes, ECDSA_SHA256) ? "SHA-256" : sameBytes(algBytes, ECDSA_SHA384) ? "SHA-384" : null;
  if (!hash) throw new Error("Unsupported certificate signature algorithm");
  const fields = children(der, tbsTlv);
  const offset = fields[0].tag === 0xa0 ? 1 : 0; // explicit version
  const validity = children(der, fields[offset + 3]);
  const spkiTlv = fields[offset + 5];
  const spkiAlg = children(der, children(der, spkiTlv)[0]);
  const curveBytes = der.slice(spkiAlg[1].contentStart, spkiAlg[1].end);
  const curve = sameBytes(curveBytes, P256) ? "P-256" : sameBytes(curveBytes, P384) ? "P-384" : null;
  if (!curve) throw new Error("Unsupported certificate key");
  return {
    der, tbs: der.slice(tbsTlv.start, tbsTlv.end), signature: der.slice(sigTlv.contentStart + 1, sigTlv.end), hash,
    spki: der.slice(spkiTlv.start, spkiTlv.end), curve, notBefore: parseTime(der, validity[0]), notAfter: parseTime(der, validity[1]),
    extensions: fields.find((f) => f.tag === 0xa3) ?? null,
  };
}

/** DER ECDSA signature (SEQUENCE of two INTEGERs) → IEEE P1363 r||s for WebCrypto. */
function derSignatureToRaw(sig: Uint8Array, size: number): Uint8Array {
  const seq = readTlv(sig, 0);
  const [r, s] = children(sig, seq);
  const out = new Uint8Array(size * 2);
  for (const [i, part] of [r, s].entries()) {
    let bytes = sig.slice(part.contentStart, part.end);
    while (bytes.length > size && bytes[0] === 0) bytes = bytes.slice(1);
    if (bytes.length > size) throw new Error("Invalid signature");
    out.set(bytes, i * size + (size - bytes.length));
  }
  return out;
}

async function importKey(cert: ParsedCertificate): Promise<CryptoKey> {
  return await crypto.subtle.importKey("spki", buf(cert.spki), { name: "ECDSA", namedCurve: cert.curve }, false, ["verify"]);
}

async function signedBy(child: ParsedCertificate, issuer: ParsedCertificate): Promise<boolean> {
  const size = issuer.curve === "P-256" ? 32 : 48;
  return await crypto.subtle.verify({ name: "ECDSA", hash: child.hash }, await importKey(issuer), buf(derSignatureToRaw(child.signature, size)), buf(child.tbs));
}

function base64ToBytes(value: string): Uint8Array {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buf(bytes)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type VerifyOptions = { rootFingerprints?: string[]; now?: number };

export async function verifyAppleJws<T = Record<string, unknown>>(jws: string, options: VerifyOptions = {}): Promise<T> {
  if (typeof jws !== "string" || jws.length > 50_000) throw new Error("Invalid signed value");
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid signed value");
  const header = JSON.parse(new TextDecoder().decode(base64ToBytes(parts[0])));
  if (header?.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error("Unexpected signing header");
  const [leaf, intermediate, root] = header.x5c.map((c: string) => parseCertificate(base64ToBytes(c)));
  const pinned = (options.rootFingerprints ?? [APPLE_ROOT_CA_G3_SHA256]).map((f) => f.toLowerCase().replace(/[^0-9a-f]/g, ""));
  if (!pinned.includes(await sha256Hex(root.der))) throw new Error("Untrusted root certificate");
  if (!(await signedBy(leaf, intermediate)) || !(await signedBy(intermediate, root))) throw new Error("Invalid certificate chain");
  if (!leaf.extensions || !containsOidTlv(leaf.der, leaf.extensions, LEAF_MARKER)) throw new Error("Not an App Store signing certificate");
  if (!intermediate.extensions || !containsOidTlv(intermediate.der, intermediate.extensions, INTERMEDIATE_MARKER)) throw new Error("Not an Apple intermediate certificate");
  const payload = JSON.parse(new TextDecoder().decode(base64ToBytes(parts[1])));
  const at = typeof payload?.signedDate === "number" ? payload.signedDate : options.now ?? Date.now();
  for (const c of [leaf, intermediate, root]) if (at < c.notBefore || at > c.notAfter) throw new Error("Certificate not valid at signing time");
  if (leaf.curve !== "P-256") throw new Error("Unexpected leaf key");
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await importKey(leaf), buf(base64ToBytes(parts[2])), buf(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)));
  if (!ok) throw new Error("Invalid signature");
  return payload as T;
}
