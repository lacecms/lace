import type { NormalizedContentModel } from "@lacecms/config";
import {
  collectFieldMedia,
  collectSnapshotEntryReferences,
  declaresFieldVisibility,
  encodeFieldPath,
  publishedBlockData,
  publishedFieldValues,
} from "@lacecms/content";
import type {
  InternalLinkReference,
  FieldVisibility,
  FieldDefinition,
  JsonObject,
  SnapshotEntryReference,
} from "@lacecms/content";
import { blockKey, contentModelKey, mediaId } from "@lacecms/domain";
import type { ContentBlock, DraftMediaReference } from "@lacecms/domain";
import type { EntryReferenceCandidate, PublishedProjection } from "../ports/content.js";
import type { ContentUseCaseDependencies } from "./use-case-inputs.js";
import { detached } from "./draft-normalization.js";
import type { NormalizedDraft } from "./draft-normalization.js";
type ModelFieldMap = Readonly<Record<string, FieldDefinition>>;

export function snapshotEntryReferences(
  dependencies: { readonly config: Pick<ContentUseCaseDependencies["config"], "blocks"> },
  model: NormalizedContentModel,
  fields: JsonObject,
  blocks: readonly {
    readonly data: ContentBlock["data"];
    readonly hidden?: boolean;
    readonly key: string;
    readonly type: string;
  }[],
): readonly SnapshotEntryReference[] {
  return collectSnapshotEntryReferences(
    model.fields,
    fields,
    blocks.map((block) => {
      const definition = dependencies.config.blocks.get(block.type)!;
      return {
        ...block,
        fields: definition?.fields ?? {},
        ...(definition?.visibility === undefined
          ? {}
          : { visibility: definition.visibility as FieldVisibility }),
      };
    }),
    model.visibility as FieldVisibility | undefined,
  );
}

export function snapshotUrlLinks(
  references: readonly SnapshotEntryReference[],
): readonly InternalLinkReference[] {
  return references
    .filter((row) => row.purpose === "url")
    .map(({ purpose: _purpose, ...row }) => row);
}

export function entryReferenceCandidate(
  model: NormalizedContentModel,
  references: readonly SnapshotEntryReference[],
  guardEmpty = false,
): EntryReferenceCandidate | undefined {
  const selections = references.filter((row) => row.purpose === "reference");
  if (selections.length || guardEmpty)
    return {
      modelKey: contentModelKey(model.key),
      structureHash: model.structureHash,
      references: selections,
    };
}

/** Whether a model or block type declares conditional-field rules anywhere. */
function declaresVisibility(
  visibilityOwners: Map<string, boolean>,
  owner: string,
  fields: ModelFieldMap,
  rules: unknown,
): boolean {
  let declared = visibilityOwners.get(owner);
  if (declared === undefined) {
    declared = declaresFieldVisibility(fields, rules as FieldVisibility | undefined);
    visibilityOwners.set(owner, declared);
  }
  return declared;
}

/**
 * The published projection of a validated draft and its references, or
 * `undefined` when neither its model nor its blocks declare rules, so the
 * repository copies the draft as before.
 */
export function publishedProjection(
  dependencies: Pick<ContentUseCaseDependencies, "config">,
  visibilityOwners: Map<string, boolean>,
  model: NormalizedContentModel,
  draft: NormalizedDraft,
):
  | (PublishedProjection & { readonly entryReferences: readonly SnapshotEntryReference[] })
  | undefined {
  const registry = dependencies.config.blocks;
  if (
    !declaresVisibility(visibilityOwners, `model:${model.key}`, model.fields, model.visibility) &&
    !draft.blocks.some((block) => {
      const definition = registry.get(block.type)!;
      return declaresVisibility(
        visibilityOwners,
        `block:${block.type}`,
        definition.fields,
        definition.visibility,
      );
    })
  )
    return undefined;
  const fields = publishedFieldValues(
    model.fields,
    draft.fields,
    model.visibility as FieldVisibility | undefined,
  );
  const blocks = draft.blocks.map((block) => ({
    ...block,
    data: publishedBlockData(registry.get(block.type)!, block.data),
  }));
  const mediaReferences = collectMedia(fields, model.fields, "$fields");
  if (draft.seo?.image !== undefined)
    mediaReferences.push({
      fieldPath: "image",
      mediaId: mediaId(draft.seo.image),
      sourceKey: "$seo",
    });
  for (const block of blocks)
    mediaReferences.push(...collectMedia(block.data, registry.get(block.type)!.fields, block.key));
  const entryReferences = snapshotEntryReferences(dependencies, model, fields, blocks);
  return detached({
    blocks: blocks.map(({ data, key }) => ({ data, key })),
    fields,
    internalLinks: snapshotUrlLinks(entryReferences),
    entryReferences,
    mediaReferences,
  });
}

export function collectMedia(
  values: JsonObject,
  definitions: Readonly<Record<string, FieldDefinition>>,
  sourceKey: "$fields" | ReturnType<typeof blockKey>,
): DraftMediaReference[] {
  return collectFieldMedia(definitions, values).map(({ mediaId: id, path }) => ({
    fieldPath: encodeFieldPath(path),
    mediaId: mediaId(id),
    sourceKey,
  }));
}
