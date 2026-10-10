import { expect, test } from "vitest";
import {
  BLOCK_POSITION_STEP,
  DomainError,
  assertEntryCreationAllowed,
  assertOrderedBlockPositions,
  assertPublicPathAvailable,
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  defaultRolePermissions,
  permissionsFor,
  normalizeBlockPositions,
  packageName,
  planBlockPosition,
  publishContentEntry,
  requireMutableDraft,
  requirePermission,
  resolveCollectionPublicPath,
  saveCompleteDraft,
  unixMilliseconds,
} from "../dist/index.js";

const admin = { id: actorId("admin-1"), role: "admin" };
const editor = { id: actorId("editor-1"), role: "editor" };
const viewer = { id: actorId("viewer-1"), role: "viewer" };
const entryId = contentEntryId("entry-1");

function expectDomainError(operation, code) {
  expect(operation).toThrow(DomainError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function block(key, position, data = { body: "Original" }) {
  return { data, key: blockKey(key), position, schemaVersion: 1, type: "richText" };
}

function draft(overrides = {}) {
  return {
    blocks: [block("block-1", 1000, { nested: { body: "Original" } })],
    createdAt: unixMilliseconds(1),
    entryId,
    fields: { nested: { value: "Original" } },
    id: contentSnapshotId("draft-1"),
    revision: 1,
    state: "draft",
    title: "Original",
    updatedAt: unixMilliseconds(1),
    updatedBy: editor,
    ...overrides,
  };
}

function entry(overrides = {}) {
  return createContentEntry({
    draft: draft(),
    id: entryId,
    model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
    ...overrides,
  });
}

test("exports its package identity", () => expect(packageName).toBe("@lacecms/domain"));

test("uses the complete default role-to-permission matrix", () => {
  expect(defaultRolePermissions.admin).toEqual([
    "content:read",
    "content:write",
    "content:publish",
    "media:write",
    "users:manage",
    "settings:manage",
  ]);
  expect(defaultRolePermissions.editor).toEqual(["content:read", "content:write", "media:write"]);
  expect(defaultRolePermissions.viewer).toEqual(["content:read"]);
  expect(Object.isFrozen(defaultRolePermissions)).toBe(true);

  expect(() => requirePermission(editor, "content:write")).not.toThrow();
  expect(() => requirePermission(viewer, "content:read")).not.toThrow();
  expectDomainError(() => requirePermission(editor, "content:publish"), "AUTHORIZATION_DENIED");
  expectDomainError(() => requirePermission(viewer, "media:write"), "AUTHORIZATION_DENIED");
  expect(() => requirePermission(admin, "settings:manage")).not.toThrow();
});

test("derives each role's permissions from the same frozen policy", () => {
  for (const role of ["admin", "editor", "viewer"]) {
    expect(permissionsFor(role)).toBe(defaultRolePermissions[role]);
    expect(Object.isFrozen(permissionsFor(role))).toBe(true);
  }
  expect(permissionsFor("editor")).toEqual(["content:read", "content:write", "media:write"]);
  expect(permissionsFor("viewer")).toEqual(["content:read"]);
});

test("enforces page cardinality and resolves public collection paths safely", () => {
  expect(() => assertEntryCreationAllowed("page", 0)).not.toThrow();
  expect(() => assertEntryCreationAllowed("collection", 99)).not.toThrow();
  expectDomainError(
    () => assertEntryCreationAllowed("page", 1),
    "CONTENT_MODEL_CARDINALITY_CONFLICT",
  );
  expect(resolveCollectionPublicPath("/blog/:slug", "release-notes")).toBe("/blog/release-notes");

  for (const slug of ["Release", "release/notes", "release--notes", "", "release?x=1", "."]) {
    expectDomainError(
      () => resolveCollectionPublicPath("/blog/:slug", slug),
      "CONTENT_INVALID_STATE",
    );
  }
});

test("allows an entry to retain its route while rejecting a different route owner", () => {
  const existingRoute = {
    entryId,
    path: "/blog/release-notes",
    snapshotId: contentSnapshotId("published-1"),
    updatedAt: unixMilliseconds(2),
  };
  expect(() =>
    assertPublicPathAvailable("/blog/release-notes", entryId, existingRoute),
  ).not.toThrow();
  expectDomainError(
    () =>
      assertPublicPathAvailable("/blog/release-notes", contentEntryId("entry-2"), existingRoute),
    "CONTENT_ROUTE_CONFLICT",
  );
});

test("plans sparse positions and preserves order when normalizing them", () => {
  expect(planBlockPosition(undefined, undefined)).toEqual({
    kind: "position",
    position: BLOCK_POSITION_STEP,
  });
  expect(planBlockPosition(1000, 2000)).toEqual({ kind: "position", position: 1500 });
  expect(planBlockPosition(1000, 1001)).toEqual({ kind: "normalize" });
  expect(planBlockPosition(undefined, 1)).toEqual({ kind: "normalize" });

  const normalized = normalizeBlockPositions([block("last", 8), block("first", 3)]);
  expect(normalized.map(({ key, position }) => [key, position])).toEqual([
    ["last", 1000],
    ["first", 2000],
  ]);
  expect(() => assertOrderedBlockPositions(normalized)).not.toThrow();
  expectDomainError(
    () => assertOrderedBlockPositions([block("one", 1000), block("two", 1000)]),
    "CONTENT_INVALID_STATE",
  );
  expectDomainError(() => assertOrderedBlockPositions([block("zero", 0)]), "CONTENT_INVALID_STATE");
});

test("keeps published data immutable and isolated from later complete draft saves", () => {
  const sourceDraft = draft();
  const initial = entry({ draft: sourceDraft });
  sourceDraft.fields.nested.value = "Caller mutation";

  const published = publishContentEntry(initial, {
    expectedRevision: 1,
    publishedAt: unixMilliseconds(2),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("published-1"),
  });
  expect(published.published.fields).toEqual({ nested: { value: "Original" } });
  expect(Object.isFrozen(published.published.fields.nested)).toBe(true);
  expectDomainError(() => requireMutableDraft(published.published), "CONTENT_PUBLISHED_IMMUTABLE");

  const saved = saveCompleteDraft(published, {
    blocks: [block("block-2", 1000, { nested: { body: "Edited" } })],
    expectedRevision: 1,
    fields: { nested: { value: "Edited" } },
    slug: "release-notes",
    title: "Edited",
    updatedAt: unixMilliseconds(3),
    updatedBy: editor,
  });
  expect(saved.draft).toMatchObject({ revision: 2, slug: "release-notes", title: "Edited" });
  expect(saved.published).toMatchObject({ revision: 1, title: "Original" });
  expect(saved.published.fields).toEqual({ nested: { value: "Original" } });
  expectDomainError(
    () => saveCompleteDraft(saved, { ...draft(), expectedRevision: 1 }),
    "CONTENT_REVISION_CONFLICT",
  );

  const republished = publishContentEntry(saved, {
    expectedRevision: 2,
    publishedAt: unixMilliseconds(4),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("published-2"),
  });
  expect(republished.published).toMatchObject({ id: "published-2", revision: 2, title: "Edited" });
  expect(republished).not.toHaveProperty("published.previousPublished");
});

test("rejects an invalid committed lifecycle", () => {
  expectDomainError(
    () => createContentEntry({ ...entry(), draft: { ...draft(), state: "published" } }),
    "CONTENT_INVALID_STATE",
  );
});

test("carries the stable media-in-use code for referenced-media refusals", () => {
  const error = new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ code: "MEDIA_IN_USE", name: "DomainError" });
});

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1000, 500])(
  "rejects invalid position %s with bounded ordering diagnostics",
  (position) => {
    const key = "01ARZ3NDEKTSV4RRFFQ69G5FA1";
    const input = [block("first", 1000), block(key, position, { body: "secret-content" })];
    expect(() => assertOrderedBlockPositions(input)).toThrow(`Block at index 1 (key ${key})`);
    expect(input.map((block) => block.position)).toEqual([1000, position]);
    for (const unsafe of ["secret\npassword", "x".repeat(200)]) {
      try {
        assertOrderedBlockPositions([block(unsafe, 0, { body: "secret-content" })]);
      } catch (error) {
        expect(error.code).toBe("CONTENT_INVALID_STATE");
        expect(error.message).toContain("Block at index 0");
        expect(error.message).toContain("Resubmit positions");
        expect(error.message).not.toContain(unsafe);
        expect(error.message).not.toContain("secret-content");
      }
    }
  },
);

