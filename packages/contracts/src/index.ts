import {
  canonicalizeJson,
  defineBlock,
  normalizeFieldDefinition,
  normalizeFormLayout,
  isBlockAnchor,
  normalizeBlockClassName,
  toBlockMetadata,
} from "@lacecms/content";
import type {
  BlockMetadata,
  FormLayout,
  FieldMetadata,
  JsonObject,
  JsonValue,
} from "@lacecms/content";
import {
  BlockOrderError,
  DomainError,
  isCanonicalUrl,
  isMediaFocalCoordinate,
  MAX_SEO_CANONICAL_LENGTH,
  normalizeMediaText,
  normalizeSeoText,
  unixMilliseconds,
  siteBuildFailureReasons,
  siteBuildProviderStages,
  siteBuildStatuses,
  sourceFailureReasons,
  safeBuildSourcePath,
  normalizeBuildFailure,
  BUILD_SOURCE_PATH_PATTERN,
  BuildExportVersionChangedError,
} from "@lacecms/domain";
import type {
  ContentBlock,
  ContentEntry,
  ContentModelKind,
  ContentModelRoute,
  ContentSnapshot,
  DomainErrorCode,
  EntrySeo,
  MediaFocalPoint,
  SiteBuildProviderStage,
  SiteBuildState,
  SiteBuildStatus,
  UnixMilliseconds,
} from "@lacecms/domain";
import * as v from "valibot";

export const packageName = "@lacecms/contracts";

const identifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(255));
const nonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const entityTagPattern = /^(?:W\/)?"[0-9]+"$/u;
const idempotencyKeyPattern = /^[\x21-\x7e]{1,255}$/u;
const jsonPointerPattern = /^(?:\/(?:[^~/]|~[01])*)*$/u;

function isJsonValue(value: unknown): value is JsonValue {
  const ancestors = new WeakSet<object>();
  const pending: { value: unknown; exit?: boolean }[] = [{ value }];
  while (pending.length > 0) {
    const next = pending.pop()!;
    const current = next.value;
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string" ||
      (typeof current === "number" && Number.isFinite(current))
    )
      continue;
    if (typeof current !== "object") return false;
    if (next.exit) {
      ancestors.delete(current);
      continue;
    }
    if (ancestors.has(current)) return false;
    const array = Array.isArray(current);
    if (
      !array &&
      Object.getPrototypeOf(current) !== null &&
      Object.getPrototypeOf(current) !== Object.prototype
    )
      return false;
    if (Object.getOwnPropertySymbols(current).length > 0) return false;
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (
      array &&
      Array.from({ length: current.length }, (_, index) => Object.hasOwn(descriptors, index)).some(
        (present) => !present,
      )
    )
      return false;
    ancestors.add(current);
    pending.push({ value: current, exit: true });
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === "length") continue;
      if (!descriptor.enumerable || !("value" in descriptor)) return false;
      pending.push({ value: descriptor.value });
    }
  }
  return true;
}

function isJsonObject(value: unknown): value is JsonObject {
  return !Array.isArray(value) && value !== null && typeof value === "object" && isJsonValue(value);
}

function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    utcTimestampPattern.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

