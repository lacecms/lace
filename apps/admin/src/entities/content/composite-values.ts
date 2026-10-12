import {
  ContentValidationError,
  MAX_LIST_ITEMS,
  MAX_SNAPSHOT_LIST_ITEMS,
  validateFieldValue,
  type FieldDefinition,
  type ModelFieldDefinitions,
} from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import type { DraftEditorValues } from "./editor-form.js";

export type ValuePath = readonly (string | number)[];
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Cleared named properties are omitted; array slots and rich-text documents are never filtered. */
export function cleanValue(value: unknown, definition?: FieldDefinition): unknown {
  if (definition?.type === "richText") return value;
  if (Array.isArray(value))
    return value.map((item) =>
      cleanValue(item, definition?.type === "list" ? definition.item : undefined),
    );
  if (!record(value) || (definition === undefined && value.type === "doc")) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null && child !== undefined)
      .map(([key, child]) => [
        key,
        cleanValue(child, definition?.type === "group" ? definition.fields[key] : undefined),
      ]),
  );
}

/** Apply defaults without traversing absent optional containers or requiring complete draft data. */
export function fieldStartingValue(definition: FieldDefinition, value: unknown): unknown {
  const present = value === undefined ? structuredClone(definition.defaultValue) : value;
  if (definition.type === "group" && record(present))
    return fieldStartingValues(definition.fields, present);
  if (definition.type === "list" && Array.isArray(present))
    return present.map((item) => fieldStartingValue(definition.item, item));
  return present;
}
export function fieldStartingValues(
  fields: ModelFieldDefinitions,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  for (const [key, definition] of Object.entries(fields)) {
    const value = fieldStartingValue(definition, data[key]);
    result[key] = value;
  }
  return result;
}
export function readPath(value: unknown, path: ValuePath): unknown {
  for (const segment of path) {
    if (!record(value) && !Array.isArray(value)) return undefined;
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}
export function replacePath(value: unknown, path: ValuePath, next: unknown): unknown {
  const [first, ...rest] = path;
  if (first === undefined) return next;
  const result = Array.isArray(value) ? [...value] : { ...(record(value) ? value : {}) };
  (result as Record<string | number, unknown>)[first] = replacePath(
    readPath(value, [first]),
    rest,
    next,
  );
  return result;
}
export function descriptorAt(
  definition: FieldDefinition,
  path: ValuePath,
  value: unknown,
): FieldDefinition | undefined {
  for (const part of path) {
    if (
      definition.type === "group" &&
      typeof part === "string" &&
      Object.hasOwn(definition.fields, part)
    )
      definition = definition.fields[part]!;
    else if (
      definition.type === "list" &&
      /^(0|[1-9]\d*)$/u.test(String(part)) &&
      Array.isArray(value) &&
      Number(part) < value.length
    )
      definition = definition.item;
    else return undefined;
    value = readPath(value, [part]);
  }
  return definition;
}
let identitySequence = 0;
export function newItemIdentity(): string {
  return `item-${++identitySequence}`;
}
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item!);
  return result;
}
export function duplicateItem<T>(items: readonly T[], index: number): T[] {
  const result = [...items];
  result.splice(index + 1, 0, structuredClone(items[index]!));
  return result;
}

export interface Budget {
  readonly count: number;
  readonly problem: string | undefined;
}
/** Count all normalized descriptor lists even when unrelated scalar values are invalid. */
export function snapshotBudget(model: ContentModelDto, values: DraftEditorValues): Budget {
  let count = 0;
  let problem: string | undefined;
  function walk(definition: FieldDefinition, input: unknown) {
    const value = input === undefined || input === null ? definition.defaultValue : input;
    if (definition.type === "group" && record(value)) map(definition.fields, value);
    if (definition.type === "list" && Array.isArray(value)) {
      count += value.length;
      if (value.length > (definition.maxItems ?? MAX_LIST_ITEMS))
        problem ??= `This list allows at most ${definition.maxItems ?? MAX_LIST_ITEMS} items.`;
      value.forEach((item) => walk(definition.item, item));
    }
  }
  function map(fields: ModelFieldDefinitions, data: Record<string, unknown>) {
    for (const [key, definition] of Object.entries(fields)) walk(definition, data[key]);
  }
  map(model.fields, values.fields);
  for (const block of values.blocks) {
    const definition = model.blockDefinitions?.find((item) => item.type === block.type);
    if (definition) map(definition.fields, block.data);
  }
  if (count > MAX_SNAPSHOT_LIST_ITEMS)
    problem ??= `An entry allows at most ${MAX_SNAPSHOT_LIST_ITEMS} list items, including nested lists and hidden blocks.`;
  return { count, problem };
}
export function draftItemValue(definition: FieldDefinition): unknown {
  let value: unknown = definition.defaultValue;
  if (value === undefined) {
    if (definition.type === "group") value = {};
    else if (definition.type === "boolean") value = false;
    else if (definition.type === "text" || definition.type === "textarea") value = "";
  }
  if (value === undefined) return undefined;
  try {
    return validateFieldValue(definition, structuredClone(value), [], "draft");
  } catch (error) {
    if (!(error instanceof ContentValidationError)) throw error;
    return undefined;
  }
}
