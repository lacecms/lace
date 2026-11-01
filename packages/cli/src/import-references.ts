import { encodeEntryLink } from "@lacecms/application";
import { pointer } from "./import-format.js";
import type { ImportEntry, ImportIssue } from "./import-format.js";

/** The structural part of a field descriptor that reference walking needs. */
export interface FieldShape {
  readonly type: string;
  readonly fields?: Readonly<Record<string, FieldShape>>;
  readonly item?: FieldShape;
}
export type FieldShapes = Readonly<Record<string, FieldShape>>;

export type ReferenceKind = "media" | "entry";

/** One package reference found in an entry. */
export interface EntryReference {
  readonly kind: ReferenceKind;
  readonly key: string;
  readonly pointer: string;
  /** In model fields or a visible block; hidden blocks and SEO are not delivered links. */
  readonly delivered: boolean;
}

/** Keys a package defines; entry values are the target model kinds. */
export interface PackageKeys {
  readonly media: ReadonlySet<string>;
  readonly entries: ReadonlyMap<string, string>;
}

/** Removes the reference's location: an object property or a list element. */
export const STRIP: unique symbol = Symbol("strip");
export type Resolution = string | typeof STRIP;
export type Resolver = (kind: ReferenceKind, key: string) => Resolution;

type Json = unknown;
type Visitor = {
  readonly onReference: (
    kind: ReferenceKind,
    key: string,
    path: readonly (string | number)[],
    allowed: boolean,
  ) => Resolution | undefined;
  readonly onMalformed: (path: readonly (string | number)[]) => void;
};

function isObject(value: Json): value is Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function referenceKind(value: Json): ReferenceKind | "malformed" | undefined {
  if (!isObject(value)) return undefined;
  const keys = Object.keys(value);
  const marked = keys.filter((key) => key === "$media" || key === "$entry");
  if (marked.length === 0) return undefined;
  if (keys.length !== 1 || typeof value[marked[0]!] !== "string") return "malformed";
  return marked[0] === "$media" ? "media" : "entry";
}

/** Walks an untyped value: every reference here is misplaced. */
function stray(value: Json, path: readonly (string | number)[], visitor: Visitor): Json {
  const kind = referenceKind(value);
  if (kind === "malformed") {
    visitor.onMalformed(path);
    return value;
  }
  if (kind !== undefined) {
    const key = (value as Record<string, string>)[kind === "media" ? "$media" : "$entry"]!;
    const resolved = visitor.onReference(kind, key, path, false);
    return resolved === undefined || resolved === STRIP ? value : resolved;
  }
  if (Array.isArray(value))
    return value.map((item, index) => stray(item, [...path, index], visitor));
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, stray(item, [...path, name], visitor)]),
    );
  return value;
}

function visitField(
  shape: FieldShape,
  value: Json,
  path: readonly (string | number)[],
  visitor: Visitor,
): Json | typeof STRIP {
  const kind = referenceKind(value);
  if (kind === "malformed") {
    visitor.onMalformed(path);
    return value;
  }
  if (kind !== undefined) {
    const key = (value as Record<string, string>)[kind === "media" ? "$media" : "$entry"]!;
    const allowed =
      (kind === "media" && shape.type === "media") || (kind === "entry" && shape.type === "url");
    const resolved = visitor.onReference(kind, key, path, allowed);
    return resolved === undefined ? value : resolved;
  }
  if (shape.type === "group" && shape.fields !== undefined && isObject(value))
    return visitFields(shape.fields, value, path, visitor);
  if (shape.type === "list" && shape.item !== undefined && Array.isArray(value)) {
    const items: Json[] = [];
    for (const [index, item] of value.entries()) {
      const next = visitField(shape.item, item, [...path, index], visitor);
      if (next !== STRIP) items.push(next);
    }
    return items;
  }
  return stray(value, path, visitor);
}

function visitFields(
  shapes: FieldShapes,
  values: Record<string, Json>,
  path: readonly (string | number)[],
  visitor: Visitor,
): Record<string, Json> {
  const result: Record<string, Json> = {};
  for (const [name, value] of Object.entries(values)) {
    const shape = Object.hasOwn(shapes, name) ? shapes[name] : undefined;
    const next =
      shape === undefined
        ? stray(value, [...path, name], visitor)
        : visitField(shape, value, [...path, name], visitor);
    if (next !== STRIP) result[name] = next;
  }
  return result;
}

