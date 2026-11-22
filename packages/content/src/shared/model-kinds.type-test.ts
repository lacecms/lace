import { modelKindDescriptor, modelKindDescriptors } from "../index.js";
import type { ContentModelKind, ModelKindDescriptor } from "../index.js";

modelKindDescriptor("page");
// @ts-expect-error Only registered kinds are accepted.
modelKindDescriptor("article");

// @ts-expect-error Every kind must be present.
({ page: modelKindDescriptors.page, collection: modelKindDescriptors.collection }) satisfies Record<
  ContentModelKind,
  ModelKindDescriptor
>;

const { exportSection, ...delivery } = modelKindDescriptors.page.delivery;
void exportSection;
// @ts-expect-error Every kind must declare its export section.
({ ...modelKindDescriptors.page, delivery }) satisfies ModelKindDescriptor;
