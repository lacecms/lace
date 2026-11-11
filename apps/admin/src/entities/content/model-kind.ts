import type { ContentModelDto } from "@lacecms/contracts";

/** Pages and globals have exactly one configuration-defined entry. */
export function isSingletonModel(model: Pick<ContentModelDto, "kind">): boolean {
  return model.kind === "page" || model.kind === "global";
}

/** Pages and collections that declare a route have public paths; globals and route-less collections do not. */
export function hasPublicRoute(model: Pick<ContentModelDto, "kind" | "route">): boolean {
  return model.kind === "page" || (model.kind === "collection" && model.route !== undefined);
}

/** A collection without a route: its entries have no slug and no public path. */
export function isRouteLessCollection(model: Pick<ContentModelDto, "kind" | "route">): boolean {
  return model.kind === "collection" && model.route === undefined;
}
