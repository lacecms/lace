import { field } from "@lacecms/content";
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
  publicGlobalContentSchema,
  toPublicGlobalContentDto,
  publicContentEntrySchema,
  publicContentListSchema,
  publicMediaDictionarySchema,
  toPublicContentEntryDto,
  toPublicContentListDto,
  buildSiteIdentitySchema,
  buildSiteUrlSchema,
  adminSettingsStatusSchema,
  adminSessionSchema,
  emailTestResultSchema,
  accountPasswordChangeRequestSchema,
  accountProfileUpdateRequestSchema,
  accountSessionSchema,
  adminPasswordResetResultSchema,
  errorEnvelopeSchema,
  invitationAcceptRequestSchema,
  invitationCreateRequestSchema,
  invitationIssueResultSchema,
  invitationListSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  sessionRevocationResultSchema,
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
  duplicateContentEntryRequestSchema,
  revertContentEntryRequestSchema,
  toUnpublishContentEntryResultDto,
  unpublishContentEntryRequestSchema,
  unpublishContentEntryResultSchema,
  entityTagForVersion,
  entityTagSchema,
  fieldMetadataMapSchema,
  fieldMetadataSchema,
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
  seoInputSchema,
  toSeoDto,
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
  formatSeoTitle,
  isCanonicalUrl as contractsIsCanonicalUrl,
  normalizeSeoText as contractsNormalizeSeoText,
  seoText,
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

describe("account lifecycle contracts", () => {
  const token = "A".repeat(43);
  const invitation = {
    createdAt: "2026-10-10T12:00:00.000Z",
    email: "new@example.com",
    expiresAt: "2026-10-13T12:00:00.000Z",
    id: "inv-1",
    invitedBy: "Ada",
    role: "editor",
    state: "pending",
  };
  const link = `https://cms.example.com/admin/accept-invite#token=${token}`;
  const ok = (schema, value) => v.safeParse(schema, value).success;

  test("issue results carry a link only when delivery was not sent", () => {
    expect(ok(invitationIssueResultSchema, { delivery: { status: "sent" }, invitation })).toBe(
      true,
    );
    expect(
      ok(invitationIssueResultSchema, { delivery: { status: "sent" }, invitation, link }),
    ).toBe(false);
    const failed = { reason: "not_configured", status: "failed" };
    expect(ok(invitationIssueResultSchema, { delivery: failed, invitation, link })).toBe(true);
    expect(ok(invitationIssueResultSchema, { delivery: failed, invitation })).toBe(false);
    expect(
      ok(invitationIssueResultSchema, {
        delivery: failed,
        invitation,
        link: "https://cms.example.com/admin/accept-invite?token=" + token,
      }),
    ).toBe(false);
    expect(ok(adminPasswordResetResultSchema, { delivery: { status: "sent" } })).toBe(true);
    expect(ok(adminPasswordResetResultSchema, { delivery: { status: "sent" }, link })).toBe(false);
    expect(ok(adminPasswordResetResultSchema, { delivery: failed, link })).toBe(true);
    expect(ok(adminPasswordResetResultSchema, { delivery: failed })).toBe(false);
  });

  test("invitation listings never carry tokens or links", () => {
    expect(ok(invitationListSchema, { items: [invitation] })).toBe(true);
    expect(ok(invitationListSchema, { items: [{ ...invitation, token }] })).toBe(false);
    expect(ok(invitationListSchema, { items: [{ ...invitation, link }] })).toBe(false);
    expect(ok(invitationListSchema, { items: [{ ...invitation, state: "accepted" }] })).toBe(false);
  });

  test("session records reject tokens and IP addresses", () => {
    const session = {
      browser: "Firefox",
      createdAt: "2026-10-10T12:00:00.000Z",
      current: true,
      id: "session-1",
      lastActiveAt: "2026-10-10T13:00:00.000Z",
      os: "Linux",
    };
    expect(ok(accountSessionSchema, session)).toBe(true);
    expect(ok(accountSessionSchema, { ...session, token })).toBe(false);
    expect(ok(accountSessionSchema, { ...session, ipAddress: "203.0.113.5" })).toBe(false);
    expect(ok(accountSessionSchema, { ...session, browser: "Netscape" })).toBe(false);
    expect(ok(sessionRevocationResultSchema, { revoked: 2 })).toBe(true);
    expect(ok(sessionRevocationResultSchema, { revoked: -1 })).toBe(false);
  });

  test("passwords, tokens and display names are bounded", () => {
    const short = "x".repeat(11);
    const result = v.safeParse(invitationAcceptRequestSchema, { password: short, token });
    expect(result.success).toBe(false);
    expect(result.issues.map((issue) => issue.path.map((item) => item.key).join("/"))).toEqual([
      "password",
    ]);
    expect(ok(passwordResetConfirmRequestSchema, { password: short, token })).toBe(false);
    expect(ok(passwordResetConfirmRequestSchema, { password: "x".repeat(12), token })).toBe(true);
    expect(ok(passwordResetConfirmRequestSchema, { password: "x".repeat(1_025), token })).toBe(
      false,
    );
    expect(
      ok(passwordResetConfirmRequestSchema, { password: "x".repeat(12), token: "short" }),
    ).toBe(false);
    expect(
      ok(invitationAcceptRequestSchema, { displayName: "Ada", password: "x".repeat(12), token }),
    ).toBe(true);
    for (const displayName of ["   ", "x".repeat(121), "Ada\u0007", "Ada\nLovelace"])
      expect(ok(accountProfileUpdateRequestSchema, { displayName })).toBe(false);
    expect(ok(accountProfileUpdateRequestSchema, { displayName: "  Ada Lovelace " })).toBe(true);
    expect(
      ok(accountPasswordChangeRequestSchema, {
        currentPassword: "old",
        newPassword: "x".repeat(11),
        signOutOtherSessions: true,
      }),
    ).toBe(false);
  });

  test("account requests reject unknown fields", () => {
    expect(ok(invitationCreateRequestSchema, { email: "a@example.com", role: "viewer" })).toBe(
      true,
    );
    expect(
      ok(invitationCreateRequestSchema, {
        email: "a@example.com",
        password: "x".repeat(12),
        role: "viewer",
      }),
    ).toBe(false);
    expect(ok(passwordResetRequestSchema, { email: "a@example.com", userId: "u" })).toBe(false);
    expect(
      ok(accountPasswordChangeRequestSchema, {
        currentPassword: "old",
        newPassword: "x".repeat(12),
        signOutOtherSessions: false,
        userId: "other",
      }),
    ).toBe(false);
  });

  test("account error codes map to their documented statuses", () => {
    for (const [code, status] of [
      ["CONFLICT", 409],
      ["INVALID_CREDENTIALS", 400],
      ["INVITATION_INVALID", 410],
      ["RESET_INVALID", 410],
    ]) {
      const error = transportError(code);
      expect(error.status).toBe(status);
      expect(ok(errorEnvelopeSchema, error.body)).toBe(true);
    }
  });
});

