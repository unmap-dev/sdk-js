/**
 * The validation error catalogue. String codes are what Unmap code and docs use; the integer `id`
 * is what goes in a GMPRO `OptimizeToursValidationError.code`, which is an int32 on the wire.
 * The integers are Unmap's own numbering and do not match Google's internal codes; the string code
 * travels alongside as `displayName`. Never renumber an entry: clients may key on the integer.
 */

import type { FieldReference, OptimizeToursValidationError } from "./types";

export const VALIDATION_ERRORS = {
  INVALID_REQUEST: { id: 1, summary: "The request body is not a JSON object." },
  UNKNOWN_FIELD: { id: 2, summary: "A field name that GMPRO and Unmap do not define." },
  CONFLICTING_FIELD_NAMES: { id: 3, summary: "One field sent twice, as snake_case and as camelCase." },
  INVALID_TYPE: { id: 4, summary: "A value of the wrong JSON type." },
  INVALID_ENUM_VALUE: { id: 5, summary: "An enum value that does not exist." },
  INVALID_DURATION: { id: 6, summary: 'A duration that is not a string such as "300s".' },
  INVALID_TIMESTAMP: { id: 7, summary: "A timestamp that is not RFC 3339 or {seconds, nanos}." },
  INVALID_INT64: { id: 8, summary: "An integer that is not a decimal string or a safe JSON integer." },
  OUT_OF_RANGE: { id: 9, summary: "A number outside the field's allowed range." },
  INVALID_VALUE: { id: 10, summary: "A value the field cannot take, such as a duplicate tag." },
  MISSING_REQUIRED_FIELD: { id: 11, summary: "A field the message needs is absent." },
  MUTUALLY_EXCLUSIVE_FIELDS: { id: 12, summary: "Two fields that cannot both be set are both set." },
  INVALID_TIME_WINDOW: { id: 13, summary: "A time window that is reversed, overlaps another, or leaves the global window." },
  INVALID_REFERENCE: { id: 14, summary: "An index or tag that names nothing in the model." },
  MATRIX_SHAPE_MISMATCH: { id: 15, summary: "A duration and distance matrix whose size does not match its tags." },
  FIELD_NOT_SUPPORTED_YET: { id: 16, summary: "A GMPRO field Unmap plans to support, set to a non-default value." },
  VALUE_NOT_SUPPORTED_YET: { id: 17, summary: "A value Unmap plans to support, such as WALKING or a second pickup." },
  PLACE_ID_NOT_SUPPORTED: { id: 18, summary: "A waypoint given as a Google place ID." },
  GCS_URI_NOT_SUPPORTED: { id: 19, summary: "A gs:// Google Cloud Storage URI." },
} as const satisfies Record<string, { id: number; summary: string }>;

export type ValidationErrorCode = keyof typeof VALIDATION_ERRORS;

/** String code to GMPRO integer code. */
export const VALIDATION_ERROR_CODES = Object.fromEntries(
  Object.entries(VALIDATION_ERRORS).map(([code, entry]) => [code, entry.id]),
) as { readonly [K in ValidationErrorCode]: (typeof VALIDATION_ERRORS)[K]["id"] };

/** One validation error, in GMPRO's shape plus a flat `path` and an optional `hint`. */
export interface ValidationIssue {
  /** Unmap's string code, a key of {@link VALIDATION_ERRORS}. */
  code: ValidationErrorCode;
  /** Same as `code`; GMPRO's human-readable name slot. */
  displayName: string;
  /** Concrete path such as `model.shipments[3].pickups[0].timeWindows[1].startTime`; map keys as `["key"]`. */
  path: string;
  /** The same location as a GMPRO FieldReference chain. */
  fields: FieldReference[];
  errorMessage: string;
  hint?: string;
  /** The offending scalar value as text, when there is one. */
  offendingValues?: string;
}

/** A field that was accepted and has no effect. One warning per table row, however often it appears. */
export interface ValidationWarning {
  code: "FIELD_IGNORED";
  /** The table path of the ignored field. */
  field: string;
  /** The first concrete path where it appeared. */
  path: string;
  /** How many times it appeared with a non-default value. */
  count: number;
  message: string;
}

const PATH_TOKEN = /([A-Za-z0-9_@$-]+)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/g;

/** Turns a concrete path into a GMPRO FieldReference chain. */
export function fieldReferenceOf(path: string): FieldReference {
  const chain: FieldReference[] = [];
  for (const match of path.matchAll(PATH_TOKEN)) {
    if (match[1] !== undefined) chain.push({ name: match[1] });
    else if (chain.length > 0) {
      const last = chain[chain.length - 1]!;
      if (match[2] !== undefined) last.index = Number(match[2]);
      else last.key = JSON.parse(match[3]!) as string;
    }
  }
  const root = chain[0] ?? { name: "" };
  for (let i = chain.length - 1; i > 0; i--) chain[i - 1]!.subField = chain[i];
  return root;
}

/** The GMPRO response-body form of an issue: integer code, string code as displayName. */
export function toOptimizeToursValidationError(issue: ValidationIssue): OptimizeToursValidationError {
  const wire: OptimizeToursValidationError = {
    code: VALIDATION_ERROR_CODES[issue.code],
    displayName: issue.displayName,
    fields: issue.fields,
    errorMessage: issue.errorMessage,
  };
  if (issue.offendingValues !== undefined) wire.offendingValues = issue.offendingValues;
  return wire;
}

/** One `google.rpc.BadRequest.FieldViolation`, for Google-style HTTP 400 bodies. */
export function toFieldViolation(issue: ValidationIssue): { field: string; description: string } {
  return { field: issue.path, description: issue.hint ? `${issue.errorMessage} ${issue.hint}` : issue.errorMessage };
}

export interface StorageUriRejection {
  code: "GCS_URI_NOT_SUPPORTED";
  message: string;
  hint: string;
}

/**
 * No field of OptimizeToursRequest takes a URI; the GMPRO URI and batch methods do. Those are V2,
 * and this is the check they must apply to every input and output URI.
 */
export function checkStorageUri(uri: string): StorageUriRejection | null {
  if (!/^gs:\/\//i.test(uri)) return null;
  return {
    code: "GCS_URI_NOT_SUPPORTED",
    message: "gs:// URIs are not supported: Unmap cannot read Google Cloud Storage.",
    hint: "Send the request body inline, or use an https:// URL that Unmap can fetch.",
  };
}
