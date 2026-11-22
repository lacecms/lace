import type { LinkImpactPagination, LinkImpactQuery } from "./links.js";
import type { OpaqueCursor } from "../shared/brands.js";

export interface ReferenceTargetQuery {
  readonly modelKey: string;
  readonly search?: string;
  readonly after?: OpaqueCursor;
  readonly limit: number;
}

export type ReferenceTarget = {
  readonly id: string;
  readonly modelKey: string;
  readonly modelKind: "page" | "collection";
  readonly title: string;
} & ({ readonly state: "unpublished" } | { readonly state: "published"; readonly path?: string });

export type ReferenceTargetStatus =
  | ReferenceTarget
  | { readonly id: string; readonly state: "missing" | "ineligible" };

export interface ReferenceTargetPage {
  readonly items: readonly ReferenceTarget[];
  readonly nextCursor?: OpaqueCursor;
}

export type ReferenceImpactQuery = LinkImpactQuery;
export type ReferenceImpactPage = LinkImpactPagination & {
  readonly hasPublishedBlockers: boolean;
  readonly hasDraftUsages: boolean;
  readonly receipt?: string;
};

/** Concurrency precondition for the reviewed draft impact of a deletion. */
export interface ReferenceImpactAcknowledgment {
  readonly receipt: string;
  readonly acknowledgeDraftReferences: true;
}

export interface ContentReferenceReadPort {
  readReferenceImpact(
    input: ReferenceImpactQuery & { readonly actorId: string },
  ): Promise<ReferenceImpactPage>;
  resolveReferenceTargets(
    ids: readonly string[],
  ): Promise<Readonly<Record<string, ReferenceTargetStatus>>>;
  listReferenceTargets(input: ReferenceTargetQuery): Promise<ReferenceTargetPage>;
}
