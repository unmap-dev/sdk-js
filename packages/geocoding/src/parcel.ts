/**
 * ParcelMap BC PID detect. Grammar matches Township Canada
 * `web/server/api/parcels/search.get.js`: nine digits, optional dashes
 * (`010-867-813` or `010867813`). PIN, plan number, and parcel-name
 * fuzzy match are not distinctive enough to steal civic search.
 */

export interface ParcelQuery {
  /** Trimmed original. */
  raw: string;
  /** Lookup key: `XXX-XXX-XXX`. */
  pid: string;
}

const PID = /^\d{3}-?\d{3}-?\d{3}$/;

export function parseParcel(q: string): ParcelQuery | null {
  if (typeof q !== "string") return null;
  const raw = q.trim();
  if (!PID.test(raw)) return null;
  const digits = raw.replace(/-/g, "");
  return {
    raw,
    pid: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
  };
}

/** True when `q` is a ParcelMap BC PID, not a civic address. */
export function looksLikeParcel(q: string): boolean {
  return parseParcel(q) != null;
}