/** Any portable JSON value accepted by the shared transport contract. */
export const jsonValueSchema = v.custom<JsonValue>(isJsonValue);
export const jsonObjectSchema = v.custom<JsonObject>(isJsonObject);
export const identifierSchemaPublic = identifierSchema;
export const expectedRevisionSchema = nonNegativeIntegerSchema;
export const opaqueCursorSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4_096));
export const isoTimestampSchema = v.custom<string>(isUtcTimestamp);
/** A single strong or weak validator encoding a safe published-state version. */
export const entityTagSchema = v.pipe(
  v.string(),
  v.regex(entityTagPattern),
  v.check((value) => Number.isSafeInteger(Number(value.replace(/^W\//u, "").slice(1, -1)))),
);
export const idempotencyKeySchema = v.pipe(v.string(), v.regex(idempotencyKeyPattern));
export const jsonPointerSchema = v.pipe(v.string(), v.regex(jsonPointerPattern));

export type OpaqueCursorDto = v.InferOutput<typeof opaqueCursorSchema>;
export type IsoTimestamp = v.InferOutput<typeof isoTimestampSchema>;
export type EntityTag = v.InferOutput<typeof entityTagSchema>;
export type IdempotencyKey = v.InferOutput<typeof idempotencyKeySchema>;

export type FieldMetadataMapDto = Readonly<Record<string, FieldMetadata>>;

function isFieldMetadata(value: unknown): value is FieldMetadata {
  try {
    const normalized = normalizeFieldDefinition(value);
    return (
      canonicalizeJson(value as JsonValue) === canonicalizeJson(normalized as unknown as JsonValue)
    );
  } catch {
    return false;
  }
}

function isFieldMetadataMap(value: unknown): value is FieldMetadataMapDto {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.entries(Object.getOwnPropertyDescriptors(value)).every(
      ([key, descriptor]) =>
        /^[A-Za-z][A-Za-z0-9]*$/u.test(key) &&
        descriptor.enumerable &&
        "value" in descriptor &&
        isFieldMetadata(descriptor.value),
    )
  );
}

function isBlockMetadata(value: unknown): value is BlockMetadata {
  if (!isJsonObject(value)) return false;
  const allowedKeys = new Set([
    "defaultValue",
    "description",
    "fields",
    "label",
    "settings",
    "layout",
    "settingsLayout",
    "type",
    "version",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (
    typeof value.type !== "string" ||
    !/^[A-Za-z][A-Za-z0-9-]*$/u.test(value.type) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    (value.label !== undefined && typeof value.label !== "string") ||
    (value.description !== undefined && typeof value.description !== "string") ||
    !isFieldMetadataMap(value.fields) ||
    (value.settings !== undefined && !isFieldMetadataMap(value.settings)) ||
    (value.defaultValue !== undefined && !isJsonObject(value.defaultValue))
  ) {
    return false;
  }
  try {
    const normalized = defineBlock({
      ...(value.defaultValue === undefined ? {} : { defaultValue: value.defaultValue }),
      ...(value.description === undefined ? {} : { description: value.description }),
      fields: value.fields,
      ...(value.label === undefined ? {} : { label: value.label }),
      ...(value.layout === undefined ? {} : { layout: value.layout as unknown as FormLayout }),
      ...(value.settingsLayout === undefined
        ? {}
        : { settingsLayout: value.settingsLayout as unknown as FormLayout }),
      ...(value.settings === undefined ? {} : { settings: value.settings }),
      type: value.type,
      version: value.version,
    });
    return (
      canonicalizeJson(value) ===
      canonicalizeJson(toBlockMetadata(normalized) as unknown as JsonValue)
    );
  } catch {
    return false;
  }
}

function hasValidListFields<
  Value extends {
    readonly fields: FieldMetadataMapDto;
    readonly kind: ContentModelKind;
    readonly listFields?: readonly string[] | undefined;
  },
>(value: Value): boolean {
  if (value.listFields === undefined) return true;
  return (
    value.kind === "collection" &&
    value.listFields.length > 0 &&
    new Set(value.listFields).size === value.listFields.length &&
    value.listFields.every(
      (key) =>
        Object.hasOwn(value.fields, key) &&
        ["text", "textarea", "number", "boolean", "select", "date", "datetime", "url"].includes(
          value.fields[key]!.type,
        ),
    )
  );
}

/** A global is route-less: it carries neither a page path nor a collection route. */
function hasGlobalRouting<
  Value extends {
    readonly kind: ContentModelKind;
    readonly path?: string | undefined;
    readonly route?: string | undefined;
  },
>(value: Value): boolean {
  return value.kind !== "global" || (value.path === undefined && value.route === undefined);
}

function hasMatchingBlockDefinitions<
  Value extends {
    blockDefinitions?: BlockMetadata[] | undefined;
    blocks: string[];
  },
>(value: Value): boolean {
  if (value.blockDefinitions === undefined) return true;
  if (value.blockDefinitions.length !== value.blocks.length) return false;
  return value.blockDefinitions.every(
    (definition, index) => definition.type === value.blocks[index],
  );
}

/** Validated, executable-value-free metadata used to render browser form fields. */
export const fieldMetadataSchema = v.custom<FieldMetadata>(isFieldMetadata);
export const fieldMetadataMapSchema = v.custom<FieldMetadataMapDto>(isFieldMetadataMap);
/** Validated executable-value-free metadata used to render generic block forms. */
export const blockMetadataSchema = v.custom<BlockMetadata>(isBlockMetadata);

/** Converts a portable Unix-millisecond value into the canonical JSON timestamp. */
export function toIsoTimestamp(value: UnixMilliseconds | number): IsoTimestamp {
  const timestamp = new Date(value);
  if (!Number.isFinite(value) || Number.isNaN(timestamp.getTime())) {
    throw new TypeError("A timestamp must be a finite Unix-millisecond value.");
  }
  return timestamp.toISOString() as IsoTimestamp;
}

/** Parses a canonical JSON timestamp into a portable Unix-millisecond value. */
export function fromIsoTimestamp(value: string): UnixMilliseconds {
  const parsed = v.safeParse(isoTimestampSchema, value);
  if (!parsed.success) throw new TypeError("A timestamp must be canonical ISO-8601 UTC.");
  return unixMilliseconds(Date.parse(parsed.output));
}

/** Derives the build-export entity tag from the published-state version. */
export function entityTagForVersion(version: number): EntityTag {
  const parsed = v.safeParse(nonNegativeIntegerSchema, version);
  if (!parsed.success || !Number.isSafeInteger(version))
    throw new TypeError("An ETag version must be a non-negative safe integer.");
  return `"${parsed.output}"` as EntityTag;
}

/** Parses the version encoded in a supported, version-derived entity tag. */
export function versionFromEntityTag(value: string): number {
  const parsed = v.safeParse(entityTagSchema, value);
  if (!parsed.success)
    throw new TypeError('An ETag must be "N" or W/"N" with a non-negative safe integer version.');
  const version = Number(parsed.output.replace(/^W\//u, "").slice(1, -1));
  if (!Number.isSafeInteger(version))
    throw new TypeError("An ETag version must be a safe integer.");
  return version;
}

export const contentModelRouteSchema = v.union([
  v.strictObject({ kind: v.literal("page"), key: identifierSchema, path: v.string() }),
  v.strictObject({ kind: v.literal("collection"), key: identifierSchema, route: v.string() }),
  v.strictObject({ kind: v.literal("global"), key: identifierSchema }),
]);

export const actorSchema = v.strictObject({
  id: identifierSchema,
  role: v.picklist(["admin", "editor", "viewer"]),
});

export {
  isBlockAnchor,
  MAX_BLOCK_ANCHOR_LENGTH,
  MAX_BLOCK_CLASS_NAME_LENGTH,
  MAX_BLOCK_CLASS_TOKENS,
  normalizeBlockClassName,
} from "@lacecms/content";

/**
 * Presentation values shared by admin and public blocks. Omitted settings
 * parse as `{}`; the API always sends them.
 */
/** A block settings record of JSON values. */
export type BlockSettingsDto = Readonly<Record<string, unknown>>;

/**
 * Block settings; a missing value parses as `{}`. The schema is typed as a
 * plain record because a default over the recursive JSON object type exceeds
 * TypeScript's instantiation depth.
 */
const blockSettingsSchema = v.optional(
  v.custom<BlockSettingsDto>(isJsonObject),
  (): BlockSettingsDto => ({}),
);

const blockEnvelopeEntries = {
  anchor: v.optional(
    v.pipe(
      v.string(),
      v.check(
        (value: string) => isBlockAnchor(value),
        "An anchor must start with a lowercase letter and use only lowercase letters, digits and hyphens, up to 64 characters.",
      ),
    ),
  ),
  className: v.optional(
    v.pipe(
      v.string(),
      v.check(
        (value: string) => normalizeBlockClassName(value) !== undefined,
        "A class name must hold 1 to 16 valid class tokens, up to 256 characters.",
      ),
    ),
  ),
  settings: blockSettingsSchema,
};

const blockIdentityEntries = {
  data: jsonObjectSchema,
  key: identifierSchema,
  position: nonNegativeIntegerSchema,
  schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  type: identifierSchema,
};

/** An admin block; omitted envelope values default (visible, no anchor or class). */
export const contentBlockSchema = v.strictObject({
  ...blockIdentityEntries,
  ...blockEnvelopeEntries,
  hidden: v.optional(v.boolean(), false),
});

/** A delivered block: hidden blocks are never public, so there is no `hidden` key. */
export const publicBlockSchema = v.strictObject({
  ...blockIdentityEntries,
  ...blockEnvelopeEntries,
});

export {
  isCanonicalUrl,
  MAX_SEO_CANONICAL_LENGTH,
  MAX_SEO_DESCRIPTION_LENGTH,
  MAX_SEO_TITLE_LENGTH,
  normalizeSeoText,
} from "@lacecms/domain";

/** Collapses whitespace runs and trims a string value; anything else, or blank text, is absent. */
export function seoText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/gu, " ").trim();
  return text === "" ? undefined : text;
}

/** The site default values that shape an entry's search title. */
export interface SeoTitleDefaults {
  readonly siteName?: string | undefined;
  readonly titleTemplate?: string | undefined;
}

/**
 * Formats an entry title for search results (ADR 0011): a title template
 * applies only when it contains `%s`, which is replaced literally; otherwise
 * `{title} | {siteName}`, or the bare title without a site name.
 */
export function formatSeoTitle(title: string, defaults: SeoTitleDefaults | undefined): string {
  const template = seoText(defaults?.titleTemplate);
  // A function replacer keeps `$&` and similar sequences in titles literal.
  if (template?.includes("%s") === true) return template.replace("%s", () => title);
  const siteName = seoText(defaults?.siteName);
  return siteName === undefined ? title : `${title} | ${siteName}`;
}

/**
 * The SEO group of an entry of an SEO-enabled model as clients read it:
 * every value is present, `null` when unset.
 */
export const seoValueSchema = v.strictObject({
  canonical: v.nullable(
    v.pipe(
      v.string(),
      v.check((value: string) => isCanonicalUrl(value), "Invalid canonical URL."),
    ),
  ),
  description: v.nullable(v.pipe(v.string(), v.minLength(1))),
  image: v.nullable(identifierSchema),
  noindex: v.boolean(),
  title: v.nullable(v.pipe(v.string(), v.minLength(1))),
});

function seoTextSchema(kind: "description" | "title") {
  return v.nullable(
    v.pipe(
      v.string(),
      v.check(
        (value) => normalizeSeoText(value, kind) !== undefined,
        kind === "title"
          ? "An SEO title must be single-line plain text of at most 200 characters."
          : "An SEO description must be single-line plain text of at most 500 characters.",
      ),
    ),
  );
}

/** A submitted SEO group: each value is optional, and `null` or empty text clears it. */
export const seoInputSchema = v.strictObject({
  canonical: v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.maxLength(MAX_SEO_CANONICAL_LENGTH + 64),
        v.check(
          (value) => value.trim().length === 0 || isCanonicalUrl(value.trim()),
          "A canonical URL must be an absolute http or https URL without credentials or fragment.",
        ),
      ),
    ),
  ),
  description: v.optional(seoTextSchema("description")),
  image: v.optional(v.nullable(identifierSchema)),
  noindex: v.optional(v.boolean()),
  title: v.optional(seoTextSchema("title")),
});

const snapshotFields = {
  blocks: v.array(contentBlockSchema),
  createdAt: isoTimestampSchema,
  entryId: identifierSchema,
  fields: jsonObjectSchema,
  id: identifierSchema,
  revision: nonNegativeIntegerSchema,
  /** Present for entries of models with SEO enabled. */
  seo: v.optional(seoValueSchema),
  slug: v.optional(identifierSchema),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  updatedAt: isoTimestampSchema,
  updatedBy: actorSchema,
};

export const draftSnapshotSchema = v.strictObject({ ...snapshotFields, state: v.literal("draft") });
export const publishedSnapshotSchema = v.strictObject({
  ...snapshotFields,
  state: v.literal("published"),
});
export const contentSnapshotSchema = v.union([draftSnapshotSchema, publishedSnapshotSchema]);

/** A human-readable actor reference that lets clients avoid rendering raw IDs. */
export const actorSummarySchema = v.strictObject({
  displayName: v.pipe(v.string(), v.minLength(1), v.maxLength(320)),
  id: identifierSchema,
});

export const contentEntrySchema = v.strictObject({
  draft: draftSnapshotSchema,
  id: identifierSchema,
  model: contentModelRouteSchema,
  published: v.optional(publishedSnapshotSchema),
});

/** Admin-only entry representation that also names the draft's last editor. */
export const adminContentEntrySchema = v.strictObject({
  ...contentEntrySchema.entries,
  updatedBy: actorSummarySchema,
});

export const publicationOutcomeSchema = v.picklist(["published", "replayed"]);
export const buildDispatchOutcomeSchema = v.variant("status", [
  v.strictObject({ status: v.literal("queued"), targetVersion: nonNegativeIntegerSchema }),
  v.strictObject({ status: v.literal("not-dispatched") }),
]);
export const publishContentEntryResultSchema = v.strictObject({
  build: buildDispatchOutcomeSchema,
  entry: adminContentEntrySchema,
  publication: publicationOutcomeSchema,
});

export const unpublicationOutcomeSchema = v.picklist(["unpublished", "replayed"]);
export const unpublishContentEntryResultSchema = v.strictObject({
  build: buildDispatchOutcomeSchema,
  entry: adminContentEntrySchema,
  unpublication: unpublicationOutcomeSchema,
});

export const contentEntryStatusSchema = v.picklist(["changed", "draft", "published"]);
export const contentEntrySortSchema = v.picklist([
  "-publishedAt",
  "-title",
  "-updatedAt",
  "publishedAt",
  "title",
  "updatedAt",
]);
export const MAX_ENTRY_SEARCH_LENGTH = 200;

export const listValueSchema = v.union([v.string(), v.pipe(v.number(), v.finite()), v.boolean()]);
export const listValuesSchema = v.record(
  v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9]*$/u)),
  listValueSchema,
);

function hasConsistentPublicationState<
  Value extends {
    readonly publishedAt?: string | undefined;
    readonly publishedSnapshotId?: string | undefined;
    readonly status: "changed" | "draft" | "published";
  },
>(value: Value): boolean {
  const published = value.publishedAt !== undefined && value.publishedSnapshotId !== undefined;
  const unpublished = value.publishedAt === undefined && value.publishedSnapshotId === undefined;
  return value.status === "draft" ? unpublished : published;
}

export const contentEntrySummarySchema = v.pipe(
  v.strictObject({
    draftRevision: nonNegativeIntegerSchema,
    id: identifierSchema,
    listValues: listValuesSchema,
    modelKey: identifierSchema,
    publishedAt: v.optional(isoTimestampSchema),
    publishedSnapshotId: v.optional(identifierSchema),
    slug: v.optional(identifierSchema),
    status: contentEntryStatusSchema,
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
    updatedAt: isoTimestampSchema,
    updatedBy: actorSummarySchema,
  }),
  v.check(
    hasConsistentPublicationState,
    "Entry status must agree with its publication snapshot and time.",
  ),
);

export function cursorPageSchema<
  ItemSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(itemSchema: ItemSchema) {
  return v.strictObject({
    items: v.array(itemSchema),
    nextCursor: v.optional(opaqueCursorSchema),
  });
}

export const contentEntryStatusTotalsSchema = v.strictObject({
  all: nonNegativeIntegerSchema,
  changed: nonNegativeIntegerSchema,
  draft: nonNegativeIntegerSchema,
  published: nonNegativeIntegerSchema,
});

export const contentEntryListSchema = v.strictObject({
  ...cursorPageSchema(contentEntrySummarySchema).entries,
  totals: contentEntryStatusTotalsSchema,
});

/** Query parameters accepted by the admin entry list; unknown keys stay ignored. */
export const contentEntryListQuerySchema = v.object({
  after: v.optional(opaqueCursorSchema),
  limit: v.optional(v.pipe(v.string(), v.regex(/^[1-9][0-9]{0,2}$/u))),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(MAX_ENTRY_SEARCH_LENGTH))),
  sort: v.optional(contentEntrySortSchema),
  status: v.optional(contentEntryStatusSchema),
});

const editableDraftFields = {
  blocks: v.array(contentBlockSchema),
  fields: jsonObjectSchema,
  /** Absent or `null` stores no SEO values; refused for a model without SEO. */
  seo: v.optional(v.nullable(seoInputSchema)),
  slug: v.optional(identifierSchema),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
};

export const createContentEntryRequestSchema = v.strictObject(editableDraftFields);
export const saveDraftRequestSchema = v.strictObject({
  ...editableDraftFields,
  expectedRevision: v.optional(expectedRevisionSchema),
});
export const publishContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
});
export const deleteContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
});
export const unpublishContentEntryRequestSchema = v.strictObject({
  expectedPublishedSnapshotId: identifierSchema,
});
export const revertContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
});
export const duplicateContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
});