const timestamp = unixMilliseconds(1_735_689_600_000);
const actor = { id: actorId("actor-1"), role: "admin" };
const block = {
  data: { heading: "Welcome" },
  hidden: false,
  key: blockKey("hero-1"),
  position: 1_000,
  schemaVersion: 1,
  settings: {},
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

    const exportDto = toBuildExportDto(
      { entries: [{ entry, media: [], path: "/blog/welcome" }], version: 7 },
      (id) => mediaUrl("https://lace.example/", id),
    );
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
    const { published: _published, ...draftOnlyEntry } = entry;
    const unpublishedResult = toUnpublishContentEntryResultDto({
      build: { status: "queued", targetVersion: 8 },
      entry: draftOnlyEntry,
      unpublication: "unpublished",
      updatedBy: { displayName: "Editor", id: actor.id },
    });
    expect(unpublishedResult.entry).not.toHaveProperty("published");
    expect(v.parse(unpublishContentEntryResultSchema, unpublishedResult)).toEqual(
      unpublishedResult,
    );
    expect(
      v.parse(unpublishContentEntryResultSchema, {
        build: { status: "not-dispatched" },
        entry: unpublishedResult.entry,
        unpublication: "replayed",
      }),
    ).toMatchObject({ unpublication: "replayed" });
    expect(() =>
      v.parse(unpublishContentEntryResultSchema, {
        ...unpublishedResult,
        publication: "published",
      }),
    ).toThrow();

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
    // Omitted envelope values parse to their defaults.
    expect(v.parse(saveDraftRequestSchema, draftRequest)).toEqual({
      ...draftRequest,
      blocks: [{ ...draftRequest.blocks[0], hidden: false, settings: {} }],
    });
    expect(v.parse(publishContentEntryRequestSchema, { expectedRevision: 4 })).toEqual({
      expectedRevision: 4,
    });
    expect(v.parse(deleteContentEntryRequestSchema, { expectedRevision: 4 })).toEqual({
      expectedRevision: 4,
    });
    expect(
      v.parse(unpublishContentEntryRequestSchema, { expectedPublishedSnapshotId: "snapshot-1" }),
    ).toEqual({ expectedPublishedSnapshotId: "snapshot-1" });
    for (const invalid of [{}, { expectedPublishedSnapshotId: "" }, { expectedRevision: 4 }]) {
      expect(v.safeParse(unpublishContentEntryRequestSchema, invalid).success).toBe(false);
    }
    for (const schema of [revertContentEntryRequestSchema, duplicateContentEntryRequestSchema]) {
      expect(v.parse(schema, { expectedRevision: 4 })).toEqual({ expectedRevision: 4 });
      expect(v.parse(schema, {})).toEqual({});
      expect(v.safeParse(schema, { expectedRevision: -1 }).success).toBe(false);
      expect(v.safeParse(schema, { title: "x" }).success).toBe(false);
    }
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
    expect(classifyError(new DomainError("CONTENT_NOT_PUBLISHED", "entry post-1"))).toEqual({
      body: { error: { code: "CONTENT_NOT_PUBLISHED", message: "The entry is not published." } },
      status: 409,
    });
    expect(classifyError(new DomainError("CONTENT_PAGE_SINGLETON", "page home"))).toEqual({
      body: {
        error: {
          code: "CONTENT_PAGE_SINGLETON",
          message: "Page and global entries are defined by configuration.",
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

  test("global models, entries, public globals, and exports have explicit contracts", () => {
    const fields = { siteName: { required: true, type: "text" } };
    const global = { blocks: [], fields, key: "settings", kind: "global", version: 1 };
    const dto = toContentModelDto(global);
    expect(dto).not.toHaveProperty("path");
    expect(dto).not.toHaveProperty("route");
    expect(v.parse(contentModelListSchema, { items: [dto] })).toEqual({ items: [dto] });
    for (const invalid of [
      { ...global, path: "/settings" },
      { ...global, route: "/settings/:slug" },
      { ...global, listFields: ["siteName"] },
      { ...global, kind: "singleton" },
    ]) {
      expect(v.safeParse(contentModelListSchema, { items: [invalid] }).success).toBe(false);
    }

    const globalEntry = {
      ...entry,
      id: contentEntryId("settings"),
      model: { key: "settings", kind: "global" },
    };
    const entryDto = toContentEntryDto(globalEntry);
    expect(entryDto.model).toEqual({ key: "settings", kind: "global" });
    expect(v.parse(contentEntrySchema, entryDto)).toEqual(entryDto);
    expect(
      v.safeParse(contentEntrySchema, {
        ...entryDto,
        model: { key: "settings", kind: "global", path: "/" },
      }).success,
    ).toBe(false);

    const urlFor = (id) => mediaUrl("https://lace.example/", id);
    const publicDto = toPublicGlobalContentDto(
      { entry: globalEntry, media: [{ id: "media-1", mimeType: "image/png" }] },
      urlFor,
    );
    expect(publicDto.global).toEqual({
      blocks: published.blocks.map(({ hidden: _hidden, ...value }) => value),
      fields: published.fields,
      id: "settings",
      modelKey: "settings",
      publishedAt: toIsoTimestamp(timestamp),
    });
    expect(Object.keys(publicDto.media)).toEqual(["media-1"]);
    expect(v.parse(publicGlobalContentSchema, publicDto)).toEqual(publicDto);
    for (const extra of [{ path: "/" }, { draft: {} }, { title: "Settings" }, { slug: "x" }]) {
      expect(
        v.safeParse(publicGlobalContentSchema, {
          ...publicDto,
          global: { ...publicDto.global, ...extra },
        }).success,
      ).toBe(false);
    }

    const exportDto = toBuildExportDto(
      {
        entries: [
          { entry, media: [{ id: "media-2", mimeType: "image/png" }], path: "/blog/welcome" },
        ],
        globals: [{ entry: globalEntry, media: [{ id: "media-1", mimeType: "image/png" }] }],
        version: 3,
      },
      urlFor,
    );
    expect(exportDto.globals.map((item) => item.modelKey)).toEqual(["settings"]);
    expect(Object.keys(exportDto.media)).toEqual(["media-1", "media-2"]);
    expect(v.parse(buildExportSchema, exportDto)).toEqual(exportDto);
    const { globals: _globals, ...legacy } = exportDto;
    expect(v.parse(buildExportSchema, legacy).globals).toEqual([]);
  });

  test("block envelopes have explicit admin, request, public and metadata contracts", () => {
    const shown = {
      ...block,
      anchor: "pricing",
      className: "wide md:w-1/2",
      settings: { align: "center" },
    };
    const hiddenBlock = { ...block, hidden: true, key: blockKey("hero-2"), position: 2_000 };
    const envelopeEntry = {
      ...entry,
      draft: { ...draft, blocks: [shown, hiddenBlock] },
      published: { ...published, blocks: [hiddenBlock, shown] },
    };
    const admin = toContentEntryDto(envelopeEntry);
    expect(admin.draft.blocks).toEqual([
      {
        anchor: "pricing",
        className: "wide md:w-1/2",
        data: { heading: "Welcome" },
        hidden: false,
        key: "hero-1",
        position: 1_000,
        schemaVersion: 1,
        settings: { align: "center" },
        type: "hero",
      },
      {
        data: { heading: "Welcome" },
        hidden: true,
        key: "hero-2",
        position: 2_000,
        schemaVersion: 1,
        settings: {},
        type: "hero",
      },
    ]);
    expect(v.parse(contentEntrySchema, admin)).toEqual(admin);

    const urlFor = (id) => mediaUrl("https://lace.example/", id);
    const publicDto = toPublicContentEntryDto(
      { entry: envelopeEntry, media: [], path: "/blog/welcome" },
      urlFor,
    );
    expect(publicDto.entry.blocks).toEqual([
      {
        anchor: "pricing",
        className: "wide md:w-1/2",
        data: { heading: "Welcome" },
        key: "hero-1",
        position: 1_000,
        schemaVersion: 1,
        settings: { align: "center" },
        type: "hero",
      },
    ]);
    expect(v.parse(publicContentEntrySchema, publicDto)).toEqual(publicDto);
    const { settings: _settings, ...legacyBlock } = publicDto.entry.blocks[0];
    expect(
      v.parse(publicContentEntrySchema, {
        ...publicDto,
        entry: { ...publicDto.entry, blocks: [legacyBlock] },
      }).entry.blocks[0].settings,
    ).toEqual({});
    expect(
      v.safeParse(publicContentEntrySchema, {
        ...publicDto,
        entry: { ...publicDto.entry, blocks: [{ ...publicDto.entry.blocks[0], hidden: false }] },
      }).success,
    ).toBe(false);
    expect(
      toPublicContentListDto(
        { items: [{ entry: envelopeEntry, media: [], path: "/a" }] },
        urlFor,
      ).items[0].blocks.map((value) => value.key),
    ).toEqual(["hero-1"]);
    expect(
      toBuildExportDto(
        { entries: [{ entry: envelopeEntry, media: [], path: "/a" }], version: 1 },
        urlFor,
      ).entries[0].blocks.map((value) => value.key),
    ).toEqual(["hero-1"]);

    const request = {
      blocks: [{ data: {}, key: "hero-1", position: 1_000, schemaVersion: 1, type: "hero" }],
      fields: {},
      title: "Welcome",
    };
    const withBlock = (envelope) => ({
      ...request,
      blocks: [{ ...request.blocks[0], ...envelope }],
    });
    expect(
      v.parse(
        saveDraftRequestSchema,
        withBlock({ anchor: "faq-2", className: " a  b ", hidden: true, settings: { x: 1 } }),
      ).blocks[0],
    ).toMatchObject({ anchor: "faq-2", className: " a  b ", hidden: true, settings: { x: 1 } });
    for (const invalid of [
      { hidden: "yes" },
      { anchor: "Top" },
      { anchor: "" },
      { className: "a<b" },
      { className: "" },
      { settings: [] },
      { visible: true },
    ]) {
      expect(
        v.safeParse(saveDraftRequestSchema, withBlock(invalid)).success,
        JSON.stringify(invalid),
      ).toBe(false);
    }

    const metadata = {
      fields: {},
      settings: {
        align: {
          defaultValue: "left",
          options: ["left", "center"],
          required: false,
          type: "select",
        },
      },
      type: "panel",
      version: 1,
    };
    expect(v.parse(blockMetadataSchema, metadata)).toEqual(metadata);
    for (const settings of [
      { image: { defaultValue: "m", required: false, type: "media" } },
      { size: { required: false, type: "number" } },
      {},
    ]) {
      expect(
        v.safeParse(blockMetadataSchema, { ...metadata, settings }).success,
        JSON.stringify(settings),
      ).toBe(false);
    }
  });

  test("SEO values have explicit admin, request, public, model and export contracts", () => {
    const seo = { image: mediaId("media-1"), noindex: true, title: "Hello" };
    const seoEntry = {
      ...entry,
      draft: { ...entry.draft, seo },
      published: { ...published, seo: { canonical: "https://example.com/a" } },
    };
    const full = {
      canonical: null,
      description: null,
      image: "media-1",
      noindex: true,
      title: "Hello",
    };
    expect(toSeoDto(undefined)).toEqual({
      canonical: null,
      description: null,
      image: null,
      noindex: false,
      title: null,
    });
    const admin = toAdminContentEntryDto(
      seoEntry,
      { displayName: "Ada", id: "editor-1" },
      { seo: true },
    );
    expect(admin.draft.seo).toEqual(full);
    expect(admin.published.seo).toMatchObject({
      canonical: "https://example.com/a",
      noindex: false,
    });
    expect(v.parse(adminContentEntrySchema, admin)).toEqual(admin);
    expect(toContentEntryDto(seoEntry).draft).not.toHaveProperty("seo");
    expect(
      v.safeParse(contentEntrySchema, {
        ...toContentEntryDto(seoEntry),
        draft: { ...toContentEntryDto(seoEntry).draft, seo: { ...full, canonical: "/a" } },
      }).success,
    ).toBe(false);

    const request = { blocks: [], fields: {}, title: "Post" };
    expect(v.parse(saveDraftRequestSchema, { ...request, seo: null }).seo).toBeNull();
    expect(
      v.parse(createContentEntryRequestSchema, {
        ...request,
        seo: { canonical: "https://example.com/a?x=1", description: "", noindex: false },
      }).seo,
    ).toEqual({ canonical: "https://example.com/a?x=1", description: "", noindex: false });
    for (const invalid of [
      { canonical: "/a" },
      { canonical: "https://user:pass@example.com/" },
      { canonical: "https://example.com/#top" },
      { title: 5 },
      { title: "x".repeat(201) },
      { description: "a\nb" },
      { description: "x".repeat(501) },
      { keywords: "x" },
      { noindex: "yes" },
      { image: "" },
    ]) {
      const result = v.safeParse(saveDraftRequestSchema, { ...request, seo: invalid });
      expect(result.success, JSON.stringify(invalid)).toBe(false);
      expect(v.safeParse(seoInputSchema, invalid).success).toBe(false);
    }

    const urlFor = (id) => mediaUrl("https://lace.example/", id);
    const source = { entry: seoEntry, media: [], path: "/blog/welcome" };
    const enabled = toPublicContentEntryDto(source, urlFor, { seoModels: new Set(["posts"]) });
    expect(enabled.entry.seo).toMatchObject({ canonical: "https://example.com/a", title: null });
    expect(v.parse(publicContentEntrySchema, enabled)).toEqual(enabled);
    expect(toPublicContentEntryDto(source, urlFor).entry).not.toHaveProperty("seo");
    expect(
      toPublicContentListDto({ items: [source] }, urlFor, { seoModels: new Set(["posts"]) })
        .items[0].seo,
    ).toMatchObject({ canonical: "https://example.com/a" });

    const fields = {
      cover: { required: false, type: "media" },
      summary: { required: false, type: "textarea" },
    };
    const model = toContentModelDto({
      blocks: [],
      fields,
      key: "posts",
      kind: "collection",
      route: "/blog/:slug",
      seo: { description: "summary" },
      version: 1,
    });
    expect(model.seo).toEqual({ description: "summary", image: null });
    const defaults = toContentModelDto({
      blocks: [],
      fields: { siteName: { required: true, type: "text" } },
      key: "settings",
      kind: "global",
      seoDefaults: { siteName: "siteName" },
      version: 1,
    });
    expect(defaults.seoDefaults).toEqual({
      description: null,
      image: null,
      siteName: "siteName",
      titleTemplate: null,
    });
    expect(v.parse(contentModelListSchema, { items: [model, defaults] }).items).toHaveLength(2);
    for (const invalid of [
      { ...defaults, seo: { description: null, image: null } },
      { ...model, seoDefaults: defaults.seoDefaults },
    ]) {
      expect(v.safeParse(contentModelListSchema, { items: [invalid] }).success).toBe(false);
    }

    const exportSeo = {
      defaults: { ...defaults.seoDefaults, modelKey: "settings" },
      models: { posts: { description: "summary", image: null } },
    };
    const exportDto = toBuildExportDto(
      {
        entries: [{ entry: seoEntry, media: [], path: "/blog/welcome" }],
        globals: [
          {
            entry: {
              ...seoEntry,
              id: contentEntryId("settings"),
              model: { key: "settings", kind: "global" },
            },
            media: [],
          },
        ],
        version: 4,
      },
      urlFor,
      exportSeo,
    );
    expect(exportDto.seo).toEqual(exportSeo);
    expect(exportDto.entries[0].seo).toMatchObject({ canonical: "https://example.com/a" });
    expect(exportDto.globals[0]).not.toHaveProperty("seo");
    expect(v.parse(buildExportSchema, exportDto)).toEqual(exportDto);
    const { seo: _seo, ...legacy } = exportDto;
    expect(v.parse(buildExportSchema, legacy).seo).toEqual({ defaults: null, models: {} });
    expect(
      v.safeParse(buildExportSchema, {
        ...exportDto,
        globals: [{ ...exportDto.globals[0], seo: toSeoDto(undefined) }],
      }).success,
    ).toBe(false);
    expect(toBuildExportDto({ entries: [], version: 1 }, urlFor).seo).toEqual({
      defaults: null,
      models: {},
    });

    expect(
      v.parse(mediaDetailSchema.entries.usage, [
        {
          entryId: "e1",
          locations: [{ field: "image", source: "seo", states: ["published"] }],
          modelKey: "posts",
          status: "published",
          title: "Hello",
        },
      ]),
    ).toHaveLength(1);
    expect(
      v.safeParse(mediaDetailSchema.entries.usage, [
        {
          entryId: "e1",
          locations: [{ field: "cover", source: "seo", states: ["published"] }],
          modelKey: "posts",
          status: "published",
          title: "Hello",
        },
      ]).success,
    ).toBe(false);
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

test("build-site URLs are absolute HTTP(S) base URLs", () => {
  for (const url of ["https://example.com/", "http://127.0.0.1:4321/blog/"])
    expect(v.safeParse(buildSiteUrlSchema, url).success).toBe(true);
  for (const url of [
    "https://user:secret@example.com/",
    "https://example.com/?preview=1",
    "https://example.com/#top",
    "ftp://example.com/",
    "https://example.com/blog",
    "/blog/",
    `https://example.com/${"a".repeat(2048)}/`,
  ])
    expect(v.safeParse(buildSiteUrlSchema, url).success).toBe(false);
  expect(
    v.parse(buildSiteIdentitySchema, {
      id: "main-site",
      label: "Main site",
      url: "https://example.com/",
    }),
  ).toEqual({ id: "main-site", label: "Main site", url: "https://example.com/" });
});

describe("media metadata contracts", async () => {
  const {
    mediaEntityTag,
    resolveMediaPrecondition,
    toUpdateMediaMetadataResultDto,
    updateMediaMetadataRequestSchema,
    updateMediaMetadataResultSchema,
  } = await import("../dist/index.js");
  const source = {
    createdAt: unixMilliseconds(1_700_000_000_000),
    createdBy: { displayName: "Ada", id: "user-1" },
    filename: "bike.png",
    height: 600,
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    updatedAt: unixMilliseconds(1_791_647_444_998),
    usageCount: 0,
    width: 800,
  };
  const url = "https://cms.example/api/v1/public/media/media-1";
  const issuePaths = (input) => {
    const result = v.safeParse(updateMediaMetadataRequestSchema, input);
    return result.success
      ? []
      : result.issues.map((issue) =>
          (issue.path ?? []).map((segment) => `/${String(segment.key)}`).join(""),
        );
  };

  test("media DTOs carry set descriptive values and omit unset ones", () => {
    const bare = toMediaMetadataDto(source, url);
    expect(bare).not.toHaveProperty("alt");
    expect(bare).not.toHaveProperty("caption");
    expect(bare).not.toHaveProperty("focalPoint");
    expect(bare.updatedAt).toBe("2026-10-10T15:50:44.998Z");
    const described = toMediaMetadataDto(
      { ...source, alt: "Red bicycle", focalPoint: { x: 0.25, y: 0.75 } },
      url,
    );
    expect(described).toMatchObject({ alt: "Red bicycle", focalPoint: { x: 0.25, y: 0.75 } });
    expect(described).not.toHaveProperty("caption");
    expect(v.parse(mediaMetadataSchema, described)).toEqual(described);
    for (const invalid of [
      { ...described, alt: null },
      { ...described, alt: "" },
      { ...described, focalPoint: { x: 2, y: 0 } },
      { ...described, focalPoint: { x: 0.5 } },
    ]) {
      expect(v.safeParse(mediaMetadataSchema, invalid).success).toBe(false);
    }
  });

  test("update requests accept partial patches and clearing nulls", () => {
    for (const valid of [
      { alt: "Red bicycle", focalPoint: { x: 0.5, y: 0.3 } },
      { caption: "Line one\r\nLine two" },
      { alt: null, caption: null, focalPoint: null },
      { alt: "   " },
      { alt: "x".repeat(1000), focalPoint: { x: 0, y: 1 } },
      { caption: "😀".repeat(2000) },
      { alt: "<b>bold</b>" },
    ]) {
      expect(v.safeParse(updateMediaMetadataRequestSchema, valid).success).toBe(true);
    }
  });

  test("invalid update requests fail with JSON Pointer issues", () => {
    expect(issuePaths({ focalPoint: { x: -0.1, y: 0.5 }, title: "x" }).sort()).toEqual([
      "/focalPoint/x",
      "/title",
    ]);
    expect(issuePaths({ alt: "x".repeat(1001) })).toEqual(["/alt"]);
    expect(issuePaths({ alt: "line\nbreak" })).toEqual(["/alt"]);
    expect(issuePaths({ caption: "tab\there" })).toEqual(["/caption"]);
    expect(issuePaths({ caption: "x".repeat(2001) })).toEqual(["/caption"]);
    expect(issuePaths({ alt: "\ud800" })).toEqual(["/alt"]);
    expect(issuePaths({ alt: 3 })).toEqual(["/alt"]);
    expect(issuePaths({ focalPoint: { x: 0.5, y: Number.NaN } })).toEqual(["/focalPoint/y"]);
    expect(issuePaths({ focalPoint: { x: 0.5, y: 0.5, z: 1 } })).toEqual(["/focalPoint/z"]);
    expect(v.safeParse(updateMediaMetadataRequestSchema, {}).success).toBe(false);
  });

  test("update results reuse the build dispatch outcome", () => {
    const queued = toUpdateMediaMetadataResultDto(
      { build: { status: "queued", targetVersion: 7 }, media: { ...source, caption: "Hi" } },
      url,
    );
    expect(queued.build).toEqual({ status: "queued", targetVersion: 7 });
    expect(queued.media.caption).toBe("Hi");
    expect(v.parse(updateMediaMetadataResultSchema, queued)).toEqual(queued);
    const idle = toUpdateMediaMetadataResultDto(
      { build: { status: "not-dispatched" }, media: source },
      url,
    );
    expect(idle.build).toEqual({ status: "not-dispatched" });
  });

  test("the media precondition is exactly one strong updatedAt tag", () => {
    expect(mediaEntityTag(source.updatedAt)).toBe('"1791647444998"');
    expect(resolveMediaPrecondition('"1791647444998"')).toBe(1_791_647_444_998);
    expect(
      resolveMediaPrecondition(
        mediaEntityTag(fromIsoTimestamp(toMediaMetadataDto(source, url).updatedAt)),
      ),
    ).toBe(source.updatedAt);
    for (const invalid of [
      undefined,
      'W/"1791647444998"',
      "*",
      '"1", "2"',
      "1791647444998",
      '"abc"',
      '"99999999999999999"',
    ]) {
      expect(() => resolveMediaPrecondition(invalid)).toThrow(TypeError);
    }
  });

  test("stale media edits classify as a sanitized conflict", () => {
    expect(
      classifyError(new DomainError("MEDIA_UPDATE_CONFLICT", "media-1 changed at 17:00")),
    ).toEqual({
      body: {
        error: {
          code: "MEDIA_UPDATE_CONFLICT",
          message: "The media was modified by another request.",
        },
      },
      status: 409,
    });
  });
});

describe("public delivery DTOs", () => {
  const blocks = [
    {
      data: { text: "Second" },
      hidden: false,
      key: blockKey("b"),
      position: 1,
      schemaVersion: 1,
      settings: {},
      type: "quote",
    },
    {
      data: { media: "media-b" },
      hidden: false,
      key: blockKey("a"),
      position: 0,
      schemaVersion: 2,
      settings: {},
      type: "image",
    },
  ];
  const delivered = ({ hidden: _hidden, ...value }) => value;
  const publicEntry = {
    ...entry,
    draft: { ...draft, title: "DRAFT ONLY" },
    published: { ...published, blocks },
  };
  const described = {
    alt: "Office",
    caption: "Our office",
    focalPoint: { x: 0.25, y: 0.4 },
    height: 900,
    id: mediaId("media-b"),
    mimeType: "image/jpeg",
    width: 1600,
  };
  const bare = { id: mediaId("media-a"), mimeType: "image/png" };
  const urlFor = (id) => mediaUrl("https://lace.example/base/", id);

  test("returns the published entry with ordered blocks and resolved media", () => {
    const dto = toPublicContentEntryDto(
      { entry: publicEntry, media: [described, bare, described], path: "/blog/welcome" },
      urlFor,
    );
    expect(v.parse(publicContentEntrySchema, dto)).toEqual(dto);
    expect(dto.entry).toEqual({
      blocks: [delivered(blocks[1]), delivered(blocks[0])],
      fields: draft.fields,
      id: "entry-1",
      modelKey: "posts",
      path: "/blog/welcome",
      publishedAt: toIsoTimestamp(timestamp),
      slug: "welcome",
      title: "Welcome",
    });
    expect(JSON.stringify(dto)).not.toContain("DRAFT ONLY");
    expect(Object.keys(dto.media)).toEqual(["media-a", "media-b"]);
    expect(dto.media["media-a"]).toEqual({
      alt: null,
      caption: null,
      focalPoint: null,
      height: null,
      id: "media-a",
      mimeType: "image/png",
      url: "https://lace.example/base/api/v1/public/media/media-a",
      width: null,
    });
    expect(dto.media["media-b"]).toMatchObject({
      alt: "Office",
      caption: "Our office",
      focalPoint: { x: 0.25, y: 0.4 },
      height: 900,
      width: 1600,
    });
  });

  test("merges the media of a collection page", () => {
    const dto = toPublicContentListDto(
      {
        items: [
          { entry: publicEntry, media: [described], path: "/blog/welcome" },
          { entry: publicEntry, media: [described, bare], path: "/blog/other" },
        ],
        nextCursor: "next",
      },
      urlFor,
    );
    expect(v.parse(publicContentListSchema, dto)).toEqual(dto);
    expect(dto.items.map((item) => item.path)).toEqual(["/blog/welcome", "/blog/other"]);
    expect(Object.keys(dto.media)).toEqual(["media-a", "media-b"]);
  });

  test("rejects legacy and malformed public payloads", () => {
    const dto = toPublicContentEntryDto(
      { entry: publicEntry, media: [described], path: "/blog/welcome" },
      urlFor,
    );
    expect(() =>
      v.parse(publicContentEntrySchema, { entry: toContentEntryDto(entry), path: "/blog/welcome" }),
    ).toThrow();
    expect(() =>
      v.parse(publicContentEntrySchema, { ...dto, entry: { ...dto.entry, draft: {} } }),
    ).toThrow();
    expect(() =>
      v.parse(publicContentEntrySchema, { ...dto, entry: { ...dto.entry, model: {} } }),
    ).toThrow();
    expect(() =>
      v.parse(publicMediaDictionarySchema, { other: { ...dto.media["media-b"] } }),
    ).toThrow();
    expect(() =>
      v.parse(publicMediaDictionarySchema, {
        "media-b": { ...dto.media["media-b"], focalPoint: { x: 1.5, y: 0 } },
      }),
    ).toThrow();
    expect(() =>
      v.parse(publicMediaDictionarySchema, { "media-b": { ...dto.media["media-b"], alt: "" } }),
    ).toThrow();
  });
});

describe("shared SEO text rules", () => {
  test("seoText collapses whitespace and drops blank or non-text values", () => {
    expect(seoText("  Hello \n  world ")).toBe("Hello world");
    expect(seoText("   ")).toBeUndefined();
    expect(seoText(42)).toBeUndefined();
    expect(seoText(undefined)).toBeUndefined();
  });

  test("formatSeoTitle applies the title template rule", () => {
    expect(formatSeoTitle("Hello", { siteName: "Lace" })).toBe("Hello | Lace");
    expect(formatSeoTitle("Hello", { siteName: "Lace", titleTemplate: "%s — Notes" })).toBe(
      "Hello — Notes",
    );
    expect(formatSeoTitle("$& costs", { titleTemplate: "%s · Shop" })).toBe("$& costs · Shop");
    expect(formatSeoTitle("Hello", { siteName: "Lace", titleTemplate: "Notes" })).toBe(
      "Hello | Lace",
    );
    expect(formatSeoTitle("Hello", { siteName: "  " })).toBe("Hello");
    expect(formatSeoTitle("Hello", undefined)).toBe("Hello");
  });

  test("re-exports the domain SEO predicates", () => {
    expect(contractsIsCanonicalUrl("https://example.com/a")).toBe(true);
    expect(contractsIsCanonicalUrl("/a")).toBe(false);
    expect(contractsNormalizeSeoText("a\nb", "title")).toBeUndefined();
    expect(contractsNormalizeSeoText("  ", "title")).toBeNull();
  });
});

test("composite metadata and content round-trip with nested issue pointers", () => {
  const cards = field.list({
    item: field.group({ fields: { title: field.text({ required: true }), media: field.media() } }),
  });
  expect(v.safeParse(fieldMetadataMapSchema, { cards }).success).toBe(true);
  expect(
    v.safeParse(fieldMetadataMapSchema, {
      cards: { ...cards, item: { ...cards.item, fields: { invalid: { type: "wrong" } } } },
    }).success,
  ).toBe(false);
  let deep = field.text();
  for (let i = 0; i < 4; i++)
    deep = {
      type: "list",
      required: false,
      item: { type: "group", required: false, fields: { child: deep } },
    };
  expect(v.safeParse(fieldMetadataMapSchema, { deep }).success).toBe(false);
  const failure = validationError([
    {
      code: "invalid_field_value",
      message: "Invalid value.",
      path: "/blocks/0/data/images/2/image",
    },
  ]);
  expect(failure.status).toBe(422);
  expect(failure.body.error.details.issues[0].path).toBe("/blocks/0/data/images/2/image");
});

test("cyclic and accessor-backed forged metadata are refused without evaluation", () => {
  const cyclic = { type: "group", required: false, fields: {} };
  cyclic.fields.child = cyclic;
  expect(v.safeParse(fieldMetadataSchema, cyclic).success).toBe(false);
  expect(
    v.safeParse(blockMetadataSchema, { type: "cyclic", version: 1, fields: { child: cyclic } })
      .success,
  ).toBe(false);
  const accessor = {};
  Object.defineProperty(accessor, "child", {
    enumerable: true,
    get() {
      throw new Error("executed accessor");
    },
  });
  expect(v.safeParse(fieldMetadataMapSchema, accessor).success).toBe(false);
});
