import { pagePathFailure, collectionRouteFailure, collectionPathFailure } from "@lacecms/content";
import { fail } from "../shared/errors.js";

/** Validates and returns a canonical fixed page path. */
export function normalizePagePath(path: string): string {
  const failure = pagePathFailure(path);
  if (failure) fail(failure.message);
  return path;
}

/** Validates and returns a canonical collection route with one `:slug` segment. */
export function normalizeCollectionRoute(route: string): string {
  const failure = collectionRouteFailure(route);
  if (failure) fail(failure.message);
  return route;
}

/** Resolves a validated collection route to one canonical public path. */
export function resolveCollectionRoute(route: string, slug: string): string {
  const failure = collectionPathFailure(route, slug);
  if ("issue" in failure) fail(failure.message);
  return failure.path;
}

export function pageMatchesCollection(pagePath: string, collectionRoute: string): boolean {
  const pageSegments = pagePath === "/" ? [] : pagePath.slice(1).split("/");
  const routeSegments = collectionRoute === "/" ? [] : collectionRoute.slice(1).split("/");
  return (
    pageSegments.length === routeSegments.length &&
    pageSegments.every(
      (segment, index) => routeSegments[index] === ":slug" || routeSegments[index] === segment,
    )
  );
}
