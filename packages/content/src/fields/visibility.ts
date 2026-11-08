import type { FieldDefinition, FieldVisibility, ModelFieldDefinitions } from "./definitions.js";
import { normalizeJsonValue } from "../shared/json.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import { fail } from "../shared/errors.js";

/** Validates, detaches and freezes the conditional-field rules of one owner. */
export function normalizeFieldVisibility(
  value: unknown,
  fields: Readonly<Record<string, FieldDefinition>>,
  path = "visibility",
): FieldVisibility | undefined {
  if (value === undefined) return undefined;
  const raw = normalizeJsonValue(value, path);
  if (!isRecord(raw)) fail(path, "must be a plain object of field rules.");
  for (const [target, rule] of Object.entries(raw)) {
    const at = `${path}.${target}`;
    if (!Object.hasOwn(fields, target)) fail(at, "must target a declared sibling field.");
    if (
      !isRecord(rule) ||
      Object.keys(rule).some((key) => !["field", "values"].includes(key)) ||
      typeof rule.field !== "string"
    )
      fail(at, "must contain only field and values.");
    if (rule.field === target) fail(`${at}.field`, "must name another sibling field.");
    if (Object.hasOwn(raw, rule.field))
      fail(
        `${at}.field`,
        "must name an unconditional controller; chains and cycles are not allowed.",
      );
    const controller = Object.hasOwn(fields, rule.field) ? fields[rule.field] : undefined;
    if (controller?.type !== "select" && controller?.type !== "boolean")
      fail(`${at}.field`, "must name a sibling select or boolean field.");
    const allowed: readonly (boolean | string)[] =
      controller.type === "select" ? controller.options : [true, false];
    if (
      !Array.isArray(rule.values) ||
      rule.values.length === 0 ||
      new Set(rule.values).size !== rule.values.length ||
      rule.values.some((entry) => !allowed.includes(entry as boolean | string))
    )
      fail(`${at}.values`, "must be a nonempty unique subset of the controller's values.");
  }
  return deepFreeze(raw) as unknown as FieldVisibility;
}

/** Effective controller values for one occurrence, without copying non-controller data. */
export function effectiveVisibilityValues(
  fields: ModelFieldDefinitions,
  visibility: FieldVisibility | undefined,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, boolean | string>> {
  const result: Record<string, boolean | string> = {};
  if (visibility === undefined) return result;
  const seen = new Set<string>();
  for (const target of Object.keys(visibility)) {
    if (!Object.hasOwn(visibility, target)) continue;
    const { field } = visibility[target]!;
    if (seen.has(field)) continue;
    seen.add(field);
    const present = Object.hasOwn(values, field) ? values[field] : undefined;
    const controller = Object.hasOwn(fields, field) ? fields[field] : undefined;
    const value = present ?? controller?.defaultValue;
    if (value !== undefined)
      Object.defineProperty(result, field, { value: value as boolean | string, enumerable: true });
  }
  return result;
}

/**
 * Whether a target's rule matches effective controller values, as computed by
 * effectiveVisibilityValues. A target without a rule is visible; an absent
 * effective controller matches nothing.
 */
export function isFieldVisible(
  visibility: FieldVisibility | undefined,
  target: string,
  values: Readonly<Record<string, unknown>>,
): boolean {
  const rule =
    visibility !== undefined && Object.hasOwn(visibility, target) ? visibility[target] : undefined;
  if (rule === undefined) return true;
  if (!Object.hasOwn(values, rule.field)) return false;
  return rule.values.includes(values[rule.field] as boolean | string);
}
