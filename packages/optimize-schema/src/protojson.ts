/**
 * Protobuf JSON helpers for the GMPRO wire format.
 *
 * GMPRO speaks proto3 JSON: durations are strings like "300s", timestamps are RFC 3339 strings
 * (or the `{seconds, nanos}` object form some clients send), int64 values may arrive as decimal
 * strings, and field names may be lowerCamelCase or the original snake_case. Everything here is
 * pure and dependency-free so the gateway, the core translator and the docs share one reading.
 */

/** Thrown when a value is not valid protobuf JSON for the type asked for. */
export class ProtoJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtoJsonError";
  }
}

// google.protobuf.Duration and Timestamp ranges.
const MAX_DURATION_SECONDS = 315_576_000_000;
const MIN_TIMESTAMP_SECONDS = -62_135_596_800; // 0001-01-01T00:00:00Z
const MAX_TIMESTAMP_SECONDS = 253_402_300_799; // 9999-12-31T23:59:59Z

const DURATION = /^(-)?(\d+)(?:\.(\d{1,9}))?s$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([Zz]|([+-])(\d{2}):(\d{2}))$/;
const INT64 = /^-?\d+$/;

const fraction = (digits: string | undefined): number => (digits ? Number(`0.${digits}`) : 0);

/** Reads a protobuf duration string ("300s", "1.5s", "-2s") as seconds. */
export function parseDuration(value: unknown): number {
  if (typeof value !== "string") throw new ProtoJsonError('Expected a duration string such as "300s".');
  const match = DURATION.exec(value);
  if (!match) throw new ProtoJsonError(`"${value}" is not a duration; use seconds with an "s" suffix, such as "300s" or "1.5s".`);
  const magnitude = Number(match[2]) + fraction(match[3]);
  if (magnitude > MAX_DURATION_SECONDS) throw new ProtoJsonError(`"${value}" is outside the duration range.`);
  return match[1] ? -magnitude : magnitude;
}

/** Splits a non-negative number of seconds into whole seconds and nanoseconds at `resolution` nanoseconds. */
function split(seconds: number, resolution: number): [number, number] {
  let whole = Math.floor(seconds);
  let nanos = Math.round((seconds - whole) * (1e9 / resolution)) * resolution;
  if (nanos >= 1e9) {
    whole += 1;
    nanos -= 1e9;
  }
  return [whole, nanos];
}

/** Canonical proto3 JSON fractional part: none, or 3, 6 or 9 digits. */
function fractionDigits(nanos: number): string {
  if (nanos === 0) return "";
  const nine = String(nanos).padStart(9, "0");
  if (nanos % 1_000_000 === 0) return `.${nine.slice(0, 3)}`;
  if (nanos % 1_000 === 0) return `.${nine.slice(0, 6)}`;
  return `.${nine}`;
}

/** Writes seconds as a canonical protobuf duration string: "123s", "1.500s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) throw new ProtoJsonError("A duration must be a finite number of seconds.");
  const [whole, nanos] = split(Math.abs(seconds), 1);
  const sign = seconds < 0 && (whole > 0 || nanos > 0) ? "-" : "";
  return `${sign}${whole}${fractionDigits(nanos)}s`;
}

/** Reads an int64 sent as a decimal string or a JSON number; refuses values a double cannot hold exactly. */
export function parseInt64(value: unknown): number {
  let parsed: number;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && INT64.test(value)) parsed = Number(value);
  else throw new ProtoJsonError("Expected an integer, as a JSON number or a decimal string.");
  if (!Number.isSafeInteger(parsed)) {
    throw new ProtoJsonError("Expected an integer between -9007199254740991 and 9007199254740991.");
  }
  return parsed;
}

/**
 * Reads a timestamp as epoch seconds (fractional allowed). Accepts an RFC 3339 string with `Z` or a
 * numeric offset, or the `{ seconds, nanos }` object form with int64 seconds.
 */
