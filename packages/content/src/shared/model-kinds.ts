import type { ContentModelKind } from "./identifiers.js";
import { deepFreeze } from "./objects.js";

type ModelDelivery =
  | { readonly routing: "fixed"; readonly publicFamily: "pages"; readonly exportSection: "entries" }
  | {
      readonly routing: "slug";
      readonly publicFamily: "collections";
      readonly exportSection: "entries";
    }
  | {
      readonly routing: "none";
      readonly publicFamily: "records";
      readonly exportSection: "records";
    }
  | {
      readonly routing: "none";
      readonly publicFamily: "globals";
      readonly exportSection: "globals";
    };

type ModelKindBehavior = {
  readonly cardinality: "one" | "many";
  readonly referenceTarget: boolean;
  readonly admin: {
    readonly navigation: "editor" | "list";
    readonly title: "editable" | "system";
  };
};

export type ModelKindDescriptor = ModelKindBehavior &
  (
    | {
        readonly delivery: Exclude<ModelDelivery, { publicFamily: "collections" | "records" }>;
        readonly routeLessDelivery?: never;
      }
    | {
        readonly delivery: Extract<ModelDelivery, { publicFamily: "collections" }>;
        readonly routeLessDelivery: Extract<ModelDelivery, { publicFamily: "records" }>;
      }
  );

export const modelKindDescriptors = deepFreeze({
  page: {
    cardinality: "one",
    referenceTarget: true,
    admin: { navigation: "editor", title: "editable" },
    delivery: { routing: "fixed", publicFamily: "pages", exportSection: "entries" },
  },
  collection: {
    cardinality: "many",
    referenceTarget: true,
    admin: { navigation: "list", title: "editable" },
    delivery: { routing: "slug", publicFamily: "collections", exportSection: "entries" },
    routeLessDelivery: { routing: "none", publicFamily: "records", exportSection: "records" },
  },
  global: {
    cardinality: "one",
    referenceTarget: false,
    admin: { navigation: "editor", title: "system" },
    delivery: { routing: "none", publicFamily: "globals", exportSection: "globals" },
  },
} as const satisfies Record<ContentModelKind, ModelKindDescriptor>);

export const CONTENT_MODEL_KINDS: readonly ContentModelKind[] = Object.freeze(
  Object.keys(modelKindDescriptors) as ContentModelKind[],
);

export function isContentModelKind(value: unknown): value is ContentModelKind {
  return typeof value === "string" && Object.hasOwn(modelKindDescriptors, value);
}

export function modelKindDescriptor<Kind extends ContentModelKind>(
  kind: Kind,
): (typeof modelKindDescriptors)[Kind] {
  return modelKindDescriptors[kind];
}

export type ResolvedModelKind = ModelKindBehavior & ModelDelivery;

/** Resolves delivery and editing policy for a configured model. */
export function resolveModelKind(model: {
  readonly kind: ContentModelKind;
  readonly route?: string | undefined;
}): ResolvedModelKind {
  const { cardinality, admin, referenceTarget, delivery, routeLessDelivery }: ModelKindDescriptor =
    modelKindDescriptor(model.kind);
  return {
    cardinality,
    admin,
    referenceTarget,
    ...(model.route === undefined && routeLessDelivery !== undefined
      ? routeLessDelivery
      : delivery),
  };
}