function hasValidFormLayout<
  Value extends { fields: FieldMetadataMapDto; layout?: FormLayout | undefined },
>(value: Value): boolean {
  try {
    const normalized = normalizeFormLayout(value.layout, value.fields);
    return (
      normalized === undefined ||
      canonicalizeJson(normalized as unknown as JsonValue) ===
        canonicalizeJson(value.layout as unknown as JsonValue)
    );
  } catch {
    return false;
  }
}

const modelSeoSchema = v.strictObject({
  description: v.nullable(identifierSchema),
  image: v.nullable(identifierSchema),
});
const seoDefaultsSchema = v.strictObject({
  description: v.nullable(identifierSchema),
  image: v.nullable(identifierSchema),
  siteName: identifierSchema,
  titleTemplate: v.nullable(identifierSchema),
});

export const contentModelSchema = v.pipe(
  v.strictObject({
    blockDefinitions: v.optional(v.array(blockMetadataSchema)),
    blocks: v.array(identifierSchema),
    description: v.optional(v.string()),
    fields: fieldMetadataMapSchema,
    key: identifierSchema,
    kind: v.picklist(["collection", "global", "page"]),
    label: v.optional(v.string()),
    listFields: v.optional(v.array(identifierSchema)),
    layout: v.optional(v.custom<FormLayout>((value) => isJsonObject(value))),
    path: v.optional(v.string()),
    route: v.optional(v.string()),
    /** SEO fallback fields of a page or collection with SEO enabled. */
    seo: v.optional(modelSeoSchema),
    /** Site SEO defaults mapped by the one global that declares them. */
    seoDefaults: v.optional(seoDefaultsSchema),
    version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  v.check(hasMatchingBlockDefinitions, "Block definitions must match the model's allowed blocks."),
  v.check(hasValidFormLayout, "Layout must place distinct immediate fields in valid groups."),
  v.check(hasValidListFields, "List fields must name distinct fields of a collection."),
  v.check(hasGlobalRouting, "A global model carries no path or route."),
  v.check(
    (model) =>
      model.kind === "global" ? model.seo === undefined : model.seoDefaults === undefined,
    "Only pages and collections carry seo, and only a global carries seoDefaults.",
  ),
);
export const contentModelListSchema = v.strictObject({ items: v.array(contentModelSchema) });

const roleSchema = v.picklist(["admin", "editor", "viewer"]);
const emailSchema = v.pipe(v.string(), v.email(), v.maxLength(320));
const passwordSchema = v.pipe(v.string(), v.minLength(12), v.maxLength(1_024));
export const setupStateSchema = v.strictObject({ setupComplete: v.boolean() });
export type SetupStateDto = v.InferOutput<typeof setupStateSchema>;

export const setupAdminRequestSchema = v.strictObject({
  email: emailSchema,
  password: passwordSchema,
  token: v.pipe(v.string(), v.minLength(40), v.maxLength(128)),
});
export const userUpdateRequestSchema = v.strictObject({
  disabled: v.optional(v.boolean()),
  role: v.optional(roleSchema),
});
export const managedUserSchema = v.strictObject({
  disabled: v.boolean(),
  email: emailSchema,
  id: identifierSchema,
  role: roleSchema,
});
export const managedUserListSchema = v.strictObject({ items: v.array(managedUserSchema) });
export const permissionSchema = v.picklist([
  "content:read",
  "content:write",
  "content:publish",
  "media:write",
  "users:manage",
  "settings:manage",
]);
export type PermissionDto = v.InferOutput<typeof permissionSchema>;
/** The signed-in user's identity and server-derived permissions; no credential material. */
export const adminSessionSchema = v.strictObject({
  permissions: v.pipe(
    v.array(permissionSchema),
    v.check((items) => new Set(items).size === items.length, "Permissions must be unique."),
  ),
  user: v.strictObject({
    displayName: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(320))),
    email: emailSchema,
    id: identifierSchema,
    role: roleSchema,
  }),
});
export type AdminSessionDto = v.InferOutput<typeof adminSessionSchema>;
export const emailProviderSchema = v.picklist(["none", "log", "smtp", "resend", "cloudflare"]);
export type EmailProviderDto = v.InferOutput<typeof emailProviderSchema>;
const emailSenderSchema = v.pipe(v.string(), v.minLength(3), v.maxLength(400));
export const emailDeliveryStatusSchema = v.union([
  v.strictObject({ provider: v.literal("none") }),
  v.strictObject({
    from: emailSenderSchema,
    provider: v.picklist(["log", "smtp", "resend", "cloudflare"]),
  }),
]);
export type EmailDeliveryStatusDto = v.InferOutput<typeof emailDeliveryStatusSchema>;
export const emailFailureReasonSchema = v.picklist([
  "not_configured",
  "invalid_message",
  "rejected",
  "rate_limited",
  "unavailable",
]);
export type EmailFailureReasonDto = v.InferOutput<typeof emailFailureReasonSchema>;
export const emailTestRequestSchema = v.strictObject({});
export const emailTestResultSchema = v.union([
  v.strictObject({ status: v.literal("sent") }),
  v.strictObject({ reason: emailFailureReasonSchema, status: v.literal("failed") }),
]);
export type EmailTestResultDto = v.InferOutput<typeof emailTestResultSchema>;
export const adminSettingsStatusSchema = v.strictObject({
  configuredModels: nonNegativeIntegerSchema,
  email: emailDeliveryStatusSchema,
  engineVersion: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  ready: v.boolean(),
});
export type AdminSettingsStatusDto = v.InferOutput<typeof adminSettingsStatusSchema>;
export type ManagedUserDto = v.InferOutput<typeof managedUserSchema>;

/** Invitation and reset tokens: 32 random bytes as unpadded base64url. */
export const accountTokenSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/u));
// oxlint-disable-next-line no-control-regex -- rejects control characters by design.
const controlCharacterPattern = /[\u0000-\u001f\u007f-\u009f]/u;
/** A display name of 1 to 120 characters after trimming, without control characters. */
export const displayNameSchema = v.pipe(
  v.string(),
  v.maxLength(1_024),
  v.check(
    (value) => value.trim().length >= 1 && value.trim().length <= 120,
    "Enter a name of 1 to 120 characters.",
  ),
  v.check((value) => !controlCharacterPattern.test(value), "Control characters are not allowed."),
);
const accountLinkSchema = v.pipe(
  v.string(),
  v.url(),
  v.maxLength(2_048),
  v.regex(/^https?:\/\/[^\x23\s]+\x23token=[A-Za-z0-9_-]{43}$/u),
);
/** The closed outcome of one transactional email. */
export const emailDeliveryOutcomeSchema = v.union([
  v.strictObject({ status: v.literal("sent") }),
  v.strictObject({ reason: emailFailureReasonSchema, status: v.literal("failed") }),
]);
export type EmailDeliveryOutcomeDto = v.InferOutput<typeof emailDeliveryOutcomeSchema>;
function linkOnlyWhenUndelivered<
  Value extends { readonly delivery: EmailDeliveryOutcomeDto; readonly link?: string | undefined },
>(value: Value): boolean {
  return (value.delivery.status === "sent") === (value.link === undefined);
}

export const invitationCreateRequestSchema = v.strictObject({
  email: emailSchema,
  role: roleSchema,
});
export const invitationResendRequestSchema = v.strictObject({});
export const invitationStateSchema = v.picklist(["pending", "expired"]);
/** A listed invitation; never carries a token or link. */
export const invitationSchema = v.strictObject({
  createdAt: isoTimestampSchema,
  email: emailSchema,
  expiresAt: isoTimestampSchema,
  id: identifierSchema,
  invitedBy: v.pipe(v.string(), v.minLength(1), v.maxLength(320)),
  role: roleSchema,
  state: invitationStateSchema,
});
export const invitationListSchema = v.strictObject({ items: v.array(invitationSchema) });
/** The accept link is present exactly when the invitation email was not sent. */
export const invitationIssueResultSchema = v.pipe(
  v.strictObject({
    delivery: emailDeliveryOutcomeSchema,
    invitation: invitationSchema,
    link: v.optional(accountLinkSchema),
  }),
  v.check(linkOnlyWhenUndelivered, "A link is present exactly when delivery was not sent."),
);
export const invitationInspectRequestSchema = v.strictObject({ token: accountTokenSchema });
export const invitationInspectResultSchema = v.strictObject({
  email: emailSchema,
  expiresAt: isoTimestampSchema,
  role: roleSchema,
});
export const invitationAcceptRequestSchema = v.strictObject({
  displayName: v.optional(displayNameSchema),
  password: passwordSchema,
  token: accountTokenSchema,
});
export const invitationAcceptResultSchema = v.strictObject({ email: emailSchema });
export const passwordResetRequestSchema = v.strictObject({ email: emailSchema });
export const passwordResetConfirmRequestSchema = v.strictObject({
  password: passwordSchema,
  token: accountTokenSchema,
});
export const adminPasswordResetRequestSchema = v.strictObject({});
/** The reset link is present exactly when the reset email was not sent. */
export const adminPasswordResetResultSchema = v.pipe(
  v.strictObject({ delivery: emailDeliveryOutcomeSchema, link: v.optional(accountLinkSchema) }),
  v.check(linkOnlyWhenUndelivered, "A link is present exactly when delivery was not sent."),
);
export const accountProfileUpdateRequestSchema = v.strictObject({
  displayName: displayNameSchema,
});
export const accountPasswordChangeRequestSchema = v.strictObject({
  currentPassword: v.pipe(v.string(), v.minLength(1), v.maxLength(1_024)),
  newPassword: passwordSchema,
  signOutOtherSessions: v.boolean(),
});
export const sessionBrowserSchema = v.picklist([
  "Chrome",
  "Edge",
  "Firefox",
  "Opera",
  "Safari",
  "Unknown",
]);
export const sessionOsSchema = v.picklist([
  "Android",
  "iOS",
  "Linux",
  "macOS",
  "Windows",
  "Unknown",
]);
/** One of the signed-in user's sessions; never a session token or IP address. */
export const accountSessionSchema = v.strictObject({
  browser: sessionBrowserSchema,
  createdAt: isoTimestampSchema,
  current: v.boolean(),
  id: identifierSchema,
  lastActiveAt: isoTimestampSchema,
  os: sessionOsSchema,
});
export const accountSessionListSchema = v.strictObject({ items: v.array(accountSessionSchema) });
export const sessionRevokeRequestSchema = v.strictObject({});
export const sessionRevocationResultSchema = v.strictObject({ revoked: nonNegativeIntegerSchema });
export type InvitationDto = v.InferOutput<typeof invitationSchema>;
export type InvitationListDto = v.InferOutput<typeof invitationListSchema>;
export type InvitationIssueResultDto = v.InferOutput<typeof invitationIssueResultSchema>;
export type InvitationInspectResultDto = v.InferOutput<typeof invitationInspectResultSchema>;
export type InvitationAcceptResultDto = v.InferOutput<typeof invitationAcceptResultSchema>;
export type AdminPasswordResetResultDto = v.InferOutput<typeof adminPasswordResetResultSchema>;
export type AccountSessionDto = v.InferOutput<typeof accountSessionSchema>;
export type AccountSessionListDto = v.InferOutput<typeof accountSessionListSchema>;
export type SessionRevocationResultDto = v.InferOutput<typeof sessionRevocationResultSchema>;
export type ManagedUserListDto = v.InferOutput<typeof managedUserListSchema>;
export const buildTokenCreateRequestSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
});
export const buildTokenSchema = v.strictObject({
  capabilities: v.tuple([v.literal("content:build:read")]),
  createdAt: isoTimestampSchema,
  id: identifierSchema,
  lastUsedAt: v.optional(isoTimestampSchema),
  name: v.string(),
  revokedAt: v.optional(isoTimestampSchema),
  tokenPrefix: v.string(),
});
export const buildTokenCreatedSchema = v.strictObject({
  ...buildTokenSchema.entries,
  token: v.string(),
});
export const buildTokenListSchema = v.strictObject({ items: v.array(buildTokenSchema) });
export const buildRequestSchema = v.strictObject({});
export const buildQueueReceiptSchema = v.strictObject({
  coalesced: v.boolean(),
  eventId: identifierSchema,
  targetVersion: nonNegativeIntegerSchema,
});
export type BuildQueueReceiptDto = v.InferOutput<typeof buildQueueReceiptSchema>;
export type BuildTokenDto = v.InferOutput<typeof buildTokenSchema>;
export type BuildTokenCreatedDto = v.InferOutput<typeof buildTokenCreatedSchema>;
export type BuildTokenListDto = v.InferOutput<typeof buildTokenListSchema>;

const positiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const mediaMimeTypeSchema = v.picklist([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const mediaSortSchema = v.picklist([
  "-createdAt",
  "-filename",
  "-size",
  "createdAt",
  "filename",
  "size",
]);
/** Descriptive text limits in code points, shared with clients that bound their inputs. */
export { MAX_MEDIA_ALT_LENGTH, MAX_MEDIA_CAPTION_LENGTH } from "@lacecms/domain";
export { effectiveAltText } from "@lacecms/content";
export const MAX_MEDIA_SEARCH_LENGTH = 200;
export const MAX_MEDIA_USAGE_ENTRIES = 50;

/** Query parameters accepted by the admin media list; unknown keys stay ignored. */
export const mediaListQuerySchema = v.object({
  after: v.optional(opaqueCursorSchema),
  limit: v.optional(v.pipe(v.string(), v.regex(/^[1-9][0-9]{0,2}$/u))),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(MAX_MEDIA_SEARCH_LENGTH))),
  sort: v.optional(mediaSortSchema),
  type: v.optional(mediaMimeTypeSchema),
});

const mediaAltSchema = v.pipe(
  v.string(),
  v.check(
    (value) => normalizeMediaText(value, "alt") !== undefined,
    "Alt text must be single-line plain text of at most 1,000 characters.",
  ),
);
const mediaCaptionSchema = v.pipe(
  v.string(),
  v.check(
    (value) => normalizeMediaText(value, "caption") !== undefined,
    "A caption must be plain text of at most 2,000 characters.",
  ),
);
const mediaFocalCoordinateSchema = v.pipe(
  v.number(),
  v.check(
    (value: number) => isMediaFocalCoordinate(value),
    "A focal coordinate must be a number from 0 to 1.",
  ),
);
/** `{0, 0}` is the top-left corner of the displayed image. */
export const mediaFocalPointSchema = v.strictObject({
  x: mediaFocalCoordinateSchema,
  y: mediaFocalCoordinateSchema,
});

/** One published entry as public consumers see it; no draft or editorial data. */
export const publicEntrySchema = v.strictObject({
  blocks: v.array(publicBlockSchema),
  fields: jsonObjectSchema,
  id: identifierSchema,
  modelKey: identifierSchema,
  path: v.string(),
  publishedAt: isoTimestampSchema,
  /** Stored SEO values of an entry of an SEO-enabled model; absent otherwise. */
  seo: v.optional(seoValueSchema),
  slug: v.optional(identifierSchema),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
});

/** A media item referenced by public entries, resolved for rendering. */
export const publicMediaSchema = v.strictObject({
  alt: v.nullable(v.pipe(v.string(), v.minLength(1))),
  caption: v.nullable(v.pipe(v.string(), v.minLength(1))),
  focalPoint: v.nullable(mediaFocalPointSchema),
  height: v.nullable(positiveIntegerSchema),
  id: identifierSchema,
  mimeType: v.string(),
  url: v.string(),
  width: v.nullable(positiveIntegerSchema),
});

/** Resolved media keyed by media ID; each item's `id` equals its key. */
export const publicMediaDictionarySchema = v.pipe(
  v.record(identifierSchema, publicMediaSchema),
  v.check(
    (media) => Object.entries(media).every(([id, item]) => item.id === id),
    "Each media item must be keyed by its own ID.",
  ),
);

/** One published route-less global; no path, slug, title, draft, or editorial data. */
export const publicGlobalSchema = v.strictObject({
  blocks: v.array(publicBlockSchema),
  fields: jsonObjectSchema,
  id: identifierSchema,
  modelKey: identifierSchema,
  publishedAt: isoTimestampSchema,
});

export const publicGlobalContentSchema = v.strictObject({
  global: publicGlobalSchema,
  media: publicMediaDictionarySchema,
});

export const publicContentEntrySchema = v.strictObject({
  entry: publicEntrySchema,
  media: publicMediaDictionarySchema,
});
export const publicContentListSchema = v.strictObject({
  items: v.array(publicEntrySchema),
  media: publicMediaDictionarySchema,
  nextCursor: v.optional(opaqueCursorSchema),
});
/**
 * SEO configuration a site resolver needs: the fallback fields of every
 * SEO-enabled model and the global that maps site defaults.
 */
export const exportSeoSchema = v.strictObject({
  defaults: v.nullable(
    v.strictObject({
      ...seoDefaultsSchema.entries,
      modelKey: identifierSchema,
    }),
  ),
  models: v.record(identifierSchema, modelSeoSchema),
});

/** The structure version of the build export; see the public contract evolution policy. */
export const BUILD_EXPORT_FORMAT_VERSION = 1;
const buildExportFormatVersionSchema = v.literal(BUILD_EXPORT_FORMAT_VERSION);

/**
 * The assembled build export: the union of the pages of one page sequence, as
 * returned by the SDK and compared by tests. The API never sends it whole.
 */
export const buildExportSchema = v.strictObject({
  entries: v.array(publicEntrySchema),
  /** Strict output accepts only the current format; tolerant consumers accept any. */
  formatVersion: buildExportFormatVersionSchema,
  /** Always sent by the API; exports produced before globals existed omit it. */
  globals: v.optional(v.array(publicGlobalSchema), []),
  media: publicMediaDictionarySchema,
  /** Always sent by the API; exports produced before SEO existed omit it. */
  seo: v.optional(exportSeoSchema, { defaults: null, models: {} }),
  version: nonNegativeIntegerSchema,
});

/** Entries one build-export page holds at most, and the default page size. */
export const MAX_BUILD_EXPORT_PAGE_SIZE = 100;

/** Query parameters of the build-export endpoint; unknown keys are rejected. */
export const buildExportQuerySchema = v.strictObject({
  after: v.optional(opaqueCursorSchema),
  limit: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^[1-9][0-9]{0,2}$/u),
      v.transform(Number),
      v.maxValue(MAX_BUILD_EXPORT_PAGE_SIZE),
    ),
  ),
});

const buildExportPageEntries = {
  /** Routed entries ordered by path, continuing strictly after the cursor's path. */
  entries: v.array(publicEntrySchema),
  formatVersion: buildExportFormatVersionSchema,
  /** Exactly the media delivered by this page's entries (and globals on the first page). */
  media: publicMediaDictionarySchema,
  /** Present exactly when further entries remain. */
  nextCursor: v.optional(opaqueCursorSchema),
  version: nonNegativeIntegerSchema,
};

/** The first build-export page (no `after`): it alone carries `globals` and `seo`. */
export const buildExportFirstPageSchema = v.strictObject({
  ...buildExportPageEntries,
  globals: v.array(publicGlobalSchema),
  seo: exportSeoSchema,
});

/** A build-export continuation page (`after` present): never `globals` or `seo`. */
export const buildExportContinuationPageSchema = v.strictObject(buildExportPageEntries);

export const mediaMetadataSchema = v.strictObject({
  alt: v.optional(v.pipe(v.string(), v.minLength(1))),
  caption: v.optional(v.pipe(v.string(), v.minLength(1))),
  createdAt: isoTimestampSchema,
  createdBy: actorSummarySchema,
  filename: v.string(),
  focalPoint: v.optional(mediaFocalPointSchema),
  height: v.optional(positiveIntegerSchema),
  id: identifierSchema,
  mimeType: v.string(),
  size: nonNegativeIntegerSchema,
  status: v.picklist(["active", "delete_failed", "deleting"]),
  updatedAt: isoTimestampSchema,
  url: v.string(),
  usageCount: nonNegativeIntegerSchema,
  width: v.optional(positiveIntegerSchema),
});
export const mediaListSchema = cursorPageSchema(mediaMetadataSchema);

const mediaUsageStatesSchema = v.pipe(
  v.array(v.picklist(["draft", "published"])),
  v.minLength(1),
  v.maxLength(2),
  v.check((states) => new Set(states).size === states.length, "Usage states must be unique."),
);
export const mediaUsageLocationSchema = v.variant("source", [
  v.strictObject({
    field: identifierSchema,
    source: v.literal("field"),
    states: mediaUsageStatesSchema,
  }),
  v.strictObject({
    field: v.literal("image"),
    source: v.literal("seo"),
    states: mediaUsageStatesSchema,
  }),
  v.strictObject({
    blockKey: identifierSchema,
    blockType: identifierSchema,
    field: identifierSchema,
    source: v.literal("block"),
    states: mediaUsageStatesSchema,
  }),
]);
export const mediaUsageEntrySchema = v.strictObject({
  entryId: identifierSchema,
  locations: v.pipe(v.array(mediaUsageLocationSchema), v.minLength(1)),
  modelKey: identifierSchema,
  slug: v.optional(identifierSchema),
  status: contentEntryStatusSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
});
/** Admin media details: metadata plus the bounded entries that use the item. */
export const mediaDetailSchema = v.strictObject({
  ...mediaMetadataSchema.entries,
  usage: v.pipe(v.array(mediaUsageEntrySchema), v.maxLength(MAX_MEDIA_USAGE_ENTRIES)),
});

