/**
 * Emits a JSON Schema (draft 2020-12) for OptimizeToursRequest from the field-status table, so the
 * schema and the validator cannot list different fields. Supported and ignored fields carry their
 * types; rejected and planned fields are present with their description and a schema that refuses
 * any value (`not: {}`), which is stricter than the validator only in one place: the validator also
 * accepts a planned field sent at its default value. Each property is listed in camelCase and,
 * where it differs, in snake_case, because the API accepts both.
 *
 * Cross-field rules (time window order, references, matrix shapes) are the validator's, not the
 * schema's.
 */

import { childrenOf, type FieldRow } from "./fields";

export type JsonSchema = { [keyword: string]: unknown };

export const JSON_SCHEMA_ID = "https://unmap.dev/schemas/optimize-tours-request.schema.json";

const INT_STRING = "^-?[0-9]+$";
const DURATION = "^-?[0-9]+(\\.[0-9]{1,9})?s$";
const TIMESTAMP = "^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?([Zz]|[+-][0-9]{2}:[0-9]{2})$";

const toSnake = (name: string): string => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function range(row: FieldRow): JsonSchema {
  const out: JsonSchema = {};
  if (row.minimum !== undefined) out.minimum = row.minimum;
  if (row.exclusiveMinimum !== undefined) out.exclusiveMinimum = row.exclusiveMinimum;
  if (row.maximum !== undefined) out.maximum = row.maximum;
  return out;
}

function single(row: FieldRow): JsonSchema {
  switch (row.type) {
    case "object":
      return objectSchema(row.path);
    case "any":
      return {};
    case "string":
      return { type: "string" };
    case "boolean":
      return { type: "boolean" };
    case "number":
      return { type: "number", ...range(row) };
    case "int32":
    case "int64":
      return { anyOf: [{ type: "integer", ...range(row) }, { type: "string", pattern: INT_STRING }] };
    case "duration":
      return { type: "string", pattern: DURATION };
    case "timestamp":
      return {
        anyOf: [
          { type: "string", pattern: TIMESTAMP },
          {
            type: "object",
            properties: {
              seconds: { anyOf: [{ type: "integer" }, { type: "string", pattern: INT_STRING }] },
              nanos: { type: "integer", minimum: 0, maximum: 999_999_999 },
            },
            additionalProperties: false,
          },
        ],
      };
    case "enum":
      return { type: "string", enum: (row.enumValues ?? []).filter((v) => v.status === "supported").map((v) => v.value) };
  }
}

function fieldSchema(row: FieldRow): JsonSchema {
  if (row.status !== "supported" && row.status !== "ignored") {
    return { description: row.description, "x-unmap-status": row.status, not: {} };
  }
  let schema: JsonSchema;
  if (row.repeated) {
    schema = { type: "array", items: single(row) };
    if (row.maxItems) schema.maxItems = row.maxItems.max;
  } else if (row.map) {
    schema = { type: "object", additionalProperties: single(row) };
  } else {
    schema = single(row);
  }
  const out: JsonSchema = { description: row.description, ...schema };
  if (row.default !== undefined) out.default = row.default;
  if (row.status === "ignored") out["x-unmap-status"] = "ignored";
  return out;
}

function objectSchema(tablePath: string): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [name, row] of childrenOf(tablePath)) {
    const schema = fieldSchema(row);
    properties[name] = schema;
    const snake = toSnake(name);
    if (snake !== name) properties[snake] = schema;
    if (row.required && row.status === "supported") required.push(name);
  }
  const out: JsonSchema = { type: "object", properties, additionalProperties: false };
  // A field may arrive in either spelling, so "present" means one of the two names is present.
  const spellings = (name: string): string[] => (toSnake(name) === name ? [name] : [name, toSnake(name)]);
  const isPresent = (name: string): JsonSchema => ({ anyOf: spellings(name).map((n) => ({ required: [n] })) });
  const allOf: JsonSchema[] = required.map(isPresent);
  for (const [name, row] of childrenOf(tablePath)) {
    const when = row.requiredWhen;
    if (!when || row.status !== "supported") continue;
    allOf.push({
      if: { anyOf: spellings(when.field).map((n) => ({ properties: { [n]: { const: when.equals } }, required: [n] })) },
      then: isPresent(name),
    });
  }
  if (allOf.length > 0) out.allOf = allOf;
  return out;
}

/** The JSON Schema for an OptimizeToursRequest body, built from the field table. */
export function buildJsonSchema(): JsonSchema & { $schema: string; $id: string } {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: JSON_SCHEMA_ID,
    title: "OptimizeToursRequest",
    description:
      "Request body for Unmap Optimize (POST /optimize and the GMPRO-compatible :optimizeTours paths), generated from @unmap/optimize-schema's field table.",
    ...objectSchema(""),
  };
}