test("build diagnostics preserve known reasons and reject unsafe paths", async () => {
  const { siteBuildFailureReasons, normalizeBuildFailure, safeBuildSourcePath } =
    await import("../dist/index.js");
  for (const reason of siteBuildFailureReasons)
    expect(normalizeBuildFailure(reason).reason).toBe(reason);
  expect(normalizeBuildFailure("secret /host/root", "src/file")).toEqual({
    reason: "provider_failed",
  });
  expect(normalizeBuildFailure("source_symlink", "src/file.astro")).toEqual({
    reason: "source_symlink",
    path: "src/file.astro",
  });
  expect(normalizeBuildFailure("install_failed", "src/file")).toEqual({ reason: "install_failed" });
  for (const path of [
    "",
    ".",
    "..",
    "/source/file",
    "C:/file",
    "src/../file",
    "src//file",
    "src/./file",
    "--file",
    "src/--file",
    "src\\file",
    "src/é",
    "src/line\n",
    "a".repeat(513),
    ".env",
    "cms/.env.production",
    ".git/config",
    ".aws/key",
    "cms/.lace/data/db",
    ".npmrc",
    ".ssh/key",
    ".agents/a",
    ".codex/a",
    ".claude/a",
    ".pnpmfile.cjs",
  ])
    expect(safeBuildSourcePath(path), path).toBeUndefined();
  for (const path of ["pnpm-lock.yaml", "web/src/page.astro", "src/a b.txt", "a".repeat(512)])
    expect(safeBuildSourcePath(path)).toBe(path);
});