/**
 * Descriptive metadata patch: an omitted key stays unchanged and `null` clears
 * it. Text is trimmed by the use case; empty text also clears.
 */
export const updateMediaMetadataRequestSchema = v.pipe(
  v.strictObject({
    alt: v.optional(v.nullable(mediaAltSchema)),
    caption: v.optional(v.nullable(mediaCaptionSchema)),
    focalPoint: v.optional(v.nullable(mediaFocalPointSchema)),
  }),
  v.check(
    (value) => Object.keys(value).length > 0,
    "Supply at least one of alt, caption, or focalPoint.",
  ),
);
export const updateMediaMetadataResultSchema = v.strictObject({
  build: buildDispatchOutcomeSchema,
  media: mediaMetadataSchema,
});

/** The closed site-build lifecycle; only `succeeded` proves publication. */
export const siteBuildStatusSchema = v.picklist(siteBuildStatuses);

export const siteBuildSchema = v.strictObject({
  id: identifierSchema,
  publishedSnapshotId: v.optional(identifierSchema),
  requestedAt: isoTimestampSchema,
  requestedBy: identifierSchema,
  status: siteBuildStatusSchema,
  targetVersion: nonNegativeIntegerSchema,
});

/** Persisted build history exposed to authenticated admin sessions. */
export const buildFailureReasonSchema = v.picklist(siteBuildFailureReasons);
export const buildSourcePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(512),
  v.regex(BUILD_SOURCE_PATH_PATTERN),
  v.check((value) => safeBuildSourcePath(value) !== undefined),
  v.description(
    "Installation-relative ASCII entry path; excludes credentials, environment files, Git and CMS data. Present only with a source failure reason.",
  ),
);
/** Latest observed stage of a tracked provider deployment. */
export const siteBuildProviderStageSchema = v.picklist(siteBuildProviderStages);
export const siteBuildRecordSchema = v.pipe(
  v.strictObject({
    id: identifierSchema,
    reason: identifierSchema,
    status: siteBuildStatusSchema,
    targetVersion: nonNegativeIntegerSchema,
    requestedBy: identifierSchema,
    requestedAt: isoTimestampSchema,
    startedAt: v.optional(isoTimestampSchema),
    completedAt: v.optional(isoTimestampSchema),
    providerBuildId: v.optional(identifierSchema),
    providerStage: v.optional(siteBuildProviderStageSchema),
    providerCheckedAt: v.optional(isoTimestampSchema),
    error: v.optional(buildFailureReasonSchema),
    errorPath: v.optional(buildSourcePathSchema),
  }),
  v.check(
    (value) =>
      value.errorPath === undefined ||
      (value.error !== undefined && sourceFailureReasons.includes(value.error)),
    "Source path requires a source failure reason.",
  ),
);
export const siteBuildListSchema = v.strictObject({
  items: v.pipe(v.array(siteBuildRecordSchema), v.maxLength(100)),
});
export const MAX_BUILD_SITE_URL_LENGTH = 2048;

interface ParsedUrl {
  readonly href: string;
  readonly password: string;
  readonly protocol: string;
  readonly username: string;
}

// The package compiles without DOM or Node types; every supported runtime provides WHATWG URL.
const ParsedUrl = (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL;

function isSiteBaseUrl(value: string): boolean {
  if (!value.endsWith("/") || value.includes("?") || value.includes("#")) return false;
  let url: ParsedUrl;
  try {
    url = new ParsedUrl(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.username === "" &&
    url.password === "" &&
    url.href === value
  );
}

/** The public site's absolute HTTP(S) base URL: no credentials, query or fragment, trailing slash. */
export const buildSiteUrlSchema = v.pipe(
  v.string(),
  v.maxLength(MAX_BUILD_SITE_URL_LENGTH),
  v.check(isSiteBaseUrl, "Site URL must be an absolute HTTP(S) base URL ending with a slash."),
);

/** Operator-authored current configuration; never a filesystem path or historical attribution. */
export const buildSiteIdentitySchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)),
  label: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(80),
    v.regex(/^[A-Za-z0-9](?:[A-Za-z0-9 _-]*[A-Za-z0-9])?$/u),
  ),
  url: v.optional(buildSiteUrlSchema),
});
export const buildSiteSelectionSchema = v.strictObject({
  site: v.nullable(buildSiteIdentitySchema),
});
export type BuildSiteIdentityDto = v.InferOutput<typeof buildSiteIdentitySchema>;
export type BuildSiteSelectionDto = v.InferOutput<typeof buildSiteSelectionSchema>;
export type SiteBuildRecordDto = v.InferOutput<typeof siteBuildRecordSchema>;
export type SiteBuildListDto = v.InferOutput<typeof siteBuildListSchema>;

export const contractValidationIssueSchema = v.strictObject({
  code: identifierSchema,
  message: v.string(),
  path: jsonPointerSchema,
});

export const errorCodeSchema = v.picklist([
  "AUTHORIZATION_DENIED",
  "BUILD_EXPORT_VERSION_CHANGED",
  "CONFLICT",
  "CONTENT_INVALID_STATE",
  "CONTENT_MODEL_CARDINALITY_CONFLICT",
  "CONTENT_NOT_PUBLISHED",
  "CONTENT_PAGE_SINGLETON",
  "CONTENT_PUBLISHED_IMMUTABLE",
  "CONTENT_REVISION_CONFLICT",
  "CONTENT_ROUTE_CONFLICT",
  "LAST_ADMIN_PROTECTED",
  "MEDIA_IN_USE",
  "MEDIA_UPDATE_CONFLICT",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "INVITATION_INVALID",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "RESET_INVALID",
  "VALIDATION_FAILED",
]);

export const errorEnvelopeSchema = v.strictObject({
  error: v.strictObject({
    code: errorCodeSchema,
    details: v.optional(jsonObjectSchema),
    message: v.string(),
  }),
});

type AnySchema = v.GenericSchema;

/**
 * Rebuilds a strict read schema so that every contract-defined object strips
 * unknown keys instead of rejecting them. Required keys, value types, defaults,
 * pipes and consumer-owned JSON (custom leaves) are unchanged; `substitutions`
 * replace specific leaves, such as the closed error-code picklist.
 */
function toTolerantSchema(
  schema: AnySchema,
  substitutions: ReadonlyMap<AnySchema, AnySchema>,
): AnySchema {
  const replacement = substitutions.get(schema);
  if (replacement !== undefined) return replacement;
  const node = schema as AnySchema & {
    readonly default?: unknown;
    readonly entries?: Readonly<Record<string, AnySchema>>;
    readonly item?: AnySchema;
    readonly key?: AnySchema;
    readonly options?: readonly AnySchema[];
    readonly pipe?: readonly [AnySchema, ...v.PipeItem<unknown, unknown, v.BaseIssue<unknown>>[]];
    readonly value?: AnySchema;
    readonly wrapped?: AnySchema;
  };
  const tolerant = (child: AnySchema) => toTolerantSchema(child, substitutions);
  if (node.pipe !== undefined) {
    const [root, ...actions] = node.pipe;
    return (v.pipe as unknown as (...items: unknown[]) => AnySchema)(tolerant(root), ...actions);
  }
  switch (node.type) {
    case "loose_object":
    case "object":
    case "strict_object":
      return v.object(
        Object.fromEntries(
          Object.entries(node.entries!).map(([key, child]) => [key, tolerant(child)]),
        ),
      );
    case "array":
      return v.array(tolerant(node.item!));
    case "record":
      return v.record(
        node.key as v.GenericSchema<string, string | number | symbol>,
        tolerant(node.value!),
      );
    case "optional":
      return v.optional(tolerant(node.wrapped!), node.default as never);
    case "nullable":
      return v.nullable(tolerant(node.wrapped!), node.default as never);
    case "nullish":
      return v.nullish(tolerant(node.wrapped!), node.default as never);
    case "union":
      return v.union(node.options!.map(tolerant));
    default:
      return schema;
  }
}

/**
 * A newer server may report an error code or export format this release does
 * not know. A delivered block carrying `hidden` is rejected rather than
 * stripped: removing the flag would render content the CMS marked as hidden.
 */
const tolerantSubstitutions = new Map<AnySchema, AnySchema>([
  [errorCodeSchema, v.pipe(v.string(), v.minLength(1), v.maxLength(128))],
  [buildExportFormatVersionSchema, v.pipe(v.number(), v.safeInteger(), v.minValue(1))],
]);
tolerantSubstitutions.set(
  publicBlockSchema,
  v.pipe(
    v.unknown(),
    v.check(
      (value) => !(typeof value === "object" && value !== null && Object.hasOwn(value, "hidden")),
      "A hidden block is never delivered.",
    ),
    toTolerantSchema(publicBlockSchema, tolerantSubstitutions),
  ),
);

function tolerant<Schema extends AnySchema>(schema: Schema): Schema {
  // The derived schema has the strict schema's output type; only unknown keys differ.
  return toTolerantSchema(schema, tolerantSubstitutions) as Schema;
}

/**
 * Consumer variants of the public read schemas. They ignore and remove object
 * keys a newer API may add, while enforcing every key, type and constraint of
 * the strict variants the API validates its output with.
 */
export const tolerantPublicSchemas = Object.freeze({
  buildExport: tolerant(buildExportSchema),
  buildExportContinuationPage: tolerant(buildExportContinuationPageSchema),
  buildExportFirstPage: tolerant(buildExportFirstPageSchema),
  errorEnvelope: tolerant(errorEnvelopeSchema) as unknown as v.GenericSchema<
    unknown,
    TolerantErrorEnvelope
  >,
  exportSeo: tolerant(exportSeoSchema),
  publicBlock: tolerant(publicBlockSchema),
  publicContentEntry: tolerant(publicContentEntrySchema),
  publicContentList: tolerant(publicContentListSchema),
  publicEntry: tolerant(publicEntrySchema),
  publicGlobal: tolerant(publicGlobalSchema),
  publicGlobalContent: tolerant(publicGlobalContentSchema),
  publicMedia: tolerant(publicMediaSchema),
  publicMediaDictionary: tolerant(publicMediaDictionarySchema),
  seoValue: tolerant(seoValueSchema),
});

