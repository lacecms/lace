import type { NormalizedContentModel } from "@lacecms/config";
import {
  collectFieldMedia,
  collectSnapshotInternalLinks,
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
} from "@lacecms/content";
import { blockKey, mediaId } from "@lacecms/domain";
import type { ContentBlock, DraftMediaReference } from "@lacecms/domain";
import type { PublishedProjection } from "../ports/content.js";
import type { ContentUseCaseDependencies } from "./use-case-inputs.js";
import { detached } from "./draft-normalization.js";
import type { NormalizedDraft } from "./draft-normalization.js";
type ModelFieldMap = Readonly<Record<string, FieldDefinition>>;

export function internalLinks(
  dependencies: ContentUseCaseDependencies,
  model: NormalizedContentModel,
  fields: JsonObject,
  blocks: readonly Pick<ContentBlock, "data" | "hidden" | "key" | "type">[],
): readonly InternalLinkReference[] {
  return collectSnapshotInternalLinks(
    model.fields,
    fields,
    blocks.map((block) => {
      const definition = dependencies.config.blocks.get(block.type)!;
      return {
        ...block,
        fields: definition.fields,
        ...(definition.visibility === undefined
          ? {}
          : { visibility: definition.visibility as FieldVisibility }),
      };
    }),
    model.visibility as FieldVisibility | undefined,
  );
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
  dependencies: ContentUseCaseDependencies,
  visibilityOwners: Map<string, boolean>,
  model: NormalizedContentModel,
  draft: NormalizedDraft,
): PublishedProjection | undefined {
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
  return detached({
    blocks: blocks.map(({ data, key }) => ({ data, key })),
    fields,
    internalLinks: internalLinks(dependencies, model, fields, blocks),
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
