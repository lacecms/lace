import { FIELD_FILTER_OPERATIONS } from "./capabilities.js";
import type { FieldFilterKind } from "./capabilities.js";

/** Operators every filterable field type supports, with no operand. */
export const FIELD_PRESENCE_OPERATIONS = Object.freeze(["isSet", "isNotSet"] as const);
/** Distinct configured values one select `in` filter may name. */
export const MAX_FILTER_SELECT_VALUES = 50;
/** UTF-16 code units of one text filter operand. */
export const MAX_FILTER_TEXT_LENGTH = 200;

/**
 * Why a filter's operation or operands are invalid. `path` names the filter
 * member that carries the failure; `""` names the filter itself (a range
 * without bounds).
 */
export interface FieldFilterValueFailure {
  readonly path: string;
  readonly reason: "operation" | "operand" | "bounds" | "inverted" | "budget" | "member";
}

export interface FieldFilterValueOptions {
  /** The configured options of a select field. */
  readonly selectOptions?: readonly string[] | undefined;
  /** The runtime search budget for `contains` operands; omitted means unbounded. */
  readonly fitsTextBudget?: ((value: string) => boolean) | undefined;
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_FILTER_TEXT_LENGTH;

function calendarDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

/** An explicit-offset ISO instant, normalized to UTC, or `undefined`. */
export function filterInstant(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ||
    !calendarDate(value.slice(0, 10)) ||
    !Number.isFinite(Date.parse(value)) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return undefined;
  return new Date(value).toISOString();
}

const fail = (
  path: string,
  reason: FieldFilterValueFailure["reason"],
): FieldFilterValueFailure => ({ path, reason });

function operandFailure(
  kind: FieldFilterKind,
  filter: Readonly<Record<string, unknown>>,
  options: FieldFilterValueOptions,
): FieldFilterValueFailure | readonly string[] {
  const op = filter.op;
  if (op === "isSet" || op === "isNotSet") return [];
  if (!(FIELD_FILTER_OPERATIONS[kind] as readonly unknown[]).includes(op))
    return fail("op", "operation");
  if (op === "eq") {
    const valid =
      kind === "number"
        ? finite(filter.value)
        : kind === "boolean"
          ? typeof filter.value === "boolean"
          : text(filter.value);
    return valid ? ["value"] : fail("value", "operand");
  }
  if (op === "contains") {
    if (!text(filter.value)) return fail("value", "operand");
    if (options.fitsTextBudget !== undefined && !options.fitsTextBudget(filter.value))
      return fail("value", "budget");
    return ["value"];
  }
  if (op === "in") {
    const values = filter.values;
    const selectOptions = options.selectOptions ?? [];
    return Array.isArray(values) &&
      values.length >= 1 &&
      values.length <= MAX_FILTER_SELECT_VALUES &&
      new Set(values).size === values.length &&
      values.every((value) => typeof value === "string" && selectOptions.includes(value))
      ? ["values"]
      : fail("values", "operand");
  }
  if (op === "range" && kind === "number") {
    for (const key of ["min", "max"])
      if (filter[key] !== undefined && !finite(filter[key])) return fail(key, "operand");
    if (filter.min === undefined && filter.max === undefined) return fail("", "bounds");
    if (finite(filter.min) && finite(filter.max) && filter.min > filter.max)
      return fail("max", "inverted");
    return ["min", "max"];
  }
  if (op === "range" && (kind === "date" || kind === "datetime")) {
    const bounds: { from?: string; to?: string } = {};
    for (const key of ["from", "to"] as const) {
      if (filter[key] === undefined) continue;
      const bound =
        kind === "date"
          ? calendarDate(filter[key])
            ? filter[key]
            : undefined
          : filterInstant(filter[key]);
      if (bound === undefined) return fail(key, "operand");
      bounds[key] = bound;
    }
    if (bounds.from === undefined && bounds.to === undefined) return fail("", "bounds");
    if (bounds.from !== undefined && bounds.to !== undefined && bounds.from > bounds.to)
      return fail("to", "inverted");
    return ["from", "to"];
  }
  return fail("op", "operation");
}

/**
 * Checks one filter's operation, operands and members for a field filter kind:
 * presence operators take no operand, `eq`/`contains` text operands hold 1 to
 * `MAX_FILTER_TEXT_LENGTH` units, `in` names 1 to `MAX_FILTER_SELECT_VALUES`
 * distinct configured options, and ranges need a valid, ordered bound.
 * Returns `undefined` when the filter is valid. Datetime bounds are compared
 * after UTC normalization; the caller normalizes the accepted filter.
 */
export function fieldFilterValueFailure(
  kind: FieldFilterKind,
  filter: Readonly<Record<string, unknown>>,
  options: FieldFilterValueOptions = {},
): FieldFilterValueFailure | undefined {
  const members = operandFailure(kind, filter, options);
  if (!Array.isArray(members)) return members as FieldFilterValueFailure;
  const allowed = ["field", "op", ...members];
  const unknown = Object.keys(filter).find((key) => !allowed.includes(key));
  return unknown === undefined ? undefined : fail(unknown, "member");
}
