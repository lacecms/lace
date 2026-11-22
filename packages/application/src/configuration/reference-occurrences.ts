import { parseSchemaPath, schemaFieldAt } from "@lacecms/content";
import type {
  FieldVisibility,
  ModelFieldDefinitions,
  SnapshotEntryReference,
} from "@lacecms/content";
import type { ContentModelStructure } from "@lacecms/config";
import type {
  ConfigurationSyncEntryUsage,
  ConfigurationSyncReferenceCheck,
  ConfigurationSyncReferenceRenames,
  StructuralChange,
} from "./types.js";

export interface ReferenceBlockDescriptor {
  readonly type: string;
  readonly version: number;
  readonly fields: ModelFieldDefinitions;
  readonly visibility?: FieldVisibility;
}

export function referenceBlockDescriptors(
  structure: ContentModelStructure | undefined,
): ReadonlyMap<string, ReferenceBlockDescriptor> {
  const blocks = structure?.blockDefinitions as readonly ReferenceBlockDescriptor[] | undefined;
  return new Map(blocks?.map((block) => [block.type, block]));
}

function pathParts(pointer: string): string[] {
  return pointer
    .slice(1)
    .split("/")
    .map((key) => key.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function schemaPart(part: string): string {
  return /^(0|[1-9][0-9]*)$/u.test(part) ? "*" : part;
}

function movedPointer(pointer: string, changes: readonly StructuralChange[]): string {
  const parts = pathParts(pointer);
  for (const change of changes) {
    if (change.kind !== "field-renamed" || change.from === undefined) continue;
    const from = parseSchemaPath(change.from);
    if (from.every((part, index) => part === schemaPart(parts[index] ?? "")))
      parts[from.length - 1] = parseSchemaPath(change.target).at(-1)!;
  }
  return "/" + parts.map((key) => key.replaceAll("~", "~0").replaceAll("/", "~1")).join("/");
}

function location(reference: ConfigurationSyncEntryUsage, pointer = reference.pointer): string {
  return JSON.stringify([reference.sourceKey, reference.area, pointer, reference.targetId]);
}

/** A retained orphan can follow a reviewed model-field rename or allowlist widening. */
export function referenceSelections(input: {
  readonly references: readonly SnapshotEntryReference[];
  readonly prior: readonly ConfigurationSyncEntryUsage[];
  readonly priorFields: ModelFieldDefinitions;
  readonly priorBlockFields: ReadonlyMap<string, ModelFieldDefinitions>;
  readonly changes?: readonly StructuralChange[];
  readonly renames: ConfigurationSyncReferenceRenames;
}): ConfigurationSyncReferenceCheck["selections"] {
  const changes = (input.changes ?? [])
    .filter((change) => change.kind === "field-renamed")
    .sort((a, b) => parseSchemaPath(a.target).length - parseSchemaPath(b.target).length);
  const modelKeys = new Map(input.renames);
  const prior = new Map<string, readonly string[]>();
  for (const row of input.prior) {
    if (row.purpose !== "reference") continue;
    const fields =
      row.area === "fields" ? input.priorFields : input.priorBlockFields.get(row.sourceKey);
    const allowed = fields && schemaFieldAt(fields, pathParts(row.pointer).map(schemaPart));
    if (allowed?.type !== "reference") continue;
    const pointer = row.area === "fields" ? movedPointer(row.pointer, changes) : row.pointer;
    prior.set(
      location(row, pointer),
      allowed.models.map((key) => modelKeys.get(key) ?? key),
    );
  }
  return input.references.flatMap((reference) => {
    if (reference.purpose !== "reference") return [];
    const allowed = prior.get(location(reference));
    return [
      { reference, allowMissing: allowed?.every((key) => reference.models.includes(key)) ?? false },
    ];
  });
}

/** Whether either the stored or prospective configuration declares typed references. */
export function declaresSyncReferences(structure: ContentModelStructure | undefined): boolean {
  function hasReference(definition: ModelFieldDefinitions[string]): boolean {
    switch (definition.type) {
      case "reference":
        return true;
      case "group":
        return Object.values(definition.fields).some(hasReference);
      case "list":
        return hasReference(definition.item);
      default:
        return false;
    }
  }
  const fields = (structure?.fields ?? {}) as ModelFieldDefinitions;
  return (
    Object.values(fields).some(hasReference) ||
    [...referenceBlockDescriptors(structure).values()].some((block) =>
      Object.values(block.fields).some(hasReference),
    )
  );
}
