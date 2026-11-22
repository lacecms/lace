import type { NormalizedContentModel } from "@lacecms/config";
import { ContentValidationError, MAX_DRAFT_MEDIA_REFERENCES } from "@lacecms/content";
import { DomainError, mediaId, resolveModelKind } from "@lacecms/domain";
import type { CompleteDraftInput, ContentUseCaseDependencies } from "./use-case-inputs.js";
import { normalizeDraftCandidate } from "./draft-normalization.js";
import type { NormalizedDraft } from "./draft-normalization.js";
import { internalLinkIssuePath } from "./internal-links.js";
import { markRouteLessTargets, routeLessModelKeys } from "./route-less-links.js";
import {
  collectMedia,
  snapshotEntryReferences,
  snapshotUrlLinks,
} from "./publication-projection.js";

export async function validateDraft(
  dependencies: Pick<ContentUseCaseDependencies, "config" | "media"> & {
    readonly content: Partial<import("../ports/links.js").ContentLinkReadPort>;
  },
  input: CompleteDraftInput,
  model: NormalizedContentModel,
  mode: "draft" | "publish",
  publishingEntryId?: string,
): Promise<NormalizedDraft> {
  const normalized = normalizeDraftCandidate({
    blocks: dependencies.config.blocks,
    draft: input,
    mode,
    model,
  });
  const mediaReferences = collectMedia(normalized.fields, model.fields, "$fields");
  if (normalized.seo?.image !== undefined) {
    mediaReferences.push({
      fieldPath: "image",
      mediaId: mediaId(normalized.seo.image),
      sourceKey: "$seo",
    });
  }
  for (const block of normalized.blocks) {
    mediaReferences.push(
      ...collectMedia(block.data, dependencies.config.blocks.get(block.type)!.fields, block.key),
    );
  }
  if (mediaReferences.length > MAX_DRAFT_MEDIA_REFERENCES) {
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      `A draft must not contain more than ${MAX_DRAFT_MEDIA_REFERENCES} media references.`,
    );
  }
  const ids = [...new Set(mediaReferences.map((reference) => reference.mediaId))];
  const active = new Set(
    (ids.length === 0 ? [] : await dependencies.media.loadMediaMany(ids))
      .filter((media) => media.status === "active")
      .map((media) => media.id),
  );
  for (const id of ids) {
    if (!active.has(id))
      throw new DomainError("CONTENT_INVALID_STATE", `Media ${id} is unavailable.`);
  }
  // Links inside hidden targets are not delivered, so publication never checks them.
  const entryReferences = snapshotEntryReferences(
    dependencies,
    model,
    normalized.fields,
    normalized.blocks,
  );
  const internalLinks = snapshotUrlLinks(entryReferences);
  if (internalLinks.length > 0) {
    if (dependencies.content.resolveLinkTargets === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Internal link validation is unavailable.");
    const statuses = markRouteLessTargets(
      await dependencies.content.resolveLinkTargets([
        ...new Set(internalLinks.map((reference) => reference.targetId)),
      ]),
      routeLessModelKeys(dependencies.config.content),
    );
    const routable = resolveModelKind(model).routing !== "none";
    const issues = internalLinks.flatMap((reference) => {
      const status = statuses[reference.targetId];
      const self = publishingEntryId === reference.targetId && routable;
      const nonRoutable = status?.state === "non-routable";
      if (
        !nonRoutable &&
        (mode === "draft" || !reference.delivered || self || status?.state === "published")
      )
        return [];
      return [
        {
          code: nonRoutable ? "internal_link_non_routable" : "internal_link_unavailable",
          message: nonRoutable
            ? "must target a page or an entry of a collection with a route."
            : "must target an entry with a published route.",
          path: internalLinkIssuePath(
            reference,
            normalized.blocks.map((block) => block.key),
          ),
        },
      ];
    });
    if (issues.length > 0) throw new ContentValidationError(issues);
  }
  return {
    ...normalized,
    mediaReferences: Object.freeze(mediaReferences),
    internalLinks,
    entryReferences,
  };
}
