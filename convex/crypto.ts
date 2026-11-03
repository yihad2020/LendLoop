/** HMAC over `<unix-milliseconds>.<raw-json-body>` prevents payload tampering and replay. */
const encoder = new TextEncoder();
export async function signPayload(secret: string, timestamp: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${raw}`));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}
function hexBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
}
export function safeEqualHex(a: string, b: string): boolean {
  const aa = hexBytes(a), bb = hexBytes(b);
  if (!aa || !bb || aa.length !== bb.length) return false;
  let different = 0;
  for (let i = 0; i < aa.length; i++) different |= aa[i] ^ bb[i];
  return different === 0;
}
export async function verifyPayload(secret: string, timestamp: string | null, raw: string, signature: string | null): Promise<boolean> {
  if (!timestamp || !signature || !/^\d{13}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > 300_000) return false;
  const expected = await signPayload(secret, timestamp, raw);
  return safeEqualHex(expected, signature.replace(/^sha256=/, ""));
}
export async function verifyBearer(secret: string, authorization: string | null): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  const candidate = authorization.slice(7);
  // Compare fixed-length SHA-256 digests instead of leaking prefix differences.
  const digest = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s))),
    (b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqualHex(await digest(candidate), await digest(secret));
}