test("site-build statuses form one closed lifecycle with explicit terminal and retry sets", async () => {
  const {
    isRetryableSiteBuildStatus,
    isSiteBuildStatus,
    isTerminalSiteBuildStatus,
    retryableSiteBuildStatuses,
    siteBuildStatuses,
    terminalSiteBuildStatuses,
    trackedSiteBuildOutcomes,
  } = await import("../dist/index.js");
  expect(siteBuildStatuses).toEqual([
    "pending",
    "running",
    "accepted",
    "succeeded",
    "failed",
    "cancelled",
    "unknown",
  ]);
  expect(siteBuildStatuses.filter(isTerminalSiteBuildStatus)).toEqual([
    ...terminalSiteBuildStatuses,
  ]);
  expect(isTerminalSiteBuildStatus("pending")).toBe(false);
  expect(isTerminalSiteBuildStatus("running")).toBe(false);
  expect(siteBuildStatuses.filter(isRetryableSiteBuildStatus).sort()).toEqual(
    [...retryableSiteBuildStatuses].sort(),
  );
  expect(isRetryableSiteBuildStatus("succeeded")).toBe(false);
  expect(trackedSiteBuildOutcomes).toEqual(["succeeded", "failed", "cancelled", "unknown"]);
  expect(isSiteBuildStatus("accepted")).toBe(true);
  expect(isSiteBuildStatus("deployed")).toBe(false);
});

test("tracked outcomes keep only their own closed reasons and stages are closed", async () => {
  const {
    isSiteBuildProviderStage,
    normalizeTrackedOutcomeReason,
    siteBuildFailureReasons,
    siteBuildProviderStages,
    sourceFailureReasons,
    trackedOutcomeReasons,
  } = await import("../dist/index.js");
  for (const reasons of Object.values(trackedOutcomeReasons))
    for (const reason of reasons) expect(siteBuildFailureReasons).toContain(reason);
  expect(sourceFailureReasons).not.toContain("provider_build_failed");
  expect(normalizeTrackedOutcomeReason("failed", "provider_deploy_failed")).toBe(
    "provider_deploy_failed",
  );
  expect(normalizeTrackedOutcomeReason("failed", "secret text")).toBe("provider_failed");
  expect(normalizeTrackedOutcomeReason("failed", undefined)).toBe("provider_failed");
  expect(normalizeTrackedOutcomeReason("cancelled", "provider_skipped")).toBe("provider_skipped");
  expect(normalizeTrackedOutcomeReason("cancelled", "tracking_timeout")).toBeUndefined();
  expect(normalizeTrackedOutcomeReason("unknown", "tracking_timeout")).toBe("tracking_timeout");
  expect(normalizeTrackedOutcomeReason("unknown", "provider_build_failed")).toBeUndefined();
  expect(normalizeTrackedOutcomeReason("succeeded", "provider_failed")).toBeUndefined();
  expect(siteBuildProviderStages).toEqual([
    "queued",
    "initialize",
    "clone_repo",
    "build",
    "deploy",
  ]);
  expect(isSiteBuildProviderStage("deploy")).toBe(true);
  expect(isSiteBuildProviderStage("upload")).toBe(false);
});