export type ContentEntryDto = v.InferOutput<typeof contentEntrySchema>;
export type AdminContentEntryDto = v.InferOutput<typeof adminContentEntrySchema>;
export type ActorSummaryDto = v.InferOutput<typeof actorSummarySchema>;
export type ContentEntryStatusDto = v.InferOutput<typeof contentEntryStatusSchema>;
export type ContentEntrySortDto = v.InferOutput<typeof contentEntrySortSchema>;
export type ContentEntryStatusTotalsDto = v.InferOutput<typeof contentEntryStatusTotalsSchema>;
export type ContentEntryListQueryDto = v.InferOutput<typeof contentEntryListQuerySchema>;
export type PublishContentEntryResultDto = v.InferOutput<typeof publishContentEntryResultSchema>;
export type UnpublishContentEntryResultDto = v.InferOutput<
  typeof unpublishContentEntryResultSchema
>;
export type ContentEntryListDto = v.InferOutput<typeof contentEntryListSchema>;
export type ContentEntrySummaryDto = v.InferOutput<typeof contentEntrySummarySchema>;
export type ContentModelDto = v.InferOutput<typeof contentModelSchema>;
export type ContentModelListDto = v.InferOutput<typeof contentModelListSchema>;
export type ContentSnapshotDto = v.InferOutput<typeof contentSnapshotSchema>;
export type SeoValueDto = v.InferOutput<typeof seoValueSchema>;
export type SeoInputDto = v.InferOutput<typeof seoInputSchema>;
export type ModelSeoDto = v.InferOutput<typeof modelSeoSchema>;
export type SeoDefaultsDto = v.InferOutput<typeof seoDefaultsSchema>;
export type ContentBlockDto = v.InferOutput<typeof contentBlockSchema>;
export type PublicBlockDto = v.InferOutput<typeof publicBlockSchema>;
export type PublicEntryDto = v.InferOutput<typeof publicEntrySchema>;
export type PublicMediaDto = v.InferOutput<typeof publicMediaSchema>;
export type PublicMediaDictionaryDto = v.InferOutput<typeof publicMediaDictionarySchema>;
export type PublicContentEntryDto = v.InferOutput<typeof publicContentEntrySchema>;
export type PublicGlobalDto = v.InferOutput<typeof publicGlobalSchema>;
export type PublicGlobalContentDto = v.InferOutput<typeof publicGlobalContentSchema>;
export type PublicContentListDto = v.InferOutput<typeof publicContentListSchema>;
export type BuildExportDto = v.InferOutput<typeof buildExportSchema>;
export type BuildExportFirstPageDto = v.InferOutput<typeof buildExportFirstPageSchema>;
export type BuildExportContinuationPageDto = v.InferOutput<
  typeof buildExportContinuationPageSchema
>;
export type BuildExportPageDto = BuildExportFirstPageDto | BuildExportContinuationPageDto;
export type BuildExportQueryDto = v.InferOutput<typeof buildExportQuerySchema>;
export type MediaMetadataDto = v.InferOutput<typeof mediaMetadataSchema>;
export type MediaListDto = v.InferOutput<typeof mediaListSchema>;
export type MediaDetailDto = v.InferOutput<typeof mediaDetailSchema>;
export type MediaFocalPointDto = v.InferOutput<typeof mediaFocalPointSchema>;
export type UpdateMediaMetadataRequestDto = v.InferOutput<typeof updateMediaMetadataRequestSchema>;
export type UpdateMediaMetadataResultDto = v.InferOutput<typeof updateMediaMetadataResultSchema>;
export type MediaUsageEntryDto = v.InferOutput<typeof mediaUsageEntrySchema>;
export type MediaUsageLocationDto = v.InferOutput<typeof mediaUsageLocationSchema>;
export type MediaSortDto = v.InferOutput<typeof mediaSortSchema>;
export type MediaMimeTypeDto = v.InferOutput<typeof mediaMimeTypeSchema>;
export type MediaListQueryDto = v.InferOutput<typeof mediaListQuerySchema>;
export type SiteBuildDto = v.InferOutput<typeof siteBuildSchema>;
export type ErrorEnvelope = v.InferOutput<typeof errorEnvelopeSchema>;
export type LaceErrorCode = v.InferOutput<typeof errorCodeSchema>;
/** An error code as consumers read it: a known code, or one a newer API introduced. */
export type ReportedLaceErrorCode = LaceErrorCode | (string & {});
/** An error envelope as consumers read it; its code may be unknown to this release. */
export interface TolerantErrorEnvelope {
  readonly error: Omit<ErrorEnvelope["error"], "code"> & { readonly code: ReportedLaceErrorCode };
}
export type ContractValidationIssue = v.InferOutput<typeof contractValidationIssueSchema>;

/** Maps a portable route without importing configuration or persistence types. */
export function toContentModelRouteDto(route: ContentModelRoute) {
  switch (route.kind) {
    case "page":
      return { kind: "page" as const, key: route.key, path: route.path };
    case "collection":
      return { kind: "collection" as const, key: route.key, route: route.route };
    case "global":
      return { kind: "global" as const, key: route.key };
    default:
      return route satisfies never;
  }
}

export function toContentBlockDto(block: ContentBlock): ContentBlockDto {
  return { ...toPublicBlockDto(block), hidden: block.hidden };
}

/** Maps a delivered block; callers leave hidden blocks out first. */
export function toPublicBlockDto(block: ContentBlock): PublicBlockDto {
  return {
    ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
    ...(block.className === undefined ? {} : { className: block.className }),
    data: block.data,
    key: block.key,
    position: block.position,
    schemaVersion: block.schemaVersion,
    settings: block.settings,
    type: block.type,
  };
}

/** The delivered blocks of a published snapshot, ordered by position, without hidden ones. */
function publicBlocks(blocks: readonly ContentBlock[]): PublicBlockDto[] {
  return blocks
    .filter((block) => !block.hidden)
    .sort((left, right) => left.position - right.position)
    .map(toPublicBlockDto);
}

/** Maps a stored SEO group to the complete client shape with `null` for unset values. */
export function toSeoDto(seo: EntrySeo | undefined): SeoValueDto {
  return {
    canonical: seo?.canonical ?? null,
    description: seo?.description ?? null,
    image: seo?.image ?? null,
    noindex: seo?.noindex === true,
    title: seo?.title ?? null,
  };
}

/** Whether an entry's model enables SEO, which decides if its DTOs carry `seo`. */
export interface SeoMappingOptions {
  readonly seo?: boolean;
}

export function toContentSnapshotDto(
  snapshot: ContentSnapshot,
  options: SeoMappingOptions = {},
): ContentSnapshotDto {
  const base = {
    blocks: snapshot.blocks.map(toContentBlockDto),
    createdAt: toIsoTimestamp(snapshot.createdAt),
    entryId: snapshot.entryId,
    fields: snapshot.fields,
    id: snapshot.id,
    revision: snapshot.revision,
    ...(options.seo === true ? { seo: toSeoDto(snapshot.seo) } : {}),
    ...(snapshot.slug === undefined ? {} : { slug: snapshot.slug }),
    title: snapshot.title,
    updatedAt: toIsoTimestamp(snapshot.updatedAt),
    updatedBy: snapshot.updatedBy,
  };
  return snapshot.state === "draft" ? { ...base, state: "draft" } : { ...base, state: "published" };
}

export function toContentEntryDto(
  entry: ContentEntry,
  options: SeoMappingOptions = {},
): ContentEntryDto {
  return {
    draft: toContentSnapshotDto(entry.draft, options) as v.InferOutput<typeof draftSnapshotSchema>,
    id: entry.id,
    model: toContentModelRouteDto(entry.model),
    ...(entry.published === undefined
      ? {}
      : {
          published: toContentSnapshotDto(entry.published, options) as v.InferOutput<
            typeof publishedSnapshotSchema
          >,
        }),
  };
}

/** Maps an entry for admin responses, adding the draft's last editor display name. */
export function toAdminContentEntryDto(
  entry: ContentEntry,
  updatedBy: { readonly displayName: string; readonly id: string },
  options: SeoMappingOptions = {},
): AdminContentEntryDto {
  return {
    ...toContentEntryDto(entry, options),
    updatedBy: { displayName: updatedBy.displayName, id: updatedBy.id },
  };
}

/** Maps the portable publication command outcome without exposing application internals. */
export function toPublishContentEntryResultDto(input: {
  readonly build:
    | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
    | Readonly<{ readonly status: "not-dispatched" }>;
  readonly entry: ContentEntry;
  readonly publication: "published" | "replayed";
  readonly seo?: boolean;
  readonly updatedBy: { readonly displayName: string; readonly id: string };
}): PublishContentEntryResultDto {
  return {
    build:
      input.build.status === "queued"
        ? { status: "queued", targetVersion: input.build.targetVersion }
        : { status: input.build.status },
    entry: toAdminContentEntryDto(input.entry, input.updatedBy, { seo: input.seo === true }),
    publication: input.publication,
  };
}

/** Maps the portable unpublication outcome without exposing application internals. */
export function toUnpublishContentEntryResultDto(input: {
  readonly build:
    | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
    | Readonly<{ readonly status: "not-dispatched" }>;
  readonly entry: ContentEntry;
  readonly seo?: boolean;
  readonly unpublication: "replayed" | "unpublished";
  readonly updatedBy: { readonly displayName: string; readonly id: string };
}): UnpublishContentEntryResultDto {
  return {
    build:
      input.build.status === "queued"
        ? { status: "queued", targetVersion: input.build.targetVersion }
        : { status: input.build.status },
    entry: toAdminContentEntryDto(input.entry, input.updatedBy, { seo: input.seo === true }),
    unpublication: input.unpublication,
  };
}

/** Maps metadata without exposing the private storage key. */
export interface MediaMetadataDtoSource {
  readonly alt?: string;
  readonly caption?: string;
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: { readonly displayName: string; readonly id: string };
  readonly filename: string;
  readonly focalPoint?: MediaFocalPoint;
  readonly height?: number;
  readonly id: string;
  readonly mimeType: string;
  readonly size: number;
  readonly status: "active" | "delete_failed" | "deleting";
  readonly updatedAt: UnixMilliseconds;
  readonly usageCount: number;
  readonly width?: number;
}