export function parseTimestamp(value: unknown): number {
  let seconds: number;
  if (typeof value === "string") {
    const m = TIMESTAMP.exec(value);
    if (!m) throw new ProtoJsonError(`"${value}" is not an RFC 3339 timestamp such as "2026-10-12T08:00:00Z".`);
    const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59;
    if (!valid) throw new ProtoJsonError(`"${value}" is not a real calendar date and time.`);
    let offset = 0;
    if (m[9]) {
      const hours = Number(m[10]);
      const minutes = Number(m[11]);
      if (hours > 23 || minutes > 59) throw new ProtoJsonError(`"${value}" has an invalid UTC offset.`);
      offset = (m[9] === "-" ? -1 : 1) * (hours * 3600 + minutes * 60);
    }
    seconds = date.getTime() / 1000 - offset + fraction(m[7]);
  } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== "seconds" && key !== "nanos") throw new ProtoJsonError(`A timestamp object takes only seconds and nanos, not "${key}".`);
    }
    const whole = record.seconds === undefined ? 0 : parseInt64(record.seconds);
    const nanos = record.nanos === undefined ? 0 : parseInt64(record.nanos);
    if (nanos < 0 || nanos > 999_999_999) throw new ProtoJsonError("Timestamp nanos must be between 0 and 999999999.");
    seconds = whole + nanos / 1e9;
  } else {
    throw new ProtoJsonError('Expected an RFC 3339 timestamp string such as "2026-10-12T08:00:00Z".');
  }
  if (seconds < MIN_TIMESTAMP_SECONDS || seconds > MAX_TIMESTAMP_SECONDS + 1) {
    throw new ProtoJsonError("Timestamp is outside 0001-01-01 to 9999-12-31.");
  }
  return seconds;
}

/**
 * Writes epoch seconds as an RFC 3339 UTC timestamp with `Z`, using proto3's 0, 3, 6 or 9 fractional
 * digits. Resolution is one microsecond: a double cannot carry nanoseconds at present-day epochs.
 */
export function formatTimestamp(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds)) throw new ProtoJsonError("A timestamp must be a finite number of seconds.");
  const [whole, nanos] = split(epochSeconds, 1_000);
  const iso = new Date(whole * 1000).toISOString(); // YYYY-MM-DDTHH:MM:SS.000Z
  return `${iso.slice(0, 19)}${fractionDigits(nanos)}Z`;
}

/**
 * Field names whose values are `map<string, …>`. Their keys are user data (load type names, visit
 * types, cost names) and are never rewritten; the values under them are messages and are.
 */
export const MAP_FIELD_NAMES: ReadonlySet<string> = new Set([
  "loadDemands",
  "loadLimits",
  "extraVisitDurationForVisitType",
  // Response maps, so a GMPRO response can be normalized too.
  "routeCosts",
  "costs",
  "maxLoads",
  "vehicleLoads",
]);

/** Two spellings of one field found in the same object. */
export interface KeyConflict {
  /** Concrete path of the field, camelCase, such as `model.shipments[0].penaltyCost`. */
  path: string;
  /** The raw names as sent, in the order they appeared. */
  names: [string, string];
}

const snakeToCamel = (key: string): string => (key.includes("_") ? key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()) : key);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Appends a field name, array index or map key to a concrete path. */
export function joinPath(path: string, part: string | number, kind: "field" | "index" | "key" = typeof part === "number" ? "index" : "field"): string {
  if (kind === "index") return `${path}[${part}]`;
  if (kind === "key") return `${path}[${JSON.stringify(String(part))}]`;
  return path === "" ? String(part) : `${path}.${part}`;
}

/**
 * Sets an own, enumerable property. Plain assignment would treat a `__proto__` key (which
 * `JSON.parse` produces as an own property) as the prototype setter, hiding the entry from every
 * `Object.entries` walk while property reads still found what it carried.
 */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * Converts snake_case field names to lowerCamelCase, recursively, without mutating the input.
 * String values are untouched, and so are the keys of map fields (see {@link MAP_FIELD_NAMES}).
 * Two spellings of the same field in one object are reported as conflicts; the first one wins.
 * Every key, `__proto__` included, lands as an own property, so the validator sees it.
 */
export function normalizeKeys(value: unknown): { value: unknown; conflicts: KeyConflict[] } {
  const conflicts: KeyConflict[] = [];

  const visit = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((item, i) => visit(item, joinPath(path, i)));
    if (!isPlainObject(node)) return node;
    const out: Record<string, unknown> = {};
    const seen = new Map<string, string>();
    for (const [raw, child] of Object.entries(node)) {
      const name = snakeToCamel(raw);
      const childPath = joinPath(path, name);
      const first = seen.get(name);
      if (first !== undefined) {
        conflicts.push({ path: childPath, names: [first, raw] });
        continue;
      }
      seen.set(name, raw);
      if (MAP_FIELD_NAMES.has(name) && isPlainObject(child)) {
        const map: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(child)) setOwn(map, key, visit(entry, joinPath(childPath, key, "key")));
        setOwn(out, name, map);
      } else {
        setOwn(out, name, visit(child, childPath));
      }
    }
    return out;
  };

  return { value: visit(value, ""), conflicts };
}