/** The entry's reference-bearing parts after a walk. */
export interface RewrittenEntry {
  readonly fields: Record<string, Json>;
  readonly blocks: readonly {
    readonly data: Record<string, Json>;
    readonly settings?: Record<string, Json>;
  }[];
  readonly seo?: Record<string, Json>;
}

function walkEntry(
  entry: ImportEntry,
  modelFields: FieldShapes,
  blockFields: (type: string) => FieldShapes | undefined,
  visitor: Visitor,
): RewrittenEntry {
  const fields = visitFields(modelFields, entry.fields, ["fields"], visitor);
  const blocks = entry.blocks.map((block, index) => {
    const shapes = blockFields(block.type);
    const at = ["blocks", index, "data"];
    const data =
      shapes === undefined
        ? (stray(block.data, at, visitor) as Record<string, Json>)
        : visitFields(shapes, block.data, at, visitor);
    return {
      data,
      ...(block.settings === undefined
        ? {}
        : {
            settings: stray(block.settings, ["blocks", index, "settings"], visitor) as Record<
              string,
              Json
            >,
          }),
    };
  });
  let seo: Record<string, Json> | undefined;
  if (entry.seo !== undefined) {
    seo = {};
    for (const [name, value] of Object.entries(entry.seo)) {
      const next =
        name === "image"
          ? visitField({ type: "media" }, value, ["seo", name], visitor)
          : stray(value, ["seo", name], visitor);
      if (next !== STRIP) seo[name] = next;
    }
  }
  return { fields, blocks, ...(seo === undefined ? {} : { seo }) };
}

/**
 * Finds every reference of an entry, reporting misplaced, malformed and
 * unresolvable ones with pointers into `lace-import.json`.
 */
export function collectReferences(
  entry: ImportEntry,
  entryIndex: number,
  modelFields: FieldShapes,
  blockFields: (type: string) => FieldShapes | undefined,
  keys: PackageKeys,
  issues: ImportIssue[],
): EntryReference[] {
  const references: EntryReference[] = [];
  const at = (path: readonly (string | number)[]) => pointer("entries", entryIndex, ...path);
  walkEntry(entry, modelFields, blockFields, {
    onMalformed: (path) =>
      issues.push({
        pointer: at(path),
        message: "A reference object must have exactly one $media or $entry string property.",
      }),
    onReference: (kind, key, path, allowed) => {
      if (!allowed) {
        issues.push({
          pointer: at(path),
          message:
            kind === "media"
              ? "A $media reference is allowed only in a media field or seo.image."
              : "An $entry reference is allowed only in a URL field.",
        });
        return undefined;
      }
      if (kind === "media" && !keys.media.has(key))
        issues.push({ pointer: at(path), message: "names no media item of the package." });
      else if (kind === "entry" && !keys.entries.has(key))
        issues.push({ pointer: at(path), message: "names no entry of the package." });
      else if (kind === "entry" && keys.entries.get(key) === "global")
        issues.push({ pointer: at(path), message: "must name a page or collection entry." });
      else {
        const hiddenBlock =
          path[0] === "blocks" && entry.blocks[path[1] as number]?.hidden === true;
        references.push({
          kind,
          key,
          pointer: at(path),
          delivered: path[0] !== "seo" && !hiddenBlock,
        });
      }
      return undefined;
    },
  });
  return references;
}

/** Replaces references by the resolver's values; STRIP removes their location. */
export function rewriteReferences(
  entry: ImportEntry,
  modelFields: FieldShapes,
  blockFields: (type: string) => FieldShapes | undefined,
  resolve: Resolver,
): RewrittenEntry {
  return walkEntry(entry, modelFields, blockFields, {
    onMalformed: () => undefined,
    onReference: (kind, key, _path, allowed) => (allowed ? resolve(kind, key) : undefined),
  });
}

/** Placeholder identifiers for local validation; existence is not checked in drafts. */
export const placeholderResolver: Resolver = (kind, key) =>
  kind === "media" ? `import-media-${key}` : encodeEntryLink(`import-entry-${key}`);