export function toMediaMetadataDto(media: MediaMetadataDtoSource, url: string): MediaMetadataDto {
  return {
    ...(media.alt === undefined ? {} : { alt: media.alt }),
    ...(media.caption === undefined ? {} : { caption: media.caption }),
    createdAt: toIsoTimestamp(media.createdAt),
    createdBy: { displayName: media.createdBy.displayName, id: media.createdBy.id },
    filename: media.filename,
    ...(media.focalPoint === undefined
      ? {}
      : { focalPoint: { x: media.focalPoint.x, y: media.focalPoint.y } }),
    ...(media.height === undefined ? {} : { height: media.height }),
    id: media.id,
    mimeType: media.mimeType,
    size: media.size,
    status: media.status,
    updatedAt: toIsoTimestamp(media.updatedAt),
    url,
    usageCount: media.usageCount,
    ...(media.width === undefined ? {} : { width: media.width }),
  };
}

export type MediaUsageLocationDtoSource =
  | {
      readonly field: string;
      readonly source: "field";
      readonly states: readonly ("draft" | "published")[];
    }
  | {
      readonly field: "image";
      readonly source: "seo";
      readonly states: readonly ("draft" | "published")[];
    }
  | {
      readonly blockKey: string;
      readonly blockType: string;
      readonly field: string;
      readonly source: "block";
      readonly states: readonly ("draft" | "published")[];
    };

export interface MediaDetailDtoSource extends MediaMetadataDtoSource {
  readonly usage: readonly {
    readonly entryId: string;
    readonly locations: readonly MediaUsageLocationDtoSource[];
    readonly modelKey: string;
    readonly slug?: string;
    readonly status: "changed" | "draft" | "published";
    readonly title: string;
  }[];
}

/** Maps a media item and its usage without exposing storage or snapshot identities. */
export function toMediaDetailDto(media: MediaDetailDtoSource, url: string): MediaDetailDto {
  return {
    ...toMediaMetadataDto(media, url),
    usage: media.usage.map((entry) => ({
      entryId: entry.entryId,
      locations: entry.locations.map((location) =>
        location.source === "field"
          ? { field: location.field, source: "field" as const, states: [...location.states] }
          : location.source === "seo"
            ? { field: "image" as const, source: "seo" as const, states: [...location.states] }
            : {
                blockKey: location.blockKey,
                blockType: location.blockType,
                field: location.field,
                source: "block" as const,
                states: [...location.states],
              },
      ),
      modelKey: entry.modelKey,
      ...(entry.slug === undefined ? {} : { slug: entry.slug }),
      status: entry.status,
      title: entry.title,
    })),
  };
}

/** Maps a metadata update and its independent build outcome. */
export function toUpdateMediaMetadataResultDto(
  input: {
    readonly build:
      | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
      | Readonly<{ readonly status: "not-dispatched" }>;
    readonly media: MediaMetadataDtoSource;
  },
  url: string,
): UpdateMediaMetadataResultDto {
  return {
    build:
      input.build.status === "queued"
        ? { status: "queued", targetVersion: input.build.targetVersion }
        : { status: input.build.status },
    media: toMediaMetadataDto(input.media, url),
  };
}

/** The strong media version tag: `updatedAt` in quoted Unix milliseconds. */
export function mediaEntityTag(updatedAt: UnixMilliseconds | number): EntityTag {
  return entityTagForVersion(updatedAt);
}

/**
 * Parses the required media `If-Match` precondition into the expected
 * `updatedAt`. Only one strong tag is accepted: absent, weak, `*`, list and
 * malformed values are refused.
 */
export function resolveMediaPrecondition(ifMatch: string | undefined): UnixMilliseconds {
  if (ifMatch === undefined) throw new TypeError("If-Match is required.");
  const value = ifMatch.trim();
  if (value.startsWith("W/")) throw new TypeError("If-Match requires a strong media tag.");
  if (!/^"[0-9]{1,16}"$/u.test(value)) {
    throw new TypeError("If-Match must be one strong media tag.");
  }
  return unixMilliseconds(versionFromEntityTag(value));
}

/** Produces the stable Lace media URL from configured public origin data only. */
export function mediaUrl(baseUrl: string, mediaId: string): string {
  if (!/^https?:\/\/[^\s]+\/$/u.test(baseUrl)) {
    throw new TypeError("Media base URL must be an absolute HTTP(S) URL ending in a slash.");
  }
  return `${baseUrl}api/v1/public/media/${encodeURIComponent(mediaId)}`;
}

export function toSiteBuildDto(build: SiteBuildState): SiteBuildDto {
  return {
    id: build.id,
    ...(build.publishedSnapshotId === undefined
      ? {}
      : { publishedSnapshotId: build.publishedSnapshotId }),
    requestedAt: toIsoTimestamp(build.requestedAt),
    requestedBy: build.requestedBy,
    status: build.status,
    targetVersion: build.targetVersion,
  };
}

export function toSiteBuildRecordDto(build: {
  readonly id: string;
  readonly reason: string;
  readonly status: SiteBuildStatus;
  readonly targetVersion: number;
  readonly requestedBy: string;
  readonly requestedAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly providerBuildId?: string;
  readonly providerStage?: SiteBuildProviderStage;
  readonly providerCheckedAt?: number;
  readonly error?: string;
  readonly errorPath?: string;
}): SiteBuildRecordDto {
  return {
    id: build.id,
    reason: build.reason,
    status: build.status,
    targetVersion: build.targetVersion,
    requestedBy: build.requestedBy,
    requestedAt: toIsoTimestamp(build.requestedAt),
    ...(build.startedAt === undefined ? {} : { startedAt: toIsoTimestamp(build.startedAt) }),
    ...(build.completedAt === undefined ? {} : { completedAt: toIsoTimestamp(build.completedAt) }),
    ...(build.providerBuildId === undefined ? {} : { providerBuildId: build.providerBuildId }),
    ...(build.providerStage === undefined ? {} : { providerStage: build.providerStage }),
    ...(build.providerCheckedAt === undefined
      ? {}
      : { providerCheckedAt: toIsoTimestamp(build.providerCheckedAt) }),
    ...(build.error === undefined ? {} : { error: normalizeBuildFailure(build.error).reason }),
    ...(build.error === undefined ||
    normalizeBuildFailure(build.error, build.errorPath).path === undefined
      ? {}
      : { errorPath: normalizeBuildFailure(build.error, build.errorPath).path! }),
  };
}

/** A published entry with the media its published snapshot references. */
export interface PublicEntrySource {
  readonly entry: ContentEntry;
  readonly media: readonly PublicMediaSource[];
  readonly path: string;
}

/** The media values a public response may disclose. */
export interface PublicMediaSource {
  readonly alt?: string;
  readonly caption?: string;
  readonly focalPoint?: MediaFocalPoint;
  readonly height?: number;
  readonly id: string;
  readonly mimeType: string;
  readonly width?: number;
}

/** Builds the public media URL of one media ID. */
export type PublicMediaUrl = (mediaId: string) => string;

/** Maps the published snapshot of an entry; the draft is never read. */
export function toPublicEntryDto(
  entry: ContentEntry,
  path: string,
  options: SeoMappingOptions = {},
): PublicEntryDto {
  const snapshot = entry.published;
  if (snapshot === undefined) throw new TypeError("A public entry requires a published snapshot.");
  return {
    blocks: publicBlocks(snapshot.blocks),
    fields: snapshot.fields,
    id: entry.id,
    modelKey: entry.model.key,
    path,
    publishedAt: toIsoTimestamp(snapshot.createdAt),
    ...(options.seo === true ? { seo: toSeoDto(snapshot.seo) } : {}),
    ...(snapshot.slug === undefined ? {} : { slug: snapshot.slug }),
    title: snapshot.title,
  };
}

/** Keys of the models whose public entries carry `seo`. */
export interface PublicSeoOptions {
  readonly seoModels?: ReadonlySet<string>;
}

function publicEntryOptions(entry: ContentEntry, options: PublicSeoOptions): SeoMappingOptions {
  return { seo: options.seoModels?.has(entry.model.key) === true };
}

/** Maps the published snapshot of a global; the draft and its title are never read. */
export function toPublicGlobalDto(entry: ContentEntry): PublicGlobalDto {
  const snapshot = entry.published;
  if (snapshot === undefined) throw new TypeError("A public global requires a published snapshot.");
  return {
    blocks: publicBlocks(snapshot.blocks),
    fields: snapshot.fields,
    id: entry.id,
    modelKey: entry.model.key,
    publishedAt: toIsoTimestamp(snapshot.createdAt),
  };
}

export function toPublicMediaDto(media: PublicMediaSource, url: string): PublicMediaDto {
  return {
    alt: media.alt ?? null,
    caption: media.caption ?? null,
    focalPoint:
      media.focalPoint === undefined ? null : { x: media.focalPoint.x, y: media.focalPoint.y },
    height: media.height ?? null,
    id: media.id,
    mimeType: media.mimeType,
    url,
    width: media.width ?? null,
  };
}

/** Deduplicates media by ID into a dictionary whose keys are in code-unit order. */
export function toPublicMediaDictionary(
  media: readonly PublicMediaSource[],
  urlFor: PublicMediaUrl,
): PublicMediaDictionaryDto {
  const byId = new Map<string, PublicMediaSource>();
  for (const item of media) if (!byId.has(item.id)) byId.set(item.id, item);
  const dictionary: Record<string, PublicMediaDto> = {};
  for (const id of [...byId.keys()].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  ))
    dictionary[id] = toPublicMediaDto(byId.get(id)!, urlFor(id));
  return dictionary;
}

export function toPublicContentEntryDto(
  value: PublicEntrySource,
  urlFor: PublicMediaUrl,
  options: PublicSeoOptions = {},
): PublicContentEntryDto {
  return {
    entry: toPublicEntryDto(value.entry, value.path, publicEntryOptions(value.entry, options)),
    media: toPublicMediaDictionary(value.media, urlFor),
  };
}

export function toPublicContentListDto(
  value: { readonly items: readonly PublicEntrySource[]; readonly nextCursor?: string },
  urlFor: PublicMediaUrl,
  options: PublicSeoOptions = {},
): PublicContentListDto {
  return {
    items: value.items.map(({ entry, path }) =>
      toPublicEntryDto(entry, path, publicEntryOptions(entry, options)),
    ),
    media: toPublicMediaDictionary(
      value.items.flatMap((item) => item.media),
      urlFor,
    ),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor as OpaqueCursorDto }),
  };
}

/** A published global and the media its publication references. */
export interface PublicGlobalSource {
  readonly entry: ContentEntry;
  readonly media: readonly PublicMediaSource[];
}

export function toPublicGlobalContentDto(
  value: PublicGlobalSource,
  urlFor: PublicMediaUrl,
): PublicGlobalContentDto {
  return {
    global: toPublicGlobalDto(value.entry),
    media: toPublicMediaDictionary(value.media, urlFor),
  };
}

