import {
  DomainError,
  BlockOrderError,
  actorId,
  blockKey,
  contentEntryId,
  contentSnapshotId,
  mediaId,
  siteBuildId,
  unixMilliseconds,
} from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  buildExportSchema,
  adminSettingsStatusSchema,
  adminSessionSchema,
  emailTestResultSchema,
  setupStateSchema,
  blockMetadataSchema,
  classifyError,
  adminContentEntrySchema,
  contentEntryListQuerySchema,
  contentEntryListSchema,
  contentEntrySchema,
  contentEntrySummarySchema,
  contentModelListSchema,
  createContentEntryRequestSchema,
  deleteContentEntryRequestSchema,
  entityTagForVersion,
  entityTagSchema,
  fieldMetadataMapSchema,
  fromIsoTimestamp,
  idempotencyKeySchema,
  isoTimestampSchema,
  jsonPointerSchema,
  mediaDetailSchema,
  mediaListQuerySchema,
  mediaListSchema,
  mediaMetadataSchema,
  mediaUrl,
  opaqueCursorSchema,
  packageName,
  publishContentEntryResultSchema,
  publishContentEntryRequestSchema,
  resolveExpectedRevision,
  saveDraftRequestSchema,
  siteBuildSchema,
  toBuildExportDto,
  toAdminContentEntryDto,
  toContentEntryDto,
  toContentModelDto,
  toIsoTimestamp,
  toMediaDetailDto,
  toMediaMetadataDto,
  toPublishContentEntryResultDto,
  toSiteBuildDto,
  transportError,
  validationError,
  versionFromEntityTag,
} from "../dist/index.js";

test("operational status requires a bounded engine release", () => {
  const status = {
    configuredModels: 2,
    email: { provider: "none" },
    engineVersion: "0.1.0-alpha.4",
    ready: false,
  };
  expect(v.parse(adminSettingsStatusSchema, status)).toEqual(status);
  for (const engineVersion of [undefined, "", "x".repeat(121), 4])
    expect(v.safeParse(adminSettingsStatusSchema, { ...status, engineVersion }).success).toBe(
      false,
    );
});

test("operational status reports email delivery without provider settings", () => {
  const status = { configuredModels: 0, engineVersion: "0.1.0-alpha.4", ready: true };
  const parse = (email) => v.safeParse(adminSettingsStatusSchema, { ...status, email }).success;
  expect(parse({ provider: "none" })).toBe(true);
  expect(parse({ from: "Lace <cms@example.com>", provider: "smtp" })).toBe(true);
  expect(parse({ from: "cms@example.com", provider: "none" })).toBe(false);
  expect(parse({ provider: "resend" })).toBe(false);
  expect(parse({ from: "cms@example.com", host: "smtp.example.com", provider: "smtp" })).toBe(
    false,
  );
  expect(parse({ from: "cms@example.com", provider: "sendgrid" })).toBe(false);
  expect(parse(undefined)).toBe(false);
});

test("session summaries carry a closed, unique permission list", () => {
  const session = {
    permissions: ["content:read", "content:write", "media:write"],
    user: { displayName: "Ed", email: "ed@example.com", id: "user-1", role: "editor" },
  };
  expect(v.parse(adminSessionSchema, session)).toEqual(session);
  const parse = (value) => v.safeParse(adminSessionSchema, value).success;
  expect(parse({ ...session, permissions: ["content:read", "content:delete"] })).toBe(false);
  expect(parse({ ...session, permissions: ["content:read", "content:read"] })).toBe(false);
  expect(parse({ ...session, token: "secret" })).toBe(false);
  expect(parse({ ...session, user: { ...session.user, role: "owner" } })).toBe(false);
  expect(parse({ ...session, user: { ...session.user, sessionToken: "secret" } })).toBe(false);
});

test("email test results use closed outcomes", () => {
  const parse = (value) => v.safeParse(emailTestResultSchema, value).success;
  expect(parse({ status: "sent" })).toBe(true);
  for (const reason of [
    "not_configured",
    "invalid_message",
    "rejected",
    "rate_limited",
    "unavailable",
  ])
    expect(parse({ reason, status: "failed" })).toBe(true);
  expect(parse({ reason: "smtp 550 mailbox unavailable", status: "failed" })).toBe(false);
  expect(parse({ detail: "provider text", status: "sent" })).toBe(false);
});

