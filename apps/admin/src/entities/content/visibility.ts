import { effectiveVisibilityValues, isFieldVisible, type FieldVisibility } from "@lacecms/content";
import { record } from "./composite-values.js";
import { fieldLabel } from "./draft.js";
import type { FieldDefinition } from "./field-types.js";

type Fields = Readonly<Record<string, FieldDefinition>>;

const PUBLICATION = "publication";
const errorKeys = new Set(["message", "type", "ref", "types"]);

/**
 * The controller values one form occurrence holds for its rules: the form
 * value when it is set, otherwise the controller's declared default. A cleared
 * (`null`) or absent controller without a default is left out, so its targets
 * are hidden exactly as the server would hide them.
 */
export function effectiveFormValues(
  fields: Fields,
  visibility: FieldVisibility | undefined,
  values: unknown,
): Record<string, unknown> {
  return effectiveVisibilityValues(fields, visibility, record(values) ? values : {});
}

/** The keys of one occurrence whose rules match, through the shared evaluator; every key without rules. */
export function shownFieldKeys(
  fields: Fields,
  visibility: FieldVisibility | undefined,
  values: unknown,
): Set<string> {
  const effective = effectiveFormValues(fields, visibility, values);
  return new Set(Object.keys(fields).filter((key) => isFieldVisible(visibility, key, effective)));
}

function hasMessage(error: unknown): boolean {
  if (!record(error) && !Array.isArray(error)) return false;
  const node = error as Record<string, unknown>;
  if (typeof node.message === "string" && node.message !== "") return true;
  return Object.entries(node).some(([key, child]) => !errorKeys.has(key) && hasMessage(child));
}

/** Removes publication-only messages anywhere in a hidden subtree; `undefined` when nothing remains. */
function withoutPublication(error: unknown): unknown {
  if (!record(error) && !Array.isArray(error)) return error;
  const node = error as Record<string, unknown>;
  const result: Record<string, unknown> = Array.isArray(error) ? ([] as never) : {};
  const own = node.type === PUBLICATION;
  for (const [key, child] of Object.entries(node)) {
    if (errorKeys.has(key)) {
      if (!own) result[key] = child;
      continue;
    }
    const next = withoutPublication(child);
    if (next !== undefined) result[key] = next;
  }
  return hasMessage(result) ? result : undefined;
}

/** The errors of one value that its rules make reachable; see `applicableErrors`. */
export function applicableValueErrors(
  definition: FieldDefinition,
  value: unknown,
  error: unknown,
): unknown {
  if (!record(error) && !Array.isArray(error)) return error;
  if (definition.type === "group" && record(value))
    return applicableErrors(definition.fields, definition.visibility, value, error);
  if (definition.type === "list" && Array.isArray(value)) {
    const node = error as Record<string, unknown>;
    const result: Record<string, unknown> = Array.isArray(error) ? ([] as never) : {};
    for (const [key, child] of Object.entries(node)) {
      const next = /^(0|[1-9]\d*)$/u.test(key)
        ? applicableValueErrors(definition.item, value[Number(key)], child)
        : child;
      if (next !== undefined) result[key] = next;
    }
    return hasMessage(result) ? result : undefined;
  }
  return error;
}

/**
 * The errors of one owner (model fields, a group value or block data) that its
 * current values make reachable: publication-only problems under hidden
 * targets are dropped, recursively through shown groups and list items with
 * their own rules. Draft problems are kept, so their hidden fields can be shown
 * and fixed. Form state is never changed.
 */
export function applicableErrors(
  fields: Fields,
  visibility: FieldVisibility | undefined,
  values: unknown,
  errors: unknown,
): unknown {
  if (!record(errors) && !Array.isArray(errors)) return errors;
  const shown = shownFieldKeys(fields, visibility, values);
  const present = record(values) ? values : {};
  const node = errors as Record<string, unknown>;
  const result: Record<string, unknown> = Array.isArray(errors) ? ([] as never) : {};
  for (const [key, child] of Object.entries(node)) {
    const next = !Object.hasOwn(fields, key)
      ? child
      : shown.has(key)
        ? applicableValueErrors(fields[key]!, present[key], child)
        : withoutPublication(child);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

/**
 * The keys an owner renders: those whose rules match plus hidden keys that
 * still hold a problem in `errors` (already filtered by `applicableErrors`),
 * so the stored value can be fixed. `undefined` when the owner has no rules.
 */
export function renderedFieldKeys(
  fields: Fields,
  visibility: FieldVisibility | undefined,
  values: unknown,
  errors: unknown,
): ReadonlySet<string> | undefined {
  if (visibility === undefined || Object.keys(visibility).length === 0) return undefined;
  const shown = shownFieldKeys(fields, visibility, values);
  const entries = record(errors) ? errors : {};
  for (const key of Object.keys(fields)) if (hasMessage(entries[key])) shown.add(key);
  return shown;
}

function valueLabel(controller: FieldDefinition | undefined, value: boolean | string): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (controller?.type === "select" && controller.presentation?.control === "cards")
    return controller.presentation.choices.find((choice) => choice.value === value)?.label ?? value;
  return value;
}

/**
 * The note on a hidden field shown only to fix a problem in its stored value,
 * naming the controller and the values under which the field applies; for
 * example "Applies when Kind is Video".
 */
export function hiddenFieldNote(
  fields: Fields,
  visibility: FieldVisibility | undefined,
  key: string,
): string | undefined {
  const rule = visibility?.[key];
  if (rule === undefined) return undefined;
  const controller = fields[rule.field];
  const values = rule.values.map((value) => valueLabel(controller, value));
  const listed =
    values.length < 2 ? values.join("") : `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
  return `Shown to fix a problem in a stored value. Applies when ${fieldLabel(
    rule.field,
    controller?.label,
  )} is ${listed}.`;
}