export interface BuildExportSource {
  readonly entries: readonly PublicEntrySource[];
  readonly globals?: readonly PublicGlobalSource[];
  readonly version: number;
}

/** One page read from the build-export port. */
export interface BuildExportPageSource extends BuildExportSource {
  readonly nextCursor?: string;
}

/** The export's SEO configuration section. */
export type ExportSeoDto = v.InferOutput<typeof exportSeoSchema>;

function exportSeoDto(seo: ExportSeoDto): ExportSeoDto {
  return {
    defaults: seo.defaults === null ? null : { ...seo.defaults },
    models: Object.fromEntries(
      Object.keys(seo.models)
        .sort()
        .map((key) => [key, { ...seo.models[key]! }]),
    ),
  };
}

function exportPageEntries(
  value: BuildExportPageSource,
  urlFor: PublicMediaUrl,
  seoModels: ReadonlySet<string>,
): BuildExportContinuationPageDto {
  const globals = value.globals ?? [];
  return {
    entries: value.entries.map(({ entry, path }) =>
      toPublicEntryDto(entry, path, publicEntryOptions(entry, { seoModels })),
    ),
    formatVersion: BUILD_EXPORT_FORMAT_VERSION,
    media: toPublicMediaDictionary(
      [...value.entries.flatMap((item) => item.media), ...globals.flatMap((item) => item.media)],
      urlFor,
    ),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor as OpaqueCursorDto }),
    version: value.version,
  };
}

/** Converts the first build-export page; it alone carries globals and the SEO section. */
export function toBuildExportFirstPageDto(
  value: BuildExportPageSource,
  urlFor: PublicMediaUrl,
  seo: ExportSeoDto = { defaults: null, models: {} },
): BuildExportFirstPageDto {
  return {
    ...exportPageEntries(value, urlFor, new Set(Object.keys(seo.models))),
    globals: (value.globals ?? []).map(({ entry }) => toPublicGlobalDto(entry)),
    seo: exportSeoDto(seo),
  };
}

/** Converts a build-export continuation page; it never carries globals or SEO. */
export function toBuildExportContinuationPageDto(
  value: BuildExportPageSource,
  urlFor: PublicMediaUrl,
  seo: ExportSeoDto = { defaults: null, models: {} },
): BuildExportContinuationPageDto {
  if (value.globals !== undefined)
    throw new TypeError("A build-export continuation page never carries globals.");
  return exportPageEntries(value, urlFor, new Set(Object.keys(seo.models)));
}

/** Converts a complete content source to the assembled export consumers and tests compare. */
export function toBuildExportDto(
  value: BuildExportSource,
  urlFor: PublicMediaUrl,
  seo: ExportSeoDto = { defaults: null, models: {} },
): BuildExportDto {
  const { nextCursor: _nextCursor, ...page } = toBuildExportFirstPageDto(
    { entries: value.entries, globals: value.globals ?? [], version: value.version },
    urlFor,
    seo,
  );
  return page;
}

export interface ContentModelSource {
  readonly blockDefinitions?: readonly BlockMetadata[];
  readonly blocks: readonly string[];
  readonly description?: string;
  readonly fields: FieldMetadataMapDto;
  readonly key: string;
  readonly kind: ContentModelKind;
  readonly label?: string;
  readonly listFields?: readonly string[];
  readonly layout?: FormLayout;
  readonly path?: string;
  readonly route?: string;
  readonly seo?: { readonly description?: string; readonly image?: string };
  readonly seoDefaults?: {
    readonly description?: string;
    readonly image?: string;
    readonly siteName: string;
    readonly titleTemplate?: string;
  };
  readonly version: number;
}

/** Maps a model's SEO fallback fields with `null` for unmapped values. */
export function toModelSeoDto(seo: NonNullable<ContentModelSource["seo"]>): ModelSeoDto {
  return { description: seo.description ?? null, image: seo.image ?? null };
}

/** Maps a site SEO defaults mapping with `null` for unmapped optional values. */
export function toSeoDefaultsDto(
  defaults: NonNullable<ContentModelSource["seoDefaults"]>,
): SeoDefaultsDto {
  return {
    description: defaults.description ?? null,
    image: defaults.image ?? null,
    siteName: defaults.siteName,
    titleTemplate: defaults.titleTemplate ?? null,
  };
}

export function toContentModelDto(
  model: ContentModelSource,
): v.InferOutput<typeof contentModelSchema> {
  return {
    ...(model.blockDefinitions === undefined
      ? {}
      : { blockDefinitions: [...model.blockDefinitions] }),
    blocks: [...model.blocks],
    ...(model.description === undefined ? {} : { description: model.description }),
    fields: model.fields,
    key: model.key,
    kind: model.kind,
    ...(model.label === undefined ? {} : { label: model.label }),
    ...(model.listFields === undefined ? {} : { listFields: [...model.listFields] }),
    ...(model.layout === undefined
      ? {}
      : { layout: normalizeFormLayout(model.layout, model.fields)! }),
    ...(model.path === undefined ? {} : { path: model.path }),
    ...(model.route === undefined ? {} : { route: model.route }),
    ...(model.seo === undefined ? {} : { seo: toModelSeoDto(model.seo) }),
    ...(model.seoDefaults === undefined
      ? {}
      : { seoDefaults: toSeoDefaultsDto(model.seoDefaults) }),
    version: model.version,
  };
}

export interface RevisionPreconditionInput {
  readonly expectedRevision?: number;
  readonly ifMatch?: string;
}

/** Normalizes equivalent HTTP/body preconditions into the application revision value. */
export function resolveExpectedRevision(input: RevisionPreconditionInput): number {
  const body =
    input.expectedRevision === undefined
      ? undefined
      : v.safeParse(expectedRevisionSchema, input.expectedRevision);
  if (body !== undefined && !body.success) {
    throw new TypeError("expectedRevision must be a non-negative integer.");
  }
  if (input.ifMatch?.startsWith("W/"))
    throw new TypeError("If-Match requires a strong revision ETag.");
  const header = input.ifMatch === undefined ? undefined : versionFromEntityTag(input.ifMatch);
  if (body === undefined && header === undefined) {
    throw new TypeError("An expected revision is required.");
  }
  if (body !== undefined && header !== undefined && body.output !== header) {
    throw new TypeError("expectedRevision and If-Match must agree.");
  }
  return body?.output ?? header!;
}

const domainErrorStatus: Readonly<Record<DomainErrorCode, 403 | 409 | 422>> = {
  AUTHORIZATION_DENIED: 403,
  BUILD_EXPORT_VERSION_CHANGED: 409,
  CONTENT_INVALID_STATE: 422,
  CONTENT_MODEL_CARDINALITY_CONFLICT: 409,
  CONTENT_NOT_PUBLISHED: 409,
  CONTENT_PAGE_SINGLETON: 409,
  CONTENT_PUBLISHED_IMMUTABLE: 409,
  CONTENT_REVISION_CONFLICT: 409,
  CONTENT_ROUTE_CONFLICT: 409,
  LAST_ADMIN_PROTECTED: 409,
  MEDIA_IN_USE: 409,
  MEDIA_UPDATE_CONFLICT: 409,
};

const domainErrorMessage: Readonly<Record<DomainErrorCode, string>> = {
  AUTHORIZATION_DENIED: "The actor is not permitted to perform this operation.",
  BUILD_EXPORT_VERSION_CHANGED:
    "Published content changed during the build export. Restart from the first page.",
  CONTENT_INVALID_STATE: "The requested content operation is invalid.",
  CONTENT_MODEL_CARDINALITY_CONFLICT: "The content model cannot accept another entry.",
  CONTENT_NOT_PUBLISHED: "The entry is not published.",
  CONTENT_PAGE_SINGLETON: "Page and global entries are defined by configuration.",
  CONTENT_PUBLISHED_IMMUTABLE: "Published content cannot be modified.",
  CONTENT_REVISION_CONFLICT: "The draft was modified by another request.",
  CONTENT_ROUTE_CONFLICT: "The public route is already in use.",
  LAST_ADMIN_PROTECTED: "The final active administrator cannot be disabled or demoted.",
  MEDIA_IN_USE: "The media is still used by content.",
  MEDIA_UPDATE_CONFLICT: "The media was modified by another request.",
};

export interface ClassifiedError {
  readonly body: ErrorEnvelope;
  readonly status: 400 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 500;
}

export type TransportErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONFLICT"
  | "INVALID_CREDENTIALS"
  | "INVITATION_INVALID"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "RESET_INVALID";

const transportErrorStatus: Readonly<
  Record<TransportErrorCode, 400 | 403 | 404 | 409 | 410 | 413 | 429>
> = {
  AUTHORIZATION_DENIED: 403,
  CONFLICT: 409,
  INVALID_CREDENTIALS: 400,
  INVITATION_INVALID: 410,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  RESET_INVALID: 410,
};

const transportErrorMessage: Readonly<Record<TransportErrorCode, string>> = {
  AUTHORIZATION_DENIED: "The actor is not permitted to perform this operation.",
  CONFLICT: "The request conflicts with the current state.",
  INVALID_CREDENTIALS: "The current password is incorrect.",
  INVITATION_INVALID: "The invitation is invalid or has expired.",
  NOT_FOUND: "The requested resource was not found.",
  PAYLOAD_TOO_LARGE: "The request body is too large.",
  RATE_LIMITED: "Too many requests were received.",
  RESET_INVALID: "The password reset link is invalid or has expired.",
};

/** Creates one of the stable sanitized envelopes for HTTP boundary failures. */
export function transportError(code: TransportErrorCode): ClassifiedError {
  return {
    body: { error: { code, message: transportErrorMessage[code] } },
    status: transportErrorStatus[code],
  };
}

/** Converts known domain failures to documented safe transport responses. */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof DomainError) {
    return {
      body: {
        error: {
          code: error.code,
          ...(error instanceof BuildExportVersionChangedError
            ? {
                details: {
                  actualVersion: error.actualVersion,
                  expectedVersion: error.expectedVersion,
                },
              }
            : {}),
          message:
            error instanceof BlockOrderError ? error.message : domainErrorMessage[error.code],
        },
      },
      status: domainErrorStatus[error.code],
    };
  }
  return {
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    status: 500,
  };
}

/** Creates a safe validation envelope from already-normalized contract issues. */
export function validationError(issues: readonly ContractValidationIssue[]): ClassifiedError {
  return {
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [...issues] },
        message: "The request did not satisfy the API contract.",
      },
    },
    status: 422,
  };
}

export { contentMetadataOpenApi } from "./field-openapi.js";
