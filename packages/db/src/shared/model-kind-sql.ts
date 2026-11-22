import { CONTENT_MODEL_KINDS, modelKindDescriptor } from "@lacecms/domain";
import type { modelKindDescriptors, ModelKindDescriptor, ResolvedModelKind } from "@lacecms/domain";
import type { ContentModelKind } from "@lacecms/domain";

/** SQL literals for trusted model-kind keys from the descriptor table. */
export function modelKindSqlList(kinds: readonly ContentModelKind[]): string {
  return `(${kinds.map((kind) => `'${kind.replaceAll("'", "''")}'`).join(", ")})`;
}

type KindsMatching<Policy> = {
  [Kind in ContentModelKind]: (typeof modelKindDescriptors)[Kind] extends Policy ? Kind : never;
}[ContentModelKind];

/** Kinds that can own a public path, depending on their configuration. */
export function isUrlLinkModelKind(
  kind: ContentModelKind,
): kind is KindsMatching<{ delivery: { routing: "fixed" | "slug" } }> {
  return modelKindDescriptor(kind).delivery.routing !== "none";
}

export function isReferenceModelKind(
  kind: ContentModelKind,
): kind is KindsMatching<{ referenceTarget: true }> {
  return modelKindDescriptor(kind).referenceTarget;
}

export const URL_LINK_MODEL_KINDS_SQL = modelKindSqlList(
  CONTENT_MODEL_KINDS.filter(isUrlLinkModelKind),
);
export const REFERENCE_MODEL_KINDS_SQL = modelKindSqlList(
  CONTENT_MODEL_KINDS.filter(isReferenceModelKind),
);

type Delivery = Pick<ResolvedModelKind, "publicFamily" | "exportSection">;

/** Match each kind's possible delivery outcomes. SQL still checks for a published route. */
export function modelKindsMatchingDelivery(matches: (delivery: Delivery) => boolean): string {
  return modelKindSqlList(
    CONTENT_MODEL_KINDS.filter((kind) => {
      const descriptor: ModelKindDescriptor = modelKindDescriptor(kind);
      return (
        matches(descriptor.delivery) ||
        (descriptor.routeLessDelivery !== undefined && matches(descriptor.routeLessDelivery))
      );
    }),
  );
}
