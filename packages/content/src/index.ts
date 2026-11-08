// Directory dependencies: shared ← fields ← references, blocks ← entries.

// shared
export { LaceError, InvariantError } from "./shared/errors.js";
export * from "./shared/objects.js";
export * from "./shared/identifiers.js";
export type { ValidationPathSegment, ContentValidationIssue } from "./shared/errors.js";
export { FieldConfigurationError, ContentValidationError } from "./shared/errors.js";
export type { JsonPrimitive, JsonValue, JsonObject } from "./shared/json.js";
export { isPortableJsonValue } from "./shared/json.js";

// fields
export * from "./fields/video-embeds.js";
export * from "./fields/internal-link-tokens.js";
export { parseSchemaPath, encodeSchemaPath, schemaFieldAt } from "./fields/schema-path.js";
export type {
  FieldType,
  FieldSortFamily,
  FieldFilterKind,
  FieldValueKind,
  FieldTypeCapability,
  ListQueryableFieldType,
  SearchableFieldType,
  SeoTextFieldType,
  ItemLabelFieldType,
  PlaceholderFieldType,
} from "./fields/capabilities.js";
export {
  fieldTypeCapabilities,
  FIELD_FILTER_OPERATIONS,
  fieldTypesWith,
} from "./fields/capabilities.js";
export type { FieldFilterValueFailure, FieldFilterValueOptions } from "./fields/filter-values.js";
export {
  FIELD_PRESENCE_OPERATIONS,
  MAX_FILTER_SELECT_VALUES,
  MAX_FILTER_TEXT_LENGTH,
  fieldFilterValueFailure,
  filterInstant,
} from "./fields/filter-values.js";
export type {
  SafeRichTextMark,
  SafeRichTextNode,
  SafeRichTextDocument,
} from "./fields/rich-text.js";
export { isSafeUrl, isUrlFieldTarget, validateRichTextDocument } from "./fields/rich-text.js";
export type {
  CommonFieldOptions,
  PlaceholderFieldOptions,
  UrlFieldOptions,
  StringFieldOptions,
  NumberFieldOptions,
  BooleanFieldOptions,
  StringValueFieldOptions,
  RichTextFieldOptions,
  ChoiceDiagram,
  SelectPresentation,
  SelectFieldOptions,
  TextFieldDefinition,
  TextareaFieldDefinition,
  RichTextFieldDefinition,
  NumberFieldDefinition,
  BooleanFieldDefinition,
  DateFieldDefinition,
  DatetimeFieldDefinition,
  UrlFieldDefinition,
  MediaFieldDefinition,
  SelectFieldDefinition,
  FormLayout,
  FieldVisibilityRule,
  FieldVisibility,
  GroupFieldDefinition,
  ListItemDefinition,
  ListFieldDefinition,
  DraftFieldValue,
  FieldDefinition,
  FieldValue,
  FieldIsRequired,
  FieldMetadata,
  FieldDefinitionVisitor,
  ModelFieldDefinitions,
  ModelFieldValues,
  FieldVisibilityTargets,
  BlockDataValues,
} from "./fields/definitions.js";
export {
  FIELD_KEY_PATTERN,
  FIELD_KEY_SOURCE,
  MAX_FIELD_CONTAINER_DEPTH,
  MAX_CONSECUTIVE_GROUPS,
  MAX_LIST_ITEMS,
  MAX_SNAPSHOT_LIST_ITEMS,
  visitFieldDefinition,
} from "./fields/definitions.js";
export { normalizeFormLayout, formFieldKeys } from "./fields/layout.js";
export {
  normalizeFieldVisibility,
  effectiveVisibilityValues,
  isFieldVisible,
} from "./fields/visibility.js";
export type { CompiledFieldSchema, ContentValidationMode } from "./fields/validation.js";
export {
  compileFieldSchema,
  validateFieldValue,
  validateModelFields,
  publishedFieldValues,
  declaresFieldVisibility,
  validateSnapshotListBudget,
  textLength,
  seoTextLength,
} from "./fields/validation.js";
export { field } from "./fields/builders.js";
export { toFieldMetadata } from "./fields/metadata.js";
export { normalizeFieldDefinition } from "./fields/normalization.js";

// references
export { encodeFieldPath, decodeFieldPath } from "./references/field-paths.js";
export type { FieldMediaReference } from "./references/media.js";
export { collectFieldMedia, detachFieldMedia, effectiveAltText } from "./references/media.js";
export type {
  FieldInternalLinkReference,
  InternalLinkReference,
  PublicInternalLinkReference,
} from "./references/internal-links.js";
export {
  collectFieldInternalLinks,
  collectSnapshotInternalLinks,
} from "./references/internal-links.js";

// blocks
export type {
  BlockMigrationInput,
  BlockMigrationOutput,
  BlockMigration,
  BlockMigrations,
  NoBlockSettings,
  SettingsVisibility,
  BlockDefinitionInput,
  BlockSettingsValues,
  BlockMetadata,
  BlockDefinition,
  BlockRegistry,
} from "./blocks/types.js";
export type { BlockMigrationErrorCode } from "./blocks/migration.js";
export {
  BLOCK_TYPE_PATTERN,
  BLOCK_TYPE_SOURCE,
  MAX_BLOCK_ANCHOR_LENGTH,
  MAX_BLOCK_CLASS_NAME_LENGTH,
  MAX_BLOCK_CLASS_TOKENS,
  MAX_BLOCK_CLASS_TOKEN_LENGTH,
  isBlockAnchor,
  normalizeBlockClassName,
} from "./blocks/grammar.js";
export {
  publishedBlockData,
  defineBlock,
  toBlockMetadata,
  validateBlockData,
  validateBlockSettings,
} from "./blocks/definition.js";
export { BlockConfigurationError } from "./blocks/errors.js";
export { BLOCK_SETTING_FIELD_TYPES, normalizeSettingsVisibility } from "./blocks/settings.js";
export { defineBlockRegistry, toBlockRegistryMetadata } from "./blocks/registry.js";
export { BlockMigrationError, migrateBlockData } from "./blocks/migration.js";
export { listLayoutSettingsVisibility, listLayoutSettings } from "./blocks/list-layout.js";
export { builtInBlocks } from "./blocks/built-ins.js";

// entries
export * from "./entries/list-query-policy.js";
export type { WebCryptoLike } from "./entries/canonical-json.js";
export {
  canonicalizeJson,
  canonicalJsonByteLength,
  sha256CanonicalJson,
} from "./entries/canonical-json.js";
export type {
  EntryBlockData,
  EntryPayloadInput,
  EntryAggregateModel,
  EntryAggregateBlock,
  ValidatedEntryAggregateBlock,
  EntryAggregateInput,
  ValidatedEntryAggregate,
} from "./entries/aggregate.js";
export {
  MAX_TITLE_LENGTH,
  MAX_TOP_LEVEL_BLOCKS,
  MAX_DRAFT_MEDIA_REFERENCES,
  MAX_JSON_BYTES,
  validateEntryPayload,
  validateEntryAggregate,
} from "./entries/aggregate.js";
