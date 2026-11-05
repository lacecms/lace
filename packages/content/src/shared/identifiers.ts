/** Lowercase ASCII letters and digits separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
/** Maximum slug length shared by publish, REST, and admin validation. */
export const MAX_SLUG_LENGTH = 100;
/** Model keys: a lowercase ASCII letter, then lowercase letters or digits in runs joined by single hyphens. */
export const MODEL_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
/** Model kinds: routed singletons, routed lists, and route-less singletons. */
export type ContentModelKind = "collection" | "global" | "page";
/** Maximum entry search length at the transport boundary; runtime bounds may be narrower. */
export const MAX_ENTRY_SEARCH_LENGTH = 200;
/** Maximum media search length at the transport boundary. */
export const MAX_MEDIA_SEARCH_LENGTH = 200;
/** Upper bound on the referencing entries returned by one media usage read. */
export const MAX_MEDIA_USAGE_ENTRIES = 50;
/** Entries one build-export page holds at most, and the default page size. */
export const MAX_BUILD_EXPORT_PAGE_SIZE = 100;
/** Largest page an admin list read returns. */
export const MAX_PAGE_SIZE = 100;
/** Page size of an admin list read that omits its limit. */
export const DEFAULT_PAGE_SIZE = 50;
/** Entry IDs one link-target resolution accepts at most. */
export const MAX_LINK_RESOLVE_IDS = 200;

/** Lowercase ASCII letters, digits and single hyphens, at most `MAX_SLUG_LENGTH` characters. */
export function isContentSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

export type RouteIssue =
  | "type"
  | "canonical"
  | "dot-segment"
  | "parameter"
  | "slug-segment"
  | "slug";
export interface RouteFailure {
  readonly issue: RouteIssue;
  readonly message: string;
}

function canonicalRouteFailure(value: unknown, name: string): RouteFailure | undefined {
  if (typeof value !== "string") return { issue: "type", message: `${name} must be a string.` };
  if (
    value.length === 0 ||
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    /\s/u.test(value) ||
    value.includes("//") ||
    (value.length > 1 && value.endsWith("/"))
  )
    return { issue: "canonical", message: `${name} must be a canonical absolute path.` };
  if (
    value
      .slice(1)
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  )
    return { issue: "dot-segment", message: `${name} must not contain dot segments.` };
  return undefined;
}

/** Checks a canonical fixed page path without choosing the caller's failure type. */
export function pagePathFailure(path: unknown, name = "path"): RouteFailure | undefined {
  const failure = canonicalRouteFailure(path, name);
  if (failure) return failure;
  if ((path as string).includes(":"))
    return { issue: "parameter", message: `${name} must not contain parameter segments.` };
  return undefined;
}

/** Checks a canonical collection route with exactly one permitted placeholder. */
export function collectionRouteFailure(route: unknown, name = "route"): RouteFailure | undefined {
  const failure = canonicalRouteFailure(route, name);
  if (failure) return failure;
  const segments = route === "/" ? [] : (route as string).slice(1).split("/");
  if (
    segments.filter((segment) => segment === ":slug").length !== 1 ||
    segments.some((segment) => segment.includes(":") && segment !== ":slug")
  )
    return {
      issue: "slug-segment",
      message: `${name} must contain exactly one :slug segment and no other parameters.`,
    };
  return undefined;
}

/** Resolves a collection path, or returns the shared reason for rejecting it. */
export function collectionPathFailure(
  route: unknown,
  slug: unknown,
): { readonly path: string } | RouteFailure {
  const failure = collectionRouteFailure(route);
  if (failure) return failure;
  if (!isContentSlug(slug))
    return {
      issue: "slug",
      message: "slug must use lowercase ASCII letters, digits, and single hyphens.",
    };
  const path = (route as string).replace(":slug", slug);
  return pagePathFailure(path) ?? { path };
}
