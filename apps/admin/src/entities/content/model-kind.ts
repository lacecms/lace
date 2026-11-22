import { modelKindDescriptor, resolveModelKind } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";

export function isSingletonModel(model: Pick<ContentModelDto, "kind">): boolean {
  return modelKindDescriptor(model.kind).cardinality === "one";
}

export function hasPublicRoute(model: Pick<ContentModelDto, "kind" | "route">): boolean {
  return resolveModelKind(model).routing !== "none";
}

export function isRouteLessCollection(model: Pick<ContentModelDto, "kind" | "route">): boolean {
  return resolveModelKind(model).publicFamily === "records";
}

export function modelPublicPath(
  model: Pick<ContentModelDto, "kind" | "path" | "route">,
  slug: string | undefined,
): string | undefined {
  const { routing } = resolveModelKind(model);
  if (routing === "fixed") return model.path;
  if (routing === "slug" && slug !== undefined) return model.route?.replace(":slug", slug);
  return undefined;
}
