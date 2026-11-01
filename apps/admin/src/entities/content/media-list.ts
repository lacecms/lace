import type { FieldDefinition } from "@lacecms/content";
import { draftItemValue, fieldStartingValue, record } from "./composite-values.js";
import { shownFieldKeys } from "./visibility.js";

/**
 * Where an eligible media list keeps the media of each item: the item itself
 * (`key` absent) or the single required media field of a group item.
 */
export interface MediaListTarget {
  readonly key?: string;
}

/**
 * Whether a list's items can be added from the media picker in multiple mode:
 * a media item, or a group item with exactly one direct media field that is
 * required and shown in the starting value Add would use. Any other item keeps
 * the ordinary Add.
 */
export function mediaListTarget(item: FieldDefinition): MediaListTarget | undefined {
  if (item.type === "media") return {};
  if (item.type !== "group") return undefined;
  const media = Object.entries(item.fields).filter(([, child]) => child.type === "media");
  if (media.length !== 1) return undefined;
  const [key, child] = media[0]!;
  if (child.required !== true) return undefined;
  const initial = draftItemValue(item) ?? fieldStartingValue(item, {});
  return shownFieldKeys(item.fields, item.visibility, initial).has(key) ? { key } : undefined;
}

/** An Add choice for an option of the media field's controller that hides the media field. */
export interface MediaListChoice {
  /** The option's choice-card label, otherwise the option value. */
  readonly label: string;
  readonly value: string;
  /** A detached starting value with the controller set to the option. */
  readonly item: Record<string, unknown>;
}

/**
 * The options, in option order, of the `select` controller that a rule on an
 * eligible list's media field does not list, each with the item Add would
 * insert for it (the gallery's Video). Lists without such a rule, or whose
 * controller is a boolean, offer no choices.
 */
export function mediaListChoices(
  item: FieldDefinition,
  target: MediaListTarget,
): MediaListChoice[] {
  if (item.type !== "group" || target.key === undefined) return [];
  const rule = item.visibility?.[target.key];
  const controller = rule === undefined ? undefined : item.fields[rule.field];
  if (rule === undefined || controller?.type !== "select") return [];
  const initial = draftItemValue(item) ?? fieldStartingValue(item, {});
  const listed = new Set<unknown>(rule.values);
  return controller.options
    .filter((option) => !listed.has(option))
    .map((value) => ({
      item: { ...(record(initial) ? structuredClone(initial) : {}), [rule.field]: value },
      label:
        controller.presentation?.choices.find((choice) => choice.value === value)?.label ?? value,
      value,
    }));
}

/**
 * One new item per media identifier, in order: the identifier itself, or a
 * detached copy of the item's starting value with its media field set.
 */
export function mediaListItems(
  item: FieldDefinition,
  target: MediaListTarget,
  ids: readonly string[],
): unknown[] {
  if (target.key === undefined) return [...ids];
  const key = target.key;
  const initial = draftItemValue(item) ?? fieldStartingValue(item, {});
  return ids.map((id) => ({ ...(record(initial) ? structuredClone(initial) : {}), [key]: id }));
}

/** The media identifiers already held by a list's items. */
export function mediaIdsInList(target: MediaListTarget, list: readonly unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const value of list) {
    const media = target.key === undefined ? value : record(value) ? value[target.key] : undefined;
    if (typeof media === "string") ids.add(media);
  }
  return ids;
}

/**
 * How many media items can be appended: the largest count whose prospective
 * list `fits`, up to the list's remaining maximum. `cause` says whether the
 * list maximum (`list`) or another limit such as the entry budget (`budget`)
 * stops further growth.
 */
export function mediaListCapacity({
  fits,
  item,
  list,
  maximum,
  target,
}: {
  readonly fits: (next: readonly unknown[]) => boolean;
  readonly item: FieldDefinition;
  readonly list: readonly unknown[];
  readonly maximum: number;
  readonly target: MediaListTarget;
}): { readonly capacity: number; readonly cause: "budget" | "list" } {
  const remaining = Math.max(0, maximum - list.length);
  // Budgets count list lengths, never media values, so any identifier measures the same.
  const candidates = mediaListItems(
    item,
    target,
    Array.from({ length: remaining }, () => "media"),
  );
  for (let count = 1; count <= remaining; count += 1)
    if (!fits([...list, ...candidates.slice(0, count)]))
      return { capacity: count - 1, cause: "budget" };
  return { capacity: remaining, cause: "list" };
}
