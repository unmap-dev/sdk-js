import { ThemeError, validateTheme } from "./validate";
import type { ThemeDoc } from "./doc";
import { decodePreset, encodePreset, isThemePresetCode } from "./preset";

/**
 * The compact theme code: `ut1.` + base64url(deflate(minified JSON)).
 *
 * Web-standard streams only (CompressionStream/DecompressionStream, Blob, btoa/atob) so the
 * same module runs in Workers, browsers and Node 18+. `deflate` (zlib) rather than
 * `deflate-raw`, which Node 20 — the repo floor — does not implement; the wrapper costs six
 * bytes and buys a checksum.
 *
 * `ut1` is the wire version. A breaking change to the document format bumps it, and the decoder
 * reads the current prefix only.
 */

export const THEME_CODE_PREFIX = "ut1.";
export const MAX_CODE_LENGTH = 4096;
const MAX_JSON_BYTES = 16 * 1024;

/** Drain a stream into one buffer, refusing to grow past `cap` (the zip-bomb guard). */
async function pump(stream: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      // Cancelling releases the underlying decompressor before we throw.
      await reader.cancel().catch(() => {});
      throw new ThemeError("invalid theme", ["theme document too large"]);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

const toB64url = (b: Uint8Array): string => {
  let bin = "";
  // Chunked: String.fromCharCode(...whole) overflows the argument limit on large arrays.
  for (let i = 0; i < b.length; i += 0x8000) {
    bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  }
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function through(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
  cap: number,
): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return pump(stream, cap);
}

/**
 * Validate and encode a theme document. Curated/simple themes — a style, a named preset or
 * custom seeds, with or without layer groups hidden or reordered — become a short `u…` preset;
 * anything with hand-edited colours is `ut1.` + deflate. Throws `ThemeError`.
 */
export async function encodeTheme(doc: ThemeDoc): Promise<string> {
  const valid = validateTheme(doc);
  const preset = encodePreset(valid);
  if (preset) return preset;
  const json = new TextEncoder().encode(JSON.stringify(valid));
  const packed = await through(json, new CompressionStream("deflate"), Number.POSITIVE_INFINITY);
  const code = THEME_CODE_PREFIX + toB64url(packed);
  if (code.length > MAX_CODE_LENGTH) {
    throw new ThemeError("invalid theme", [
      `encoded theme exceeds ${MAX_CODE_LENGTH} characters`,
    ]);
  }
  return code;
}

/** Decode and validate a compact theme code (`u…` preset or `ut1.` document). Every failure lands as `ThemeError`. */
export async function decodeTheme(code: string): Promise<ThemeDoc> {
  if (code.length > MAX_CODE_LENGTH) {
    throw new ThemeError("invalid theme", [`code exceeds ${MAX_CODE_LENGTH} characters`]);
  }
  if (code.startsWith(THEME_CODE_PREFIX)) {
    return decodeDeflate(code);
  }
  if (isThemePresetCode(code)) {
    return validateTheme(decodePreset(code));
  }
  throw new ThemeError("invalid theme", [
    `code must start with "${THEME_CODE_PREFIX}" or be a short preset`,
  ]);
}

async function decodeDeflate(code: string): Promise<ThemeDoc> {
  let bytes: Uint8Array;
  try {
    const packed = fromB64url(code.slice(THEME_CODE_PREFIX.length));
    bytes = await through(packed, new DecompressionStream("deflate"), MAX_JSON_BYTES);
  } catch (e) {
    if (e instanceof ThemeError) throw e;
    throw new ThemeError("invalid theme", ["code is not valid base64url deflate data"]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ThemeError("invalid theme", ["decoded payload is not JSON"]);
  }
  return validateTheme(parsed);
}
