import { collectSnapshotEntryReferences } from "@lacecms/content";
import {
  linkTargetIdSchema,
  linkUsageLocationSchema,
  type AdminContentEntryDto,
  type ContentModelDto,
} from "@lacecms/contracts";
import * as v from "valibot";
import { issueLocation, locationField } from "./editor-form.js";
import { readPath } from "./composite-values.js";
import type { DraftEditorValues, DraftIssuePath } from "../../shared/editor-contract/index.js";

const referenceUseSchema = v.strictObject({
  ...linkUsageLocationSchema.entries,
  phase: v.picklist(["draft", "published"]),
  snapshotId: linkTargetIdSchema,
  targetId: linkTargetIdSchema,
});
export type ReferenceUse = v.InferOutput<typeof referenceUseSchema>;

export function parseReferenceUseSearch(search: Record<string, unknown>): {
  referenceUse?: ReferenceUse;
} {
  const parsed = v.safeParse(referenceUseSchema, search.referenceUse);
  return parsed.success ? { referenceUse: parsed.output } : {};
}

function references(
  model: ContentModelDto,
  snapshot: Pick<AdminContentEntryDto["draft"], "blocks" | "fields">,
) {
  const definitions = new Map(
    model.blockDefinitions?.map((definition) => [definition.type, definition]),
  );
  return collectSnapshotEntryReferences(
    model.fields,
    snapshot.fields,
    snapshot.blocks.flatMap((block) => {
      const definition = definitions.get(block.type);
      return definition === undefined
        ? []
        : [{ ...definition, key: block.key, data: block.data, hidden: block.hidden }];
    }),
    model.visibility,
  ).filter((item) => item.purpose === "reference");
}

export interface VerifiedReferenceUse {
  readonly path?: DraftIssuePath;
  readonly hidden?: boolean;
  readonly pendingPublication: boolean;
  readonly stale: boolean;
}

export function verifyReferenceUse(
  model: ContentModelDto,
  entry: AdminContentEntryDto,
  values: DraftEditorValues,
  use: ReferenceUse,
): VerifiedReferenceUse {
  const matches = (item: { area: string; sourceKey: string; pointer: string; targetId: string }) =>
    item.area === use.area &&
    item.sourceKey === use.sourceKey &&
    item.pointer === use.pointer &&
    item.targetId === use.targetId;
  const draft = references(model, entry.draft);
  const location = draft.find(matches);
  const stillPublished =
    use.phase === "published" &&
    use.delivered &&
    entry.published?.id === use.snapshotId &&
    references(model, entry.published).some((item) => item.delivered && matches(item));
  const pendingPublication =
    stillPublished && !draft.some((item) => item.targetId === use.targetId && item.delivered);
  if (location) {
    const blockIndex = values.blocks.findIndex((block) => block.key === use.sourceKey);
    const pointer =
      use.area === "fields"
        ? `/fields${use.pointer}`
        : blockIndex < 0
          ? undefined
          : `/blocks/${blockIndex}/data${use.pointer}`;
    const path =
      pointer === undefined
        ? undefined
        : issueLocation(pointer, model, values.blocks, values.fields);
    if (
      path &&
      locationField(path, model, values.blocks)?.type === "reference" &&
      readPath(values, path.split(".")) === use.targetId
    )
      return { path, hidden: !location.delivered, pendingPublication, stale: false };
  }
  return { pendingPublication, stale: !pendingPublication };
}
