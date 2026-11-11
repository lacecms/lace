import type { NormalizedContentModel, RuntimeConfigProjection } from "@lacecms/config";
import { MAX_TITLE_LENGTH, validateEntryAggregate } from "@lacecms/content";
import type { InternalLinkReference, JsonObject } from "@lacecms/content";

import {
  assertOrderedBlockPositions,
  blockKey,
  contentModelKey,
  normalizeEntrySeo,
} from "@lacecms/domain";
import type {
  ContentBlock,
  ContentModelRoute,
  DraftMediaReference,
  EntrySeo,
} from "@lacecms/domain";

import type { CompleteDraftInput } from "./use-case-inputs.js";
const DUPLICATE_TITLE_SUFFIX = " (copy)";

/**
 * Appends the duplicate suffix, shortening the source title so the result
 * fits the shared title limit without leaving a lone surrogate.
 */
export function duplicateTitle(title: string): string {
  const room = MAX_TITLE_LENGTH - DUPLICATE_TITLE_SUFFIX.length;
  if (title.length <= room) return `${title}${DUPLICATE_TITLE_SUFFIX}`;
  let base = title.slice(0, room);
  const last = base.charCodeAt(base.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) base = base.slice(0, -1);
  return `${base}${DUPLICATE_TITLE_SUFFIX}`;
}

export interface NormalizedDraft extends Omit<CompleteDraftInput, "seo"> {
  readonly internalLinks: readonly InternalLinkReference[];
  readonly blocks: readonly ContentBlock[];
  readonly fields: JsonObject;
  readonly mediaReferences: readonly DraftMediaReference[];
  readonly seo?: EntrySeo;
}

/** Whether a configured model enables the per-entry SEO group. */
export function seoEnabled(model: NormalizedContentModel): boolean {
  return model.kind !== "global" && model.seo !== undefined;
}

export function detached<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

/** Maps a configured model to the route identity stored with its entries. */
export function contentModelRoute(model: NormalizedContentModel): ContentModelRoute {
  const key = contentModelKey(model.key);
  switch (model.kind) {
    case "page":
      return { key, kind: "page", path: model.path };
    case "collection":
      return model.route === undefined
        ? { key, kind: "collection" }
        : { key, kind: "collection", route: model.route };
    case "global":
      return { key, kind: "global" };
    default:
      return model satisfies never;
  }
}

/** A global's title is system-owned: always its model label, or its key. */
export function systemTitle(model: NormalizedContentModel, title: string): string {
  return model.kind === "global" ? (model.label ?? model.key) : title;
}

/** Input of {@link normalizeDraftCandidate}. */
export interface NormalizeDraftCandidateInput {
  readonly blocks: RuntimeConfigProjection["blocks"];
  readonly draft: CompleteDraftInput;
  readonly mode: "draft" | "publish";
  readonly model: NormalizedContentModel;
}

/** The draft values a create, save or publish stores for a valid submission. */
export interface NormalizedDraftCandidate {
  readonly blocks: readonly ContentBlock[];
  readonly fields: JsonObject;
  readonly seo?: EntrySeo;
  readonly slug?: string;
  readonly title: string;
}

/**
 * Validates and normalizes a submitted draft exactly as the content use cases
 * store it. Pure: no persistence, authorization, media or link-target checks,
 * so clients can predict whether a save would change the stored draft.
 */
export function normalizeDraftCandidate(
  input: NormalizeDraftCandidateInput,
): NormalizedDraftCandidate {
  const { blocks: registry, draft, mode, model } = input;
  assertOrderedBlockPositions(draft.blocks);
  const aggregate = validateEntryAggregate(
    {
      blocks: draft.blocks.map(
        ({ anchor, className, data, hidden, key, schemaVersion, settings, type }) => ({
          ...(anchor === undefined ? {} : { anchor }),
          ...(className === undefined ? {} : { className }),
          data,
          ...(hidden === undefined ? {} : { hidden }),
          key,
          schemaVersion,
          ...(settings === undefined ? {} : { settings }),
          type,
        }),
      ),
      fields: draft.fields,
      kind: model.kind,
      ...(draft.slug === undefined ? {} : { slug: draft.slug }),
      title: systemTitle(model, draft.title),
    },
    model.kind === "collection" && model.route === undefined
      ? { ...model, routeLess: true }
      : model,
    registry,
    mode,
  );
  const blocks: ContentBlock[] = aggregate.blocks.map((block, index) => ({
    ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
    ...(block.className === undefined ? {} : { className: block.className }),
    data: block.data as JsonObject,
    hidden: block.hidden,
    key: blockKey(block.key),
    position: draft.blocks[index]!.position,
    schemaVersion: block.schemaVersion,
    settings: block.settings,
    type: block.type,
  }));
  const seo = normalizeEntrySeo(draft.seo ?? null, { enabled: seoEnabled(model) });
  return {
    blocks,
    fields: aggregate.fields as JsonObject,
    ...(seo === undefined ? {} : { seo }),
    ...(aggregate.slug === undefined ? {} : { slug: aggregate.slug }),
    title: aggregate.title,
  };
}
