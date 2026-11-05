import { BLOCK_TYPE_PATTERN, deepFreeze, isPlainObject } from "@lacecms/content";
import { normalizeFieldVisibility, normalizeFormLayout } from "@lacecms/content";
import type { FieldVisibility } from "@lacecms/content";
import {
  assertOptionalDisplayValue,
  assertStableKey,
  assertVersion,
} from "../shared/assertions.js";
import type { FieldMap, CommonModelInput, NormalizedCommonModel } from "./types.js";
import { fail } from "../shared/errors.js";
import {
  normalizeFields,
  normalizeKeyList,
  normalizeRemovedFields,
  assertSynchronizationHints,
  normalizeBlocks,
} from "./fields.js";

export function normalizeCommonModel<Fields extends FieldMap>(
  input: CommonModelInput<Fields>,
): Omit<NormalizedCommonModel<Fields>, "values"> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !isPlainObject(input)
  ) {
    fail("model must be a plain object.");
  }
  if (Object.hasOwn(input, "settingsVisibility"))
    fail("settingsVisibility is supported only on block definitions.");
  assertStableKey(input.key, "key");
  assertVersion(input.version);
  if (input.renamedFrom !== undefined) {
    assertStableKey(input.renamedFrom, "renamedFrom");
    if (input.renamedFrom === input.key) {
      fail("renamedFrom must differ from key.");
    }
  }
  assertOptionalDisplayValue(input.label, "label");
  assertOptionalDisplayValue(input.description, "description");

  const blocks = normalizeBlocks(input.blocks);
  const { fields, renamedFields } = normalizeFields(input.fields);
  const layout = normalizeFormLayout(input.layout, fields, `model.${input.key}.layout`);
  const visibility = normalizeFieldVisibility(
    input.visibility,
    fields,
    `model.${input.key}.visibility`,
  ) as FieldVisibility<Fields> | undefined;
  const removedFields = normalizeRemovedFields(input.removedFields);
  const removedBlocks = normalizeKeyList(input.removedBlocks, "removedBlocks", BLOCK_TYPE_PATTERN);
  assertSynchronizationHints(
    input.key,
    fields,
    blocks,
    renamedFields,
    removedFields,
    removedBlocks,
  );

  const normalized: NormalizedCommonModel<Fields> = {
    blocks,
    ...(input.description === undefined ? {} : { description: input.description }),
    fields,
    key: input.key,
    ...(layout === undefined ? {} : { layout }),
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.renamedFrom === undefined ? {} : { renamedFrom: input.renamedFrom }),
    ...(removedBlocks.length === 0 ? {} : { removedBlocks }),
    ...(removedFields.length === 0 ? {} : { removedFields }),
    ...(Object.keys(renamedFields).length === 0 ? {} : { renamedFields }),
    version: input.version,
    ...(visibility === undefined ? {} : { visibility }),
  };
  return deepFreeze(normalized);
}
