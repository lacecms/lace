import type { ValidationPathSegment } from "../shared/errors.js";
import { invalid } from "../shared/errors.js";
import type {
  ModelFieldDefinitions,
  FieldDefinition,
  FieldVisibility,
} from "../fields/definitions.js";
import type { JsonObject, JsonValue } from "../shared/json.js";
import {
  decodeEntryLink,
  isInternalLinkTargetId,
  MAX_INTERNAL_LINK_REFERENCES,
} from "../fields/internal-link-tokens.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import { declaresFieldVisibility, publishedFieldValues } from "../fields/validation.js";
import { encodeFieldPointer } from "./field-paths.js";

/** A declared ordinary URL leaf, relative to its field map. */
export interface FieldInternalLinkReference {
  readonly targetId: string;
  readonly path: readonly ValidationPathSegment[];
}

type EntryReferenceTarget =
  | { readonly purpose: "url"; readonly targetId: string }
  | {
      readonly purpose: "reference";
      readonly targetId: string;
      readonly models: readonly string[];
    };

function collectFieldReferences(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
): readonly (EntryReferenceTarget & { readonly path: readonly ValidationPathSegment[] })[] {
  const references: (EntryReferenceTarget & { readonly path: readonly ValidationPathSegment[] })[] =
    [];
  function visit(
    definition: FieldDefinition,
    value: JsonValue | undefined,
    path: readonly ValidationPathSegment[],
  ): void {
    if (definition.type === "url" && definition.embedProviders === undefined) {
      const targetId = decodeEntryLink(value);
      if (targetId !== undefined) references.push({ purpose: "url", targetId, path });
    } else if (definition.type === "reference" && isInternalLinkTargetId(value)) {
      references.push({ purpose: "reference", targetId: value, models: definition.models, path });
    } else if (definition.type === "group" && isRecord(value)) {
      walk(definition.fields, value as JsonObject, path);
    } else if (definition.type === "list" && Array.isArray(value)) {
      value.forEach((item, index) => visit(definition.item, item, [...path, index]));
    }
  }
  function walk(
    fields: ModelFieldDefinitions,
    data: JsonObject,
    path: readonly ValidationPathSegment[],
  ): void {
    for (const [key, definition] of Object.entries(fields))
      visit(definition, data[key], [...path, key]);
  }
  walk(definitions, values, []);
  return references;
}

/** Discover references only in normalized ordinary URL descriptors. */
export function collectFieldInternalLinks(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
): readonly FieldInternalLinkReference[] {
  return deepFreeze(
    collectFieldReferences(definitions, values)
      .filter((reference) => reference.purpose === "url")
      .map(({ targetId, path }) => ({ targetId, path })),
  );
}

/** A source-scoped reference tuple, ready for persistence and public manifests. */
export interface InternalLinkReference {
  readonly sourceKey: string;
  readonly area: "fields" | "data";
  readonly pointer: string;
  readonly targetId: string;
  readonly delivered: boolean;
}

/** An occurrence with its purpose and, for a typed selection, permitted target models. */
export type SnapshotEntryReference = InternalLinkReference & EntryReferenceTarget;

/** The local manifest location delivered to site consumers. */
export type PublicInternalLinkReference = Omit<InternalLinkReference, "delivered">;

interface SnapshotReferenceBlock {
  readonly key: string;
  readonly fields: ModelFieldDefinitions;
  readonly data: JsonObject;
  readonly hidden?: boolean;
  readonly visibility?: FieldVisibility;
}

/** Collect and bound every authored entry occurrence in one normalized snapshot. */
export function collectSnapshotEntryReferences(
  fields: ModelFieldDefinitions,
  values: JsonObject,
  blocks: readonly SnapshotReferenceBlock[],
  visibility?: FieldVisibility,
): readonly SnapshotEntryReference[] {
  const references: SnapshotEntryReference[] = [];
  let includesTypedReference = false;
  function add(
    definitions: ModelFieldDefinitions,
    data: JsonObject,
    sourceKey: string,
    area: "fields" | "data",
    delivered: boolean,
    rootPath: readonly ValidationPathSegment[],
    rules: FieldVisibility | undefined,
  ): void {
    // The projection keeps paths, so a reference is visible exactly when it survives it.
    const visible =
      delivered && declaresFieldVisibility(definitions, rules)
        ? new Set(
            collectFieldReferences(definitions, publishedFieldValues(definitions, data, rules)).map(
              (reference) => encodeFieldPointer(reference.path),
            ),
          )
        : undefined;
    for (const { path, ...reference } of collectFieldReferences(definitions, data)) {
      includesTypedReference ||= reference.purpose === "reference";
      if (references.length === MAX_INTERNAL_LINK_REFERENCES)
        invalid(
          [...rootPath, ...path],
          "too_many_internal_links",
          `must not contain more than ${MAX_INTERNAL_LINK_REFERENCES} ${includesTypedReference ? "internal links and entry references combined" : "internal links"}.`,
        );
      const pointer = encodeFieldPointer(path);
      references.push({
        ...reference,
        sourceKey,
        area,
        delivered: delivered && (visible === undefined || visible.has(pointer)),
        pointer,
      });
    }
  }
  add(fields, values, "$fields", "fields", true, ["fields"], visibility);
  blocks.forEach((block, index) =>
    add(
      block.fields,
      block.data,
      block.key,
      "data",
      block.hidden !== true,
      ["blocks", index, "data"],
      block.visibility,
    ),
  );
  return deepFreeze(references);
}

/** Preserves the URL-only projection consumed by CE10 persistence and delivery. */
export function collectSnapshotInternalLinks(
  fields: ModelFieldDefinitions,
  values: JsonObject,
  blocks: readonly SnapshotReferenceBlock[],
  visibility?: FieldVisibility,
): readonly InternalLinkReference[] {
  return deepFreeze(
    collectSnapshotEntryReferences(fields, values, blocks, visibility)
      .filter((reference) => reference.purpose === "url")
      .map(({ purpose: _purpose, ...location }) => location),
  );
}
