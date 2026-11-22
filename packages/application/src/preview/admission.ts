import { contentPublicPath, PREVIEW_MAX_MODELS, resolveModelKind } from "@lacecms/domain";
import type { Actor, PreviewFailureReason } from "@lacecms/domain";
import type { ContentUseCaseDependencies } from "../content/use-case-inputs.js";
import { contentModelRoute } from "../shared/model-route.js";
import { validateDraft } from "../content/draft-validation.js";
import { publishedProjection } from "../content/publication-projection.js";
import type {
  PreviewAdmission,
  PreviewCapturePort,
  PreviewReadPort,
  PreviewRequest,
  PreviewSource,
  PreviewStatus,
} from "../ports/preview.js";
import type { ContentEntryReadPort } from "../ports/content.js";
import type { ContentLinkReadPort } from "../ports/links.js";
import { requireSessionActor } from "../shared/permissions.js";

export interface PreviewAdmissionDependencies extends Pick<
  ContentUseCaseDependencies,
  "clock" | "config" | "idGenerator" | "media"
> {
  readonly content: Pick<ContentEntryReadPort, "load"> &
    Pick<ContentLinkReadPort, "resolveLinkTargets">;
  readonly preview: PreviewReadPort & Pick<PreviewCapturePort, "admitPreview">;
  /** Exists only when the operator's preview configuration and source have been verified. */
  readonly source?: PreviewSource;
  /** VPS reserves physical capacity before SQL can replace a ready preview. */
  readonly reserveSource?: (id: string) => Promise<PreviewSourceReservation>;
}

export type PreviewSourceReservation =
  | { readonly source: PreviewSource; readonly release: () => Promise<void> }
  | { readonly reason: PreviewFailureReason };

function configurationMatches(
  identity: string,
  config: PreviewAdmissionDependencies["config"],
): boolean {
  const stored = new Map<string, readonly unknown[]>(
    (JSON.parse(identity) as readonly (readonly [string, ...unknown[]])[]).map(
      ([key, ...parts]) => [key, parts],
    ),
  );
  return (
    stored.size === config.content.length &&
    config.content.every((model) => {
      const row = stored.get(model.key);
      return (
        row?.[0] === model.kind &&
        row[1] === model.version &&
        row[2] === model.structureHash &&
        row[3] === model.projectionHash
      );
    })
  );
}

export class PreviewAdmissionService {
  private readonly visibilityOwners = new Map<string, boolean>();
  public constructor(private readonly dependencies: PreviewAdmissionDependencies) {}

  public async status(
    actor: Actor,
    entryId: PreviewRequest["entryId"],
  ): Promise<PreviewStatus | null> {
    requireSessionActor(actor, "content:read");
    return this.dependencies.preview.currentPreview(entryId, this.dependencies.clock.now());
  }

  public async create(actor: Actor, request: PreviewRequest): Promise<PreviewAdmission> {
    requireSessionActor(actor, "content:write");
    const { source, reserveSource, preview, content, config, clock, idGenerator } =
      this.dependencies;
    if (!source && !reserveSource)
      return { kind: "rejected", reason: "PREVIEW_CONFIGURATION_UNAVAILABLE" };
    const prior = await preview.findPreviewRequest({ ...request, actorId: actor.id });
    if (prior !== null) return prior;

    if (config.content.length > PREVIEW_MAX_MODELS)
      return { kind: "rejected", reason: "PREVIEW_RESOURCE_LIMIT" };
    const fence = await preview.previewCaptureFence();
    if (!configurationMatches(fence.configuration, config))
      return { kind: "rejected", reason: "PREVIEW_CONFIGURATION_UNAVAILABLE" };
    const entry = await content.load({ entryId: request.entryId });
    const model = config.content.find((candidate) => candidate.key === entry?.model.key);
    if (entry === null || model === undefined || resolveModelKind(model).routing === "none")
      return { kind: "rejected", reason: "PREVIEW_INELIGIBLE" };
    if (entry.draft.revision !== request.expectedRevision)
      return { kind: "rejected", reason: "PREVIEW_REVISION_CONFLICT" };

    const draft = await validateDraft(this.dependencies, entry.draft, model, "publish", entry.id);
    const path = contentPublicPath(contentModelRoute(model), draft.slug)!;
    const publication =
      publishedProjection(this.dependencies, this.visibilityOwners, model, draft) ?? draft;
    const references = publication.entryReferences.filter(
      (reference) => reference.purpose === "reference" && reference.delivered,
    );
    const visible = new Set(
      draft.blocks.filter((block) => !block.hidden).map((block) => block.key),
    );
    const id = idGenerator.next();
    const reservation = await reserveSource?.(id);
    if (reservation && "reason" in reservation) {
      const raced = await preview.findPreviewRequest({ ...request, actorId: actor.id });
      return raced ?? { kind: "rejected", reason: reservation.reason };
    }
    const selected = reservation?.source ?? source!;
    let admitted = false;
    try {
      if (
        !/^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/u.test(selected.commit) ||
        !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/u.test(selected.executor)
      )
        return { kind: "rejected", reason: "PREVIEW_SOURCE_UNAVAILABLE" };
      const result = await preview.admitPreview({
        ...request,
        ...fence,
        id,
        actorId: actor.id,
        draftSnapshotId: entry.draft.id,
        modelKey: entry.model.key,
        path,
        source: selected,
        now: clock.now(),
        ...(references.length > 0 && {
          referenceCandidate: { references, blockKeys: draft.blocks.map((block) => block.key) },
        }),
        projection: {
          fields: publication.fields,
          blocks: publication.blocks.filter((block) => visible.has(block.key)),
          internalLinks: publication.internalLinks.filter((link) => link.delivered),
          mediaReferences: publication.mediaReferences.filter(
            ({ sourceKey }) =>
              sourceKey === "$fields" || sourceKey === "$seo" || visible.has(sourceKey),
          ),
        },
      });
      admitted = result.kind === "admitted";
      return result;
    } finally {
      if (!admitted) await reservation?.release().catch(() => undefined);
    }
  }
}
