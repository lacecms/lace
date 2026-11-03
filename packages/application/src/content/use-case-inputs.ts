import type { ListQueryLimits } from "./collection-queries.js";
import type {
  RuntimeConfigProjection,
  CollectionListOptions,
  ModelSeoDefinition,
  SeoDefaultsDefinition,
} from "@lacecms/config";
import type {
  BlockMetadata,
  FieldVisibility,
  FormLayout,
  FieldDefinition,
  JsonObject,
} from "@lacecms/content";

import type {
  Actor,
  ContentBlockInput,
  ContentEntry,
  ContentEntryId,
  ContentModelKind,
  ContentModelKey,
  ContentSnapshotId,
  MediaId,
} from "@lacecms/domain";
import type { ActorSummary } from "../shared/actors.js";
import type { Clock, IdGenerator } from "../ports/infrastructure.js";
import type {
  ContentEntryCommandPort,
  ContentEntryReadPort,
  PublicContentReadPort,
} from "../ports/content.js";
import type { ContentMediaReadPort } from "../ports/media.js";
import type { OpaqueCursor } from "../shared/brands.js";
import type { ContentLinkReadPort, LinkImpactAcknowledgment } from "../ports/links.js";

export interface ContentUseCaseDependencies {
  readonly listQueryLimits?: ListQueryLimits;
  readonly clock: Clock;
  readonly config: RuntimeConfigProjection;
  readonly content: ContentEntryReadPort &
    ContentEntryCommandPort &
    PublicContentReadPort &
    Partial<ContentLinkReadPort>;
  readonly idGenerator: IdGenerator;
  readonly media: ContentMediaReadPort;
}

/** Authorized, JSON-safe configuration metadata; no hashes, migrations or validators. */
export interface DiscoveredContentModel {
  readonly visibility?: FieldVisibility;
  readonly key: string;
  readonly kind: ContentModelKind;
  readonly version: number;
  readonly label?: string;
  readonly description?: string;
  readonly fields: Readonly<Record<string, FieldDefinition>>;
  readonly blocks: readonly string[];
  readonly blockDefinitions: readonly BlockMetadata[];
  readonly layout?: FormLayout;
  readonly listFields?: readonly string[];
  readonly listOptions?: CollectionListOptions;
  readonly path?: string;
  readonly route?: string;
  readonly seo?: ModelSeoDefinition;
  readonly seoDefaults?: SeoDefaultsDefinition;
}
export interface ContentModelDiscovery {
  readonly items: readonly DiscoveredContentModel[];
  readonly listQueryLimits: ListQueryLimits;
}
export interface AdminContentEntryProjection {
  readonly entry: ContentEntry;
  readonly updatedBy: ActorSummary;
  readonly seo: boolean;
}

export interface CompleteDraftInput {
  /** Omitted envelope values take their defaults (visible, declared setting defaults). */
  readonly blocks: readonly ContentBlockInput[];
  readonly fields: JsonObject;
  /**
   * The submitted SEO group; absent or `null` stores none. Validated against the
   * shared rules, and refused for a model without SEO.
   */
  readonly seo?: unknown;
  readonly slug?: string;
  readonly title: string;
}

export interface CreateContentEntryUseCaseInput extends CompleteDraftInput {
  readonly actor: Actor;
  readonly modelKey: ContentModelKey | string;
}

export interface ListContentEntriesUseCaseInput {
  readonly filters?: unknown;
  readonly actor: Actor;
  readonly after?: OpaqueCursor;
  readonly limit: number;
  readonly modelKey: string;
  readonly q?: string;
  /** Exact current draft slug; collection models only. */
  readonly slug?: string;
  readonly sort?: string;
  readonly status?: string;
}

export interface DescribeActorUseCaseInput {
  readonly actor: Actor;
  readonly actorId: Actor["id"];
}

export interface LoadContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
}

export interface SaveContentDraftUseCaseInput extends CompleteDraftInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
}

export interface PublishContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
  readonly idempotencyKey?: string;
}

export interface UnpublishContentEntryUseCaseInput {
  readonly linkImpact?: LinkImpactAcknowledgment;
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedPublishedSnapshotId: ContentSnapshotId;
  readonly idempotencyKey?: string;
}

export interface RevertContentDraftUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
}

export interface DuplicateContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  /** When supplied, the source draft must still be at this revision. */
  readonly expectedRevision?: number;
}

export interface DetachMediaFromDraftUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly mediaId: MediaId;
}

export interface DeleteContentEntryUseCaseInput {
  readonly linkImpact?: LinkImpactAcknowledgment;
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
}

export type BuildDispatchOutcome =
  | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
  | Readonly<{ readonly status: "not-dispatched" }>;

export interface PublishContentEntryUseCaseResult {
  readonly build: BuildDispatchOutcome;
  readonly entry: ContentEntry;
  readonly publication: "published" | "replayed";
}

export interface UnpublishContentEntryUseCaseResult {
  readonly build: BuildDispatchOutcome;
  readonly entry: ContentEntry;
  readonly unpublication: "replayed" | "unpublished";
}
