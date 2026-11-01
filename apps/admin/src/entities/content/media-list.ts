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
