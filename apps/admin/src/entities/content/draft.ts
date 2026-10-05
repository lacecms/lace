import { canonicalizeJson, type JsonValue } from "@lacecms/content";
import type {
  ContentBlockDto,
  ContentEntryDto,
  ContentEntryStatusDto,
  ContentModelDto,
} from "@lacecms/contracts";
import {
  initialModelFieldValues,
  withoutClearedValues,
  type DraftEditorValues,
} from "./editor-form.js";

/** Form values for an entry draft, with block defaults filled from the block definitions. */
export function draftValues(model: ContentModelDto, entry: ContentEntryDto): DraftEditorValues {
  return {
    blocks: entry.draft.blocks.map((block) => {
      const definition = model.blockDefinitions?.find((item) => item.type === block.type);
      if (definition === undefined) return block;
      return {
        ...block,
        data: Object.fromEntries(
          Object.entries(definition.fields).map(([key, field]) => [
            key,
            block.data[key] ?? ("defaultValue" in field ? field.defaultValue : undefined),
          ]),
        ) as ContentBlockDto["data"],
      };
    }),
    fields: initialModelFieldValues(model, entry.draft.fields),
    ...(entry.draft.slug === undefined ? {} : { slug: entry.draft.slug }),
    title: entry.draft.title,
  };
}

/** The public path of the entry's published (or draft) route, when the model routes it. */
export function resolvedPublicPath(
  model: ContentModelDto,
  entry: ContentEntryDto,
): string | undefined {
  if (model.kind === "page") return model.path;
  const slug = (entry.published ?? entry.draft).slug;
  return slug === undefined ? undefined : model.route?.replace(":slug", slug);
}

/**
 * The entry's derived publication status, using the server's rule: no published
 * snapshot is a draft, and a published revision behind the draft is changed.
 */
export function entryStatus(entry: ContentEntryDto): ContentEntryStatusDto {
  if (entry.published === undefined) return "draft";
  return entry.published.revision === entry.draft.revision ? "published" : "changed";
}

/** Serializes the visible order without changing the editor's values or stable identities. */
export function orderedDraftBlocks(blocks: readonly ContentBlockDto[]): ContentBlockDto[] {
  return blocks.map((block, index) => ({ ...block, position: (index + 1) * 1_000 }));
}

/** Canonical JSON of the local draft so an author can keep it during a conflict. */
export function localDraftJson(draft: DraftEditorValues): string {
  const values = withoutClearedValues(draft);
  return canonicalizeJson({
    blocks: orderedDraftBlocks(values.blocks),
    fields: values.fields,
    ...(values.slug === undefined ? {} : { slug: values.slug }),
    title: values.title,
  } as unknown as JsonValue);
}

/** A human label for a field or block key when the definition supplies none. */
export function fieldLabel(key: string, label: string | undefined): string {
  return label ?? key.replace(/([A-Z])/gu, " $1").replace(/^./u, (value) => value.toUpperCase());
}
