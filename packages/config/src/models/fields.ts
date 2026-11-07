import { deepFreeze, isPlainObject } from "@lacecms/content";
import {
  parseSchemaPath,
  encodeSchemaPath,
  schemaFieldAt,
  toFieldMetadata,
} from "@lacecms/content";
import type { FieldDefinition } from "@lacecms/content";
import { FIELD_KEY_PATTERN, BLOCK_TYPE_PATTERN } from "@lacecms/content";
import type { FieldMap } from "./types.js";
import { fail } from "../shared/errors.js";

interface NormalizedFields<Fields extends FieldMap> {
  readonly fields: Fields;
  /** Current field key to former key, from field-level `renamedFrom` hints. */
  readonly renamedFields: Readonly<Record<string, string>>;
}

/** Normalizes field descriptors and moves their `renamedFrom` hints out of the definitions. */
export function normalizeFields<Fields extends FieldMap>(
  value: Fields | undefined,
): NormalizedFields<Fields> {
  if (value === undefined) {
    return { fields: deepFreeze({}) as Fields, renamedFields: {} };
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isPlainObject(value)
  ) {
    fail("fields must be a plain object.");
  }

  const normalized: Record<string, FieldDefinition> = {};
  const renamedFields: Record<string, string> = {};
  const extract = (definition: FieldDefinition, path: readonly string[]): FieldDefinition => {
    const { renamedFrom, ...metadata } = definition as FieldDefinition & {
      readonly renamedFrom?: string;
    };
    if (renamedFrom !== undefined) {
      const address = encodeSchemaPath(path);
      renamedFields[address] = encodeSchemaPath([...path.slice(0, -1), renamedFrom]);
    }
    if (metadata.type === "group")
      return {
        ...metadata,
        fields: Object.fromEntries(
          Object.entries(metadata.fields).map(([key, child]) => [
            key,
            extract(child, [...path, key]),
          ]),
        ),
      };
    if (metadata.type === "list")
      return { ...metadata, item: extract(metadata.item, [...path, "*"]) as typeof metadata.item };
    return metadata;
  };
  for (const [key, definition] of Object.entries(value)) {
    if (!FIELD_KEY_PATTERN.test(key)) fail(`fields.${key} must be a valid field key.`);
    normalized[key] = extract(toFieldMetadata(definition as FieldDefinition), [key]);
  }
  return { fields: deepFreeze(normalized) as Fields, renamedFields };
}

export function normalizeKeyList(
  value: readonly string[] | undefined,
  name: string,
  pattern: RegExp,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${name} must be an array of keys.`);
  const seen = new Set<string>();
  for (const key of value) {
    if (typeof key !== "string" || !pattern.test(key)) {
      fail(`${name} must contain valid keys.`);
    }
    if (seen.has(key)) fail(`${name} contains duplicate key "${key}".`);
    seen.add(key);
  }
  return [...seen].sort();
}

export function normalizeRemovedFields(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("removedFields must be an array of keys.");
  const paths = value
    .map((path) => {
      try {
        const parts = parseSchemaPath(path);
        if (parts.at(-1) === "*") fail("removedFields must name a field, not a list item.");
        return encodeSchemaPath(parts);
      } catch {
        fail("removedFields must contain valid keys or schema paths.");
      }
    })
    .sort();
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index]!;
    if (paths.indexOf(path) !== index) fail(`removedFields contains duplicate key "${path}".`);
    const prefix = `/${parseSchemaPath(path).join("/")}/`;
    if (paths.some((other) => `/${parseSchemaPath(other).join("/")}`.startsWith(prefix)))
      fail(`removedFields contains overlapping path "${path}".`);
  }
  return paths;
}

/** Rejects synchronization hints that contradict the model's own configuration. */
export function assertSynchronizationHints(
  modelKey: string,
  fields: FieldMap,
  blocks: readonly string[],
  renamedFields: Readonly<Record<string, string>>,
  removedFields: readonly string[],
  removedBlocks: readonly string[],
): void {
  const sources = new Map<string, string>();
  for (const [key, former] of Object.entries(renamedFields)) {
    if (former === key) {
      fail(`model "${modelKey}" field "${key}" is renamed from its own key.`);
    }
    if (schemaFieldAt(fields, parseSchemaPath(former)) !== undefined) {
      fail(`model "${modelKey}" field "${key}" is renamed from configured field "${former}".`);
    }
    const other = sources.get(former);
    if (other !== undefined) {
      fail(`model "${modelKey}" fields "${other}" and "${key}" share renamedFrom "${former}".`);
    }
    sources.set(former, key);
  }
  for (const key of removedFields) {
    if (schemaFieldAt(fields, parseSchemaPath(key)) !== undefined) {
      fail(`model "${modelKey}" removedFields lists configured field "${key}".`);
    }
    if (sources.has(key)) {
      fail(`model "${modelKey}" removedFields lists rename source "${key}".`);
    }
  }
  for (const type of removedBlocks) {
    if (blocks.includes(type)) {
      fail(`model "${modelKey}" removedBlocks lists allowed block type "${type}".`);
    }
  }
}

export function normalizeBlocks(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) {
    return deepFreeze([]);
  }
  if (!Array.isArray(value)) {
    fail("blocks must be an array of block keys.");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const blockKey of value) {
    if (typeof blockKey !== "string" || !BLOCK_TYPE_PATTERN.test(blockKey)) {
      fail("blocks must contain valid block keys.");
    }
    if (seen.has(blockKey)) {
      fail(`blocks contains duplicate block key "${blockKey}".`);
    }
    seen.add(blockKey);
    normalized.push(blockKey);
  }
  return deepFreeze(normalized);
}
