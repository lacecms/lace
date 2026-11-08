import type { OpaqueCursor } from "../shared/brands.js";

export type LinkImpactAction = "delete" | "unpublish";
export type LinkTargetStatus =
  | { readonly id: string; readonly state: "missing" }
  | { readonly id: string; readonly state: "non-routable"; readonly modelKey: string }
  | {
      readonly id: string;
      readonly state: "unpublished";
      readonly modelKey: string;
      readonly modelKind: "page" | "collection";
      readonly title: string;
    }
  | {
      readonly id: string;
      readonly state: "published";
      readonly modelKey: string;
      readonly modelKind: "page" | "collection";
      readonly title: string;
      readonly path: string;
    };
export type RoutableLinkTarget = Extract<LinkTargetStatus, { readonly title: string }>;

export interface LinkTargetQuery {
  readonly modelKey?: string;
  readonly status?: "published" | "unpublished";
  readonly search?: string;
  readonly after?: OpaqueCursor;
  readonly limit: number;
}
export interface LinkTargetPage {
  readonly items: readonly RoutableLinkTarget[];
  readonly nextCursor?: OpaqueCursor;
}
export interface LinkUsageLocation {
  readonly sourceKey: string;
  readonly area: "fields" | "data";
  readonly pointer: string;
  readonly delivered: boolean;
}
export interface LinkUsageSource {
  readonly entryId: string;
  readonly snapshotId: string;
  readonly modelKey: string;
  readonly title: string;
  readonly phase: "draft" | "published";
  readonly locations: readonly LinkUsageLocation[];
  readonly nextLocationsCursor?: OpaqueCursor;
}
export interface LinkImpactQuery {
  readonly targetId: string;
  readonly action: LinkImpactAction;
  readonly limit: number;
  readonly after?: OpaqueCursor;
  readonly sourceEntryId?: string;
  readonly snapshotId?: string;
  readonly locationsAfter?: OpaqueCursor;
}
export type LinkImpactPage = {
  readonly hasPublishedUsages: boolean;
  readonly receipt: string;
} & (
  | {
      readonly mode: "sources";
      readonly sources: readonly LinkUsageSource[];
      readonly nextCursor?: OpaqueCursor;
    }
  | {
      readonly mode: "locations";
      readonly sourceEntryId: string;
      readonly snapshotId: string;
      readonly locations: readonly LinkUsageLocation[];
      readonly nextCursor?: OpaqueCursor;
    }
);

/** A concurrency precondition. It confers no authority to read or mutate content. */
export interface LinkImpactAcknowledgment {
  readonly receipt: string;
  readonly acknowledgePublishedLinks: true;
}
export interface LinkImpactEvidence {
  readonly version: 1;
  readonly targetId: string;
  readonly action: LinkImpactAction;
  readonly actorId: string;
  readonly draftRevision: number;
  readonly publishedSnapshotId: string | null;
  readonly graphRevision: number;
}
export interface ContentLinkReadPort {
  resolveLinkTargets(ids: readonly string[]): Promise<Readonly<Record<string, LinkTargetStatus>>>;
  listLinkTargets(input: LinkTargetQuery): Promise<LinkTargetPage>;
  readLinkImpact(input: LinkImpactQuery & { readonly actorId: string }): Promise<LinkImpactPage>;
}
