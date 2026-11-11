import { pagePathFailure, collectionRouteFailure, collectionPathFailure } from "@lacecms/content";
import type { ContentModelKind } from "@lacecms/content";
import type {
  ContentEntryId,
  ContentModelKey,
  ContentSnapshotId,
  UnixMilliseconds,
} from "../shared/brands.js";
import { fail } from "../shared/failures.js";

export interface PageContentModelRoute {
  readonly key: ContentModelKey;
  readonly kind: "page";
  readonly path: string;
}

export interface CollectionContentModelRoute {
  readonly key: ContentModelKey;
  readonly kind: "collection";
  readonly route: string;
}

/** A collection without a route: many entries, no slug and never a public path. */
export interface RouteLessCollectionContentModelRoute {
  readonly key: ContentModelKey;
  readonly kind: "collection";
  readonly route?: undefined;
}

/** A route-less singleton model, read by its key and never by path. */
export interface GlobalContentModelRoute {
  readonly key: ContentModelKey;
  readonly kind: "global";
}

export type RoutableContentModelRoute = CollectionContentModelRoute | PageContentModelRoute;
export type ContentModelRoute =
  | GlobalContentModelRoute
  | RouteLessCollectionContentModelRoute
  | RoutableContentModelRoute;

/** A model has a public route when it is a page or a collection that declares a route. */
export function hasPublicRoute(model: ContentModelRoute): model is RoutableContentModelRoute {
  return model.kind === "page" || (model.kind === "collection" && model.route !== undefined);
}

/** A collection without a route, whose entries carry no slug. */
export function isRouteLessCollection(
  model: ContentModelRoute,
): model is RouteLessCollectionContentModelRoute {
  return model.kind === "collection" && model.route === undefined;
}

/** Page and global models are configuration-defined singletons. */
export function isSingletonKind(kind: ContentModelKind): boolean {
  return kind !== "collection";
}

export interface PublishedRoute {
  readonly entryId: ContentEntryId;
  readonly path: string;
  readonly snapshotId: ContentSnapshotId;
  readonly updatedAt: UnixMilliseconds;
}

/** Validates a fixed page path at the domain boundary. */
export function normalizePagePublicPath(path: string): string {
  const failure = pagePathFailure(path);
  if (failure) fail("CONTENT_INVALID_STATE", failure.message);
  return path;
}

/** Validates a collection route with its one permitted placeholder. */
export function normalizeCollectionPublicRoute(route: string): string {
  const failure = collectionRouteFailure(route);
  if (failure) fail("CONTENT_INVALID_STATE", failure.message);
  return route;
}

/** Resolves a canonical collection route without interpreting slug syntax as a path. */
export function resolveCollectionPublicPath(route: string, slug: string): string {
  const failure = collectionPathFailure(route, slug);
  if ("issue" in failure) fail("CONTENT_INVALID_STATE", failure.message);
  return failure.path;
}

/** Resolves the public path for one routable model and, for collections, its publication slug. */
export function resolveContentPublicPath(model: RoutableContentModelRoute, slug?: string): string {
  return model.kind === "page"
    ? normalizePagePublicPath(model.path)
    : resolveCollectionPublicPath(model.route, slug ?? "");
}

/** Resolves an entry's public path, or `undefined` for a global or a route-less collection. */
export function contentPublicPath(model: ContentModelRoute, slug?: string): string | undefined {
  return hasPublicRoute(model) ? resolveContentPublicPath(model, slug) : undefined;
}

/** Rejects a route held by another entry while permitting an entry to retain its own path. */
export function assertPublicPathAvailable(
  candidatePath: string,
  candidateEntryId: ContentEntryId,
  existingRoute?: PublishedRoute,
): void {
  normalizePagePublicPath(candidatePath);
  if (existingRoute !== undefined && existingRoute.entryId !== candidateEntryId) {
    fail("CONTENT_ROUTE_CONFLICT", `Public path ${candidatePath} belongs to another entry.`);
  }
}
