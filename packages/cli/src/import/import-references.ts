import { isCliRecord as isObject } from "../shared/record.js";
import { encodeEntryLink, resolveModelKind } from "@lacecms/application";
import { pointer } from "./import-format.js";
import type { ImportEntry, ImportIssue, ImportModelFacts } from "./import-format.js";

/** The structural part of a field descriptor that reference walking needs. */
export interface FieldShape {
  readonly type: string;
  readonly fields?: Readonly<Record<string, FieldShape>>;
  readonly item?: FieldShape;
  readonly models?: readonly string[];
  readonly embedProviders?: readonly string[];
}
export type FieldShapes = Readonly<Record<string, FieldShape>>;

export type ReferenceKind = "media" | "entry" | "reference";

/** One package reference found in an entry. */
export interface EntryReference {
  readonly kind: ReferenceKind;
  readonly key: string;
  readonly pointer: string;
}

/** Keys a package defines and the eligibility of each entry's model. */
export interface PackageKeys {
  readonly media: ReadonlySet<string>;
  readonly entries: ReadonlyMap<string, Pick<ImportModelFacts, "key" | "kind" | "route">>;
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
    shape: FieldShape | undefined,
  ) => Resolution | undefined;
  readonly onMalformed: (path: readonly (string | number)[]) => void;
};

function referenceKind(value: Json): "media" | "entry" | "malformed" | undefined {
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
    const resolved = visitor.onReference(kind, key, path, undefined);
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
    const resolved = visitor.onReference(
      kind === "entry" && shape.type === "reference" ? "reference" : kind,
      key,
      path,
      shape,
    );
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

function allowsMarker(kind: ReferenceKind, shape: FieldShape | undefined): boolean {
  if (kind === "entry") return shape?.type === "url" && shape.embedProviders === undefined;
  return shape?.type === kind;
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
    onReference: (kind, key, path, shape) => {
      if (!allowsMarker(kind, shape)) {
        issues.push({
          pointer: at(path),
          message:
            kind === "media"
              ? "A $media reference is allowed only in a media field or seo.image."
              : "An $entry reference is allowed only in an ordinary URL or reference field.",
        });
        return undefined;
      }
      const target = keys.entries.get(key);
      const behavior = target === undefined ? undefined : resolveModelKind(target);
      if (kind === "media" && !keys.media.has(key))
        issues.push({ pointer: at(path), message: "names no media item of the package." });
      else if (kind !== "media" && target === undefined)
        issues.push({ pointer: at(path), message: "names no entry of the package." });
      else if (kind !== "media" && behavior?.referenceTarget === false)
        issues.push({ pointer: at(path), message: "must name a page or collection entry." });
      else if (kind === "entry" && behavior?.routing === "none")
        issues.push({ pointer: at(path), message: "must name an entry with a route." });
      else if (kind === "reference" && !shape?.models?.includes(target!.key))
        issues.push({
          pointer: at(path),
          message: "names an entry of a model this field does not allow.",
        });
      else references.push({ kind, key, pointer: at(path) });
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
    onReference: (kind, key, _path, shape) =>
      allowsMarker(kind, shape) ? resolve(kind, key) : undefined,
  });
}

/** Placeholder identifiers for local validation; existence is not checked in drafts. */
export function placeholderResolver(kind: ReferenceKind, key: string): string {
  return kind === "entry" ? encodeEntryLink(`import-entry-${key}`) : `import-${kind}-${key}`;
}

/** Resolves known IDs and omits marker locations whose targets do not yet exist. */
export function idResolver(
  mediaIds: ReadonlyMap<string, string>,
  entryIds: ReadonlyMap<string, string>,
): Resolver {
  return (kind, key) => {
    const id = kind === "media" ? mediaIds.get(key) : entryIds.get(key);
    if (id === undefined) return STRIP;
    return kind === "entry" ? encodeEntryLink(id) : id;
  };
}
