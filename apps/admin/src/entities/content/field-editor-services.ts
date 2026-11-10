import type { FieldEditorServices } from "../../shared/editor-contract/index.js";
import { fieldProblem, recursiveFieldErrors } from "./editor-form.js";
import { fieldGuidance, fieldGuidanceParts } from "./field-guidance.js";
import { fieldLabel } from "./draft.js";
import { fieldControlId, fieldTypeSupport } from "./field-types.js";
import { itemSummary, previewLeaf, rowLines } from "./item-summary.js";
import {
  applicableErrors,
  applicableValueErrors,
  hiddenFieldNote,
  renderedFieldKeys,
  shownFieldKeys,
} from "./visibility.js";
import {
  mediaIdsInList,
  mediaListCapacity,
  mediaListChoices,
  mediaListItems,
  mediaListTarget,
} from "./media-list.js";
import {
  cleanValue,
  draftItemValue,
  duplicateItem,
  fieldStartingValue,
  moveItem,
  newItemIdentity,
  record,
  replacePath,
  snapshotBudget,
} from "./composite-values.js";

export const fieldEditorServices = {
  fieldProblem,
  recursiveFieldErrors,
  fieldGuidance,
  fieldGuidanceParts,
  fieldLabel,
  fieldControlId,
  fieldTypeSupport,
  itemSummary,
  previewLeaf,
  rowLines,
  applicableErrors,
  applicableValueErrors,
  hiddenFieldNote,
  renderedFieldKeys,
  shownFieldKeys,
  mediaIdsInList,
  mediaListCapacity,
  mediaListChoices,
  mediaListItems,
  mediaListTarget,
  cleanValue,
  draftItemValue,
  duplicateItem,
  fieldStartingValue,
  moveItem,
  newItemIdentity,
  record,
  replacePath,
  snapshotBudget,
} satisfies FieldEditorServices;