const timestamp = unixMilliseconds(1_735_689_600_000);
const actor = { id: actorId("actor-1"), role: "admin" };
const block = {
  data: { heading: "Welcome" },
  key: blockKey("hero-1"),
  position: 1_000,
  schemaVersion: 1,
  type: "hero",
};
const draft = {
  blocks: [block],
  createdAt: timestamp,
  entryId: contentEntryId("entry-1"),
  fields: { author: "Lace" },
  id: contentSnapshotId("snapshot-draft-1"),
  revision: 4,
  slug: "welcome",
  state: "draft",
  title: "Welcome",
  updatedAt: timestamp,
  updatedBy: actor,
};
const published = {
  ...draft,
  id: contentSnapshotId("snapshot-published-1"),
  state: "published",
};
const entry = {
  draft,
  id: contentEntryId("entry-1"),
  model: { key: "posts", kind: "collection", route: "/blog/:slug" },
  published,
};

describe("shared REST contract DTOs", () => {
  test("exports its package identity", () => expect(packageName).toBe("@lacecms/contracts"));

  test("round-trips portable entries, exports, media, builds, and timestamps", () => {
    const entryDto = toContentEntryDto(entry);
    expect(v.parse(contentEntrySchema, entryDto)).toEqual(entryDto);
    expect(
      v.parse(contentEntryListSchema, {
        items: [
          {
            draftRevision: 4,
            id: "entry-1",
            listValues: { author: "Lace" },
            modelKey: "posts",
            publishedAt: toIsoTimestamp(timestamp),
            publishedSnapshotId: "snapshot-published-1",
            slug: "welcome",
            status: "published",
            title: "Welcome",
            updatedAt: toIsoTimestamp(timestamp),
            updatedBy: { displayName: "Editor", id: "actor-1" },
          },
        ],
        nextCursor: "opaque-next-page",
        totals: { all: 1, changed: 0, draft: 0, published: 1 },
      }),
    ).toMatchObject({ items: [{ id: "entry-1" }], nextCursor: "opaque-next-page" });

    const exportDto = toBuildExportDto({
      entries: [{ entry, path: "/blog/welcome" }],
      version: 7,
    });
    expect(v.parse(buildExportSchema, exportDto)).toEqual(exportDto);

    const mediaDto = toMediaMetadataDto(
      {
        createdAt: timestamp,
        createdBy: { displayName: "Ada", id: actor.id },
        filename: "cover.png",
        height: 600,
        id: mediaId("media-1"),
        mimeType: "image/png",
        size: 42,
        status: "active",
        storageKey: "private/media-1",
        updatedAt: timestamp,
        usageCount: 2,
        width: 800,
      },
      "https://lace.example/api/v1/public/media/media-1",
    );
    expect(v.parse(mediaMetadataSchema, mediaDto)).toEqual(mediaDto);
    expect(mediaDto).not.toHaveProperty("storageKey");
    expect(v.parse(mediaListSchema, { items: [mediaDto], nextCursor: "media-page" })).toEqual({
      items: [mediaDto],
      nextCursor: "media-page",
    });
    expect(mediaUrl("https://lace.example/base/", "media/a?x=y")).toBe(
      "https://lace.example/base/api/v1/public/media/media%2Fa%3Fx%3Dy",
    );

    const buildDto = toSiteBuildDto({
      id: siteBuildId("build-1"),
      publishedSnapshotId: published.id,
      requestedAt: timestamp,
      requestedBy: actor.id,
      status: "pending",
      targetVersion: 7,
    });
    expect(v.parse(siteBuildSchema, buildDto)).toEqual(buildDto);

    const publishedResult = toPublishContentEntryResultDto({
      build: { status: "queued", targetVersion: 7 },
      entry,
      publication: "published",
      updatedBy: { displayName: "Editor", id: actor.id },
    });
    const adminEntryDto = publishedResult.entry;
    expect(v.parse(publishContentEntryResultSchema, publishedResult)).toEqual(publishedResult);
    expect(
      v.parse(publishContentEntryResultSchema, {
        build: { status: "queued", targetVersion: 7 },
        entry: adminEntryDto,
        publication: "published",
      }),
    ).toMatchObject({ build: { status: "queued" } });
    expect(
      v.parse(publishContentEntryResultSchema, {
        build: { status: "not-dispatched" },
        entry: adminEntryDto,
        publication: "replayed",
      }),
    ).toMatchObject({ publication: "replayed" });

    const modelDto = toContentModelDto({
      blocks: ["hero"],
      fields: { author: { required: false, type: "text" } },
      key: "posts",
      kind: "collection",
      label: "Posts",
      route: "/blog/:slug",
      version: 1,
    });
    expect(v.parse(contentModelListSchema, { items: [modelDto] })).toEqual({ items: [modelDto] });
    expect(fromIsoTimestamp(toIsoTimestamp(timestamp))).toBe(timestamp);
  });

  test("accepts complete mutation request contracts", () => {
    const draftRequest = {
      blocks: [
        {
          data: { heading: "Welcome" },
          key: "hero-1",
          position: 1_000,
          schemaVersion: 1,
          type: "hero",
        },
      ],
      expectedRevision: 4,
      fields: { author: "Lace" },
      slug: "welcome",
      title: "Welcome",
    };
    const { expectedRevision: _expectedRevision, ...createRequest } = draftRequest;
    expect(v.parse(createContentEntryRequestSchema, createRequest)).toMatchObject({
      title: "Welcome",
    });
    expect(v.parse(saveDraftRequestSchema, draftRequest)).toEqual(draftRequest);
    expect(v.parse(publishContentEntryRequestSchema, { expectedRevision: 4 })).toEqual({
      expectedRevision: 4,
    });
    expect(v.parse(deleteContentEntryRequestSchema, { expectedRevision: 4 })).toEqual({
      expectedRevision: 4,
    });
  });

  test("validates portable allowed block metadata against each model", () => {
    const hero = {
      fields: { heading: { required: true, type: "text" } },
      label: "Hero",
      type: "hero",
      version: 1,
    };
    expect(v.parse(blockMetadataSchema, hero)).toEqual(hero);
    expect(
      v.parse(contentModelListSchema, {
        items: [
          {
            blockDefinitions: [hero],
            blocks: ["hero"],
            fields: {},
            key: "home",
            kind: "page",
            path: "/",
            version: 1,
          },
        ],
      }),
    ).toMatchObject({ items: [{ blockDefinitions: [hero] }] });
    expect(
      v.safeParse(contentModelListSchema, {
        items: [
          {
            blockDefinitions: [hero],
            blocks: ["quote"],
            fields: {},
            key: "home",
            kind: "page",
            path: "/",
            version: 1,
          },
        ],
      }).success,
    ).toBe(false);
    expect(v.safeParse(blockMetadataSchema, { ...hero, validate: () => true }).success).toBe(false);
    expect(
      v.safeParse(blockMetadataSchema, {
        ...hero,
        defaultValue: { unknown: "field" },
      }).success,
    ).toBe(false);
  });

  test("accepts only normalized portable field metadata", () => {
    expect(
      v.safeParse(fieldMetadataMapSchema, {
        active: { required: false, type: "boolean" },
        body: { label: "Body", maxLength: 500, required: false, type: "textarea" },
        date: { required: false, type: "date" },
        datetime: { required: false, type: "datetime" },
        featured: { defaultValue: false, required: false, type: "boolean" },
        kind: { options: ["article", "note"], required: true, type: "select" },
        media: { required: false, type: "media" },
        richBody: {
          defaultValue: {
            content: [{ content: [{ text: "Lace", type: "text" }], type: "paragraph" }],
            type: "doc",
          },
          required: false,
          type: "richText",
        },
        score: { max: 10, min: 0, required: false, type: "number" },
        title: { required: false, type: "text" },
        url: { required: false, type: "url" },
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(fieldMetadataMapSchema, {
        body: { required: false, surprise: true, type: "text" },
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(fieldMetadataMapSchema, {
        body: { required: false, type: "select" },
      }).success,
    ).toBe(false);
  });
});

describe("shared REST transport conventions", () => {
  test("uses canonical ISO timestamps and version-derived entity tags", () => {
    expect(toIsoTimestamp(timestamp)).toBe("2025-01-01T00:00:00.000Z");
    expect(entityTagForVersion(7)).toBe('"7"');
    expect(versionFromEntityTag('"7"')).toBe(7);
  });

  test("normalizes body and If-Match revisions only when they agree", () => {
    expect(resolveExpectedRevision({ expectedRevision: 4 })).toBe(4);
    expect(resolveExpectedRevision({ ifMatch: '"4"' })).toBe(4);
    expect(resolveExpectedRevision({ expectedRevision: 4, ifMatch: '"4"' })).toBe(4);
    expect(() => resolveExpectedRevision({ expectedRevision: 4, ifMatch: '"5"' })).toThrow(
      "must agree",
    );
    expect(() => resolveExpectedRevision({ ifMatch: "5" })).toThrow("ETag");
    expect(() => resolveExpectedRevision({})).toThrow("required");
  });

  test("maps known errors and validation issues without exposing exception text", () => {
    const conflict = classifyError(new DomainError("CONTENT_REVISION_CONFLICT", "sql: secret"));
    expect(conflict).toEqual({
      body: {
        error: {
          code: "CONTENT_REVISION_CONFLICT",
          message: "The draft was modified by another request.",
        },
      },
      status: 409,
    });
    expect(classifyError(new DomainError("LAST_ADMIN_PROTECTED", "private detail"))).toEqual({
      body: {
        error: {
          code: "LAST_ADMIN_PROTECTED",
          message: "The final active administrator cannot be disabled or demoted.",
        },
      },
      status: 409,
    });
    expect(classifyError(new DomainError("MEDIA_IN_USE", "entry post-1 uses media"))).toEqual({
      body: { error: { code: "MEDIA_IN_USE", message: "The media is still used by content." } },
      status: 409,
    });
    expect(JSON.stringify(classifyError(new Error("select * from secrets")))).not.toContain(
      "secrets",
    );
    expect(
      validationError([{ code: "invalid_type", message: "must be text", path: "/fields/title" }]),
    ).toEqual({
      body: {
        error: {
          code: "VALIDATION_FAILED",
          details: {
            issues: [{ code: "invalid_type", message: "must be text", path: "/fields/title" }],
          },
          message: "The request did not satisfy the API contract.",
        },
      },
      status: 422,
    });
  });

  test("renders stable sanitized HTTP boundary errors", () => {
    expect(transportError("NOT_FOUND")).toEqual({
      body: { error: { code: "NOT_FOUND", message: "The requested resource was not found." } },
      status: 404,
    });
    expect(transportError("RATE_LIMITED")).toEqual({
      body: { error: { code: "RATE_LIMITED", message: "Too many requests were received." } },
      status: 429,
    });
    expect(transportError("PAYLOAD_TOO_LARGE")).toEqual({
      body: { error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." } },
      status: 413,
    });
  });
});

describe("invalid shared REST payloads", () => {
  test("rejects unknown keys and invalid mutation values", () => {
    expect(
      v.safeParse(saveDraftRequestSchema, {
        blocks: [],
        fields: {},
        title: "Welcome",
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(saveDraftRequestSchema, {
        blocks: [],
        expectedRevision: -1,
        fields: {},
        title: "Welcome",
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(createContentEntryRequestSchema, { blocks: [], fields: {}, title: "" }).success,
    ).toBe(false);
  });

  test("rejects malformed timestamps, cursors, entity tags, idempotency keys, and issue paths", () => {
    expect(v.safeParse(isoTimestampSchema, "2025-01-01T00:00:00Z").success).toBe(false);
    expect(v.safeParse(opaqueCursorSchema, "").success).toBe(false);
    expect(v.safeParse(entityTagSchema, "7").success).toBe(false);
    expect(v.safeParse(idempotencyKeySchema, "bad\nkey").success).toBe(false);
    expect(v.safeParse(jsonPointerSchema, "fields.title").success).toBe(false);
  });
});

describe("admin entry list contracts", () => {
  const summary = {
    draftRevision: 2,
    id: "entry-1",
    listValues: { author: "Lace", featured: true, rank: 3 },
    modelKey: "posts",
    status: "draft",
    title: "Welcome",
    updatedAt: toIsoTimestamp(timestamp),
    updatedBy: { displayName: "Editor", id: "actor-1" },
  };
  const publishedFields = {
    publishedAt: toIsoTimestamp(timestamp),
    publishedSnapshotId: "snapshot-published-1",
  };

  test("accepts consistent summaries for every status", () => {
    expect(v.parse(contentEntrySummarySchema, summary)).toEqual(summary);
    for (const status of ["published", "changed"]) {
      expect(
        v.parse(contentEntrySummarySchema, { ...summary, ...publishedFields, status }),
      ).toMatchObject({ status });
    }
  });

  test("rejects inconsistent status, non-scalar list values, and missing totals", () => {
    for (const invalid of [
      { ...summary, publishedAt: toIsoTimestamp(timestamp) },
      { ...summary, publishedSnapshotId: "snapshot-published-1" },
      { ...summary, status: "changed", publishedAt: toIsoTimestamp(timestamp) },
      { ...summary, status: "published" },
      { ...summary, status: "archived" },
      { ...summary, listValues: { body: { type: "doc" } } },
      { ...summary, listValues: { tags: ["a"] } },
      { ...summary, listValues: { empty: null } },
      { ...summary, updatedBy: { displayName: "", id: "actor-1" } },
      { ...summary, updatedBy: { id: "actor-1" } },
    ]) {
      expect(v.safeParse(contentEntrySummarySchema, invalid).success).toBe(false);
    }
    expect(v.safeParse(contentEntryListSchema, { items: [summary] }).success).toBe(false);
    expect(
      v.safeParse(contentEntryListSchema, {
        items: [summary],
        totals: { all: -1, changed: 0, draft: 0, published: 0 },
      }).success,
    ).toBe(false);
  });

  test("validates list query parameters", () => {
    expect(
      v.parse(contentEntryListQuerySchema, {
        extra: "ignored",
        limit: "25",
        q: "  launch  ",
        sort: "-title",
        status: "changed",
      }),
    ).toEqual({ limit: "25", q: "launch", sort: "-title", status: "changed" });
    expect(v.parse(contentEntryListQuerySchema, { q: " ".repeat(300) })).toEqual({ q: "" });
    for (const invalid of [
      { status: "archived" },
      { sort: "author" },
      { q: "x".repeat(201) },
      { limit: "0" },
      { after: "" },
    ]) {
      expect(v.safeParse(contentEntryListQuerySchema, invalid).success).toBe(false);
    }
  });

  test("admin entries name the last editor while public entries stay unchanged", () => {
    const adminDto = toAdminContentEntryDto(entry, { displayName: "Editor", id: actor.id });
    expect(v.parse(adminContentEntrySchema, adminDto)).toEqual(adminDto);
    expect(adminDto.updatedBy).toEqual({ displayName: "Editor", id: "actor-1" });
    expect(v.safeParse(contentEntrySchema, adminDto).success).toBe(false);
    expect(v.safeParse(adminContentEntrySchema, toContentEntryDto(entry)).success).toBe(false);
    expect(JSON.stringify(toContentEntryDto(entry))).not.toContain("displayName");
  });

  test("content models carry valid collection list fields only", () => {
    const fields = { author: { required: false, type: "text" } };
    const collection = { blocks: [], fields, key: "posts", kind: "collection", route: "/b/:slug" };
    const dto = toContentModelDto({ ...collection, listFields: ["author"], version: 1 });
    expect(v.parse(contentModelListSchema, { items: [dto] }).items[0].listFields).toEqual([
      "author",
    ]);
    expect(toContentModelDto({ ...collection, version: 1 })).not.toHaveProperty("listFields");
    for (const invalid of [
      { ...collection, listFields: [], version: 1 },
      { ...collection, listFields: ["author", "author"], version: 1 },
      { ...collection, listFields: ["missing"], version: 1 },
      {
        blocks: [],
        fields,
        key: "home",
        kind: "page",
        listFields: ["author"],
        path: "/",
        version: 1,
      },
    ]) {
      expect(v.safeParse(contentModelListSchema, { items: [invalid] }).success).toBe(false);
    }
  });

  test("validates media list queries, uploader summaries, and bounded usage details", () => {
    expect(
      v.parse(mediaListQuerySchema, { q: "  Cover ", sort: "-size", type: "image/png", x: "1" }),
    ).toMatchObject({ q: "Cover", sort: "-size", type: "image/png" });
    for (const invalid of [
      { q: "x".repeat(201) },
      { type: "image/svg+xml" },
      { sort: "width" },
      { limit: "0" },
    ]) {
      expect(v.safeParse(mediaListQuerySchema, invalid).success).toBe(false);
    }

    const source = {
      createdAt: unixMilliseconds(Date.UTC(2026, 0, 1)),
      createdBy: { displayName: "Ada", id: "editor-1" },
      filename: "cover.png",
      height: 400,
      id: "media-1",
      mimeType: "image/png",
      size: 42,
      status: "active",
      updatedAt: unixMilliseconds(Date.UTC(2026, 0, 1)),
      usage: [
        {
          entryId: "post-1",
          locations: [
            { field: "cover", source: "field", states: ["draft", "published"] },
            {
              blockKey: "hero-1",
              blockType: "hero",
              field: "image",
              source: "block",
              states: ["published"],
            },
          ],
          modelKey: "posts",
          slug: "welcome",
          status: "changed",
          title: "Welcome",
        },
      ],
      usageCount: 1,
      width: 200,
    };
    const detail = toMediaDetailDto(source, "https://lace.example/api/v1/public/media/media-1");
    expect(v.parse(mediaDetailSchema, detail)).toEqual(detail);
    expect(detail.createdBy).toEqual({ displayName: "Ada", id: "editor-1" });
    expect(v.safeParse(mediaMetadataSchema, { ...detail, usage: undefined }).success).toBe(false);

    const { usage: _usage, ...metadata } = detail;
    expect(v.parse(mediaMetadataSchema, metadata)).toEqual(metadata);
    for (const invalid of [
      { ...metadata, createdBy: "editor-1" },
      { ...metadata, usageCount: -1 },
      { ...metadata, width: 0 },
    ]) {
      expect(v.safeParse(mediaMetadataSchema, invalid).success).toBe(false);
    }

    const [entry] = detail.usage;
    const location = entry.locations[0];
    for (const invalid of [
      { ...detail, usage: Array.from({ length: 51 }, () => entry) },
      { ...detail, usage: [{ ...entry, locations: [] }] },
      { ...detail, usage: [{ ...entry, locations: [{ ...location, states: [] }] }] },
      {
        ...detail,
        usage: [{ ...entry, locations: [{ ...location, states: ["draft", "draft"] }] }],
      },
      { ...detail, usage: [{ ...entry, locations: [{ ...location, source: "block" }] }] },
      { ...detail, usage: [{ ...entry, status: "archived" }] },
    ]) {
      expect(v.safeParse(mediaDetailSchema, invalid).success).toBe(false);
    }
  });
});

test("setup state is a strict boolean-only contract", () => {
  expect(v.parse(setupStateSchema, { setupComplete: false })).toEqual({ setupComplete: false });
  expect(v.safeParse(setupStateSchema, { setupComplete: "false" }).success).toBe(false);
  expect(v.safeParse(setupStateSchema, { setupComplete: true, userId: "private" }).success).toBe(
    false,
  );
});

test("transports only bounded block-order diagnostics and keeps other domain messages private", () => {
  const error = new BlockOrderError(1, "01ARZ3NDEKTSV4RRFFQ69G5FA1");
  expect(classifyError(error)).toEqual({
    status: 422,
    body: { error: { code: "CONTENT_INVALID_STATE", message: error.message } },
  });
  expect(
    classifyError(new DomainError("CONTENT_INVALID_STATE", "secret-content")).body.error.message,
  ).not.toContain("secret-content");
  expect(classifyError(new BlockOrderError(1, "password=secret")).body.error.message).not.toContain(
    "password",
  );
});

test.each(['"0"', 'W/"0"', '"7"', 'W/"7"', 'W/"007"', '"9007199254740991"'])(
  "accepts a safe version-derived validator %s",
  (tag) => {
    expect(v.safeParse(entityTagSchema, tag).success).toBe(true);
    expect(versionFromEntityTag(tag)).toBe(Number(tag.replace(/^W\//u, "").slice(1, -1)));
  },
);

test.each([
  "7",
  '"hash"',
  "*",
  '"1", "2"',
  'w/"1"',
  'W/ "1"',
  '"-1"',
  '"1.5"',
  '""',
  '"9007199254740992"',
  'W/"9007199254740992"',
  ' "1"',
  '"1"\n',
])("rejects unsupported validator %s", (tag) => {
  expect(v.safeParse(entityTagSchema, tag).success).toBe(false);
  expect(() => versionFromEntityTag(tag)).toThrow(TypeError);
});

test("rejects unsafe generated versions and weak mutation preconditions", () => {
  for (const version of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => entityTagForVersion(version)).toThrow(TypeError);
  expect(() => resolveExpectedRevision({ ifMatch: 'W/"4"' })).toThrow("strong");
  expect(() => resolveExpectedRevision({ expectedRevision: 4, ifMatch: 'W/"4"' })).toThrow(
    "strong",
  );
});

test("admin build diagnostics validate closed reasons and coherent safe paths", async () => {
  const { siteBuildRecordSchema } = await import("../dist/index.js");
  const base = {
    id: "build",
    reason: "manual",
    status: "failed",
    targetVersion: 1,
    requestedBy: "admin",
    requestedAt: "2026-10-05T00:00:00.000Z",
  };
  expect(v.safeParse(siteBuildRecordSchema, { ...base, error: "install_failed" }).success).toBe(
    true,
  );
  expect(
    v.safeParse(siteBuildRecordSchema, {
      ...base,
      error: "source_symlink",
      errorPath: "src/linked.astro",
    }).success,
  ).toBe(true);
  for (const item of [
    { error: "unknown" },
    { errorPath: "src/a" },
    { error: "install_failed", errorPath: "src/a" },
    { error: "source_missing", errorPath: "/host/root" },
    { error: "source_missing", errorPath: ".env" },
  ])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, ...item }).success).toBe(false);
});

test("admin build DTOs accept exactly the seven lifecycle statuses", async () => {
  const { siteBuildRecordSchema, siteBuildStatusSchema, toSiteBuildRecordDto } =
    await import("../dist/index.js");
  const base = {
    id: "build",
    reason: "publication",
    targetVersion: 4,
    requestedBy: "admin",
    requestedAt: "2026-10-05T00:00:00.000Z",
  };
  expect(siteBuildStatusSchema.options).toEqual([
    "pending",
    "running",
    "accepted",
    "succeeded",
    "failed",
    "cancelled",
    "unknown",
  ]);
  for (const status of siteBuildStatusSchema.options)
    expect(v.safeParse(siteBuildRecordSchema, { ...base, status }).success).toBe(true);
  for (const status of ["deployed", "Accepted", ""])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, status }).success).toBe(false);
  expect(
    toSiteBuildRecordDto({
      id: "build",
      reason: "publication",
      status: "accepted",
      targetVersion: 4,
      requestedBy: "admin",
      requestedAt: 1,
      startedAt: 2,
      completedAt: 3,
      providerBuildId: "dep-1",
    }),
  ).toMatchObject({
    status: "accepted",
    providerBuildId: "dep-1",
    completedAt: expect.any(String),
  });
});

test("admin build DTOs carry tracking stage, last check and tracking reasons", async () => {
  const { siteBuildRecordSchema, toSiteBuildRecordDto } = await import("../dist/index.js");
  const base = {
    id: "build",
    reason: "publication",
    status: "running",
    targetVersion: 4,
    requestedBy: "admin",
    requestedAt: "2026-10-05T00:00:00.000Z",
  };
  const tracked = toSiteBuildRecordDto({
    ...base,
    requestedAt: 1,
    providerBuildId: "dep-1",
    providerStage: "build",
    providerCheckedAt: 5,
  });
  expect(tracked).toMatchObject({
    providerStage: "build",
    providerCheckedAt: "1970-01-01T00:00:00.005Z",
  });
  expect(v.safeParse(siteBuildRecordSchema, tracked).success).toBe(true);
  for (const stage of ["queued", "initialize", "clone_repo", "build", "deploy"])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, providerStage: stage }).success).toBe(
      true,
    );
  for (const stage of ["upload", "Deploy", ""])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, providerStage: stage }).success).toBe(
      false,
    );
  expect(
    v.safeParse(siteBuildRecordSchema, { ...base, providerCheckedAt: "yesterday" }).success,
  ).toBe(false);
  for (const error of [
    "provider_build_failed",
    "provider_deploy_failed",
    "provider_cancelled",
    "provider_skipped",
    "tracking_forbidden",
    "tracking_not_found",
    "tracking_rejected",
    "tracking_timeout",
    "tracking_unconfigured",
  ]) {
    expect(v.safeParse(siteBuildRecordSchema, { ...base, status: "unknown", error }).success).toBe(
      true,
    );
    expect(
      v.safeParse(siteBuildRecordSchema, { ...base, error, errorPath: "src/page.astro" }).success,
    ).toBe(false);
  }
});
