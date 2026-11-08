import type { ValidationPathSegment } from "../shared/errors.js";
import { invalid } from "../shared/errors.js";
import type {
  ModelFieldDefinitions,
  FieldDefinition,
  FieldVisibility,
} from "../fields/definitions.js";
import type { JsonObject, JsonValue } from "../shared/json.js";
import { decodeEntryLink, MAX_INTERNAL_LINK_REFERENCES } from "../fields/internal-link-tokens.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import { declaresFieldVisibility, publishedFieldValues } from "../fields/validation.js";

/** A declared ordinary URL leaf, relative to its field map. */
export interface FieldInternalLinkReference {
  readonly targetId: string;
  readonly path: readonly ValidationPathSegment[];
}

/** Discover references only in normalized ordinary URL descriptors. */
export function collectFieldInternalLinks(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
): readonly FieldInternalLinkReference[] {
  const references: FieldInternalLinkReference[] = [];
  function visit(
    definition: FieldDefinition,
    value: JsonValue | undefined,
    path: readonly ValidationPathSegment[],
  ): void {
    if (definition.type === "url" && definition.embedProviders === undefined) {
      const targetId = decodeEntryLink(value);
      if (targetId !== undefined) references.push({ targetId, path });
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
  return deepFreeze(references);
}

/** A source-scoped reference tuple, ready for persistence and public manifests. */
export interface InternalLinkReference {
  readonly sourceKey: string;
  readonly area: "fields" | "data";
  readonly pointer: string;
  readonly targetId: string;
  readonly delivered: boolean;
}

/** The local manifest location delivered to site consumers. */
export type PublicInternalLinkReference = Omit<InternalLinkReference, "delivered">;

/** Collect and bound every declared internal URL in one normalized snapshot. */
export function collectSnapshotInternalLinks(
  fields: ModelFieldDefinitions,
  values: JsonObject,
  blocks: readonly {
    readonly key: string;
    readonly fields: ModelFieldDefinitions;
    readonly data: JsonObject;
    readonly hidden?: boolean;
    /** The block's data rules; links inside hidden targets are not delivered. */
    readonly visibility?: FieldVisibility;
  }[],
  visibility?: FieldVisibility,
): readonly InternalLinkReference[] {
  const references: InternalLinkReference[] = [];
  const pointerOf = (path: readonly ValidationPathSegment[]) =>
    `/${path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
  function add(
    definitions: ModelFieldDefinitions,
    data: JsonObject,
    sourceKey: string,
    area: "fields" | "data",
    delivered: boolean,
    rootPath: readonly ValidationPathSegment[],
    rules: FieldVisibility | undefined,
  ): void {
    // The projection keeps paths, so a link is visible exactly when it survives it.
    const visible = declaresFieldVisibility(definitions, rules)
      ? new Set(
          collectFieldInternalLinks(
            definitions,
            publishedFieldValues(definitions, data, rules),
          ).map((reference) => pointerOf(reference.path)),
        )
      : undefined;
    for (const reference of collectFieldInternalLinks(definitions, data)) {
      if (references.length === MAX_INTERNAL_LINK_REFERENCES)
        invalid(
          [...rootPath, ...reference.path],
          "too_many_internal_links",
          `must not contain more than ${MAX_INTERNAL_LINK_REFERENCES} internal links.`,
        );
      const pointer = pointerOf(reference.path);
      references.push({
        sourceKey,
        area,
        delivered: delivered && (visible === undefined || visible.has(pointer)),
        targetId: reference.targetId,
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
