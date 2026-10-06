import { expect, test } from "vitest";
import {
  actorDisplayName,
  foldAscii,
  dispatcherEventId,
  dispatcherLeaseId,
  dispatcherRetryDelay,
  DISPATCHER_LEASE_DURATION_MS,
  SITE_BUILD_DEBOUNCE_MS,
  siteBuildRetryPolicy,
  SiteBuildDispatcher,
  SiteBuildTracker,
  SiteBuildUseCases,
  checkConfigurationSynchronization,
  contentSyncActor,
  createConfigurationSyncPageEntry,
  applyPreparedConfigurationSynchronization,
  opaqueCursor,
  opaqueTokenSecret,
  opaqueTokenVerifier,
  packageName,
  planConfigurationSynchronization,
  publicationIdempotencyKey,
  publicationRequestFingerprint,
  renderConfigurationSyncPlanJson,
  renderConfigurationSyncPlanText,
  reportConfigurationSynchronization,
  prepareConfigurationSynchronization,
  MediaUseCases,
} from "../dist/index.js";
import { DomainError } from "@lacecms/domain";
import { unixMilliseconds } from "@lacecms/domain";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";
test("exports its package identity", () => expect(packageName).toBe("@lacecms/application"));

test("site-build timing follows the fixed architecture defaults", () => {
  expect(SITE_BUILD_DEBOUNCE_MS).toBe(5_000);
  expect(DISPATCHER_LEASE_DURATION_MS).toBe(60_000);
  expect(siteBuildRetryPolicy).toEqual({ baseDelayMs: 5_000, maxAttempts: 8, maxDelayMs: 900_000 });
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 1, 0)).toBe(0);
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 1, 0.999)).toBeLessThanOrEqual(5_000);
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 8, 0.999)).toBeLessThanOrEqual(640_000);
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 99, 0.999)).toBeLessThanOrEqual(900_000);
});

test("only administrators can enqueue manual or retry build commands", async () => {
  const calls = [];
  const useCases = new SiteBuildUseCases({
    clock: { now: () => unixMilliseconds(42) },
    builds: {
      requestBuild: async (input) => {
        calls.push(input);
        return { coalesced: false, eventId: dispatcherEventId("event-1"), targetVersion: 3 };
      },
    },
  });
  const admin = { id: "admin-1", role: "admin" };
  await expect(useCases.request(admin)).resolves.toMatchObject({ targetVersion: 3 });
  await expect(useCases.retry(admin, "failed-1")).resolves.toMatchObject({ targetVersion: 3 });
  expect(calls).toMatchObject([{ requestedAt: 42 }, { retryOfBuildId: "failed-1" }]);
  for (const role of ["editor", "viewer"]) {
    expect(() => useCases.request({ id: role, role })).toThrow(DomainError);
    expect(() => useCases.retry({ id: role, role }, "failed-1")).toThrow(DomainError);
  }
  expect(calls).toHaveLength(2);
});

test("brands portable opaque values without exposing runtime dependencies", () => {
  expect(opaqueCursor("next-page")).toBe("next-page");
  expect(opaqueTokenSecret("secret")).toBe("secret");
  expect(opaqueTokenVerifier("verifier")).toBe("verifier");
  expect(dispatcherEventId("event-1")).toBe("event-1");
  expect(dispatcherLeaseId("lease-1")).toBe("lease-1");
  expect(publicationIdempotencyKey("publish-1")).toBe("publish-1");
  expect(publicationRequestFingerprint("sha256:abc")).toBe("sha256:abc");
  expect(() => opaqueCursor("")).toThrow(TypeError);
});

function model(overrides = {}) {
  return {
    key: "posts",
    kind: "collection",
    projectionHash: "projection-a",
    structureHash: "structure-a",
    version: 1,
    ...overrides,
  };
}

function stored(overrides = {}) {
  return {
    draftSnapshotCount: 0,
    entryCount: 0,
    key: "posts",
    kind: "collection",
    projectionHash: "projection-a",
    publishedSnapshotCount: 0,
    structureHash: "structure-a",
    version: 1,
    ...overrides,
  };
}

test("plans creates, no-ops, display changes, and compatible version updates", () => {
  const created = planConfigurationSynchronization({ models: [model()], storedModels: [] });
  expect(created).toMatchObject({
    diagnostics: [],
    isValid: true,
    operations: [{ action: "create", model: { key: "posts" } }],
    requiresApply: true,
  });

  const unchanged = planConfigurationSynchronization({
    models: [model()],
    storedModels: [stored()],
  });
  expect(unchanged).toMatchObject({ diagnostics: [], isValid: true, operations: [] });
  expect(checkConfigurationSynchronization(unchanged).exitCode).toBe(0);

  const display = planConfigurationSynchronization({
    models: [model({ projectionHash: "projection-b" })],
    storedModels: [stored()],
  });
  expect(display.operations).toMatchObject([{ action: "label-update", model: { key: "posts" } }]);

  const version = planConfigurationSynchronization({
    models: [model({ structureHash: "structure-b", version: 2 })],
    storedModels: [stored()],
  });
  expect(version.operations).toMatchObject([{ action: "version-update", model: { version: 2 } }]);
});

test("rejects kind changes, version regressions, and unversioned structure changes", () => {
  for (const candidate of [
    model({ kind: "page" }),
    model({ version: 0 }),
    model({ structureHash: "structure-b" }),
  ]) {
    const plan = planConfigurationSynchronization({
      models: [candidate],
      storedModels: [stored()],
    });
    expect(plan.isValid).toBe(false);
    expect(plan.requiresApply).toBe(false);
    expect(plan.operations).toMatchObject([
      { action: "incompatible-change", model: { key: "posts" } },
    ]);
  }
});

test("requires explicit safe renames and protects stored entries and snapshots", () => {
  const renamed = planConfigurationSynchronization({
    models: [model({ key: "articles", renamedFrom: "posts" })],
    storedModels: [stored({ entryCount: 1 })],
  });
  expect(renamed).toMatchObject({
    diagnostics: [],
    isValid: true,
    operations: [{ action: "rename", model: { key: "articles" }, renamedFrom: "posts" }],
  });

  const replacement = planConfigurationSynchronization({
    models: [model({ key: "articles" })],
    storedModels: [stored({ entryCount: 1 })],
  });
  expect(replacement).toMatchObject({
    isValid: false,
    operations: [
      { action: "create", model: { key: "articles" } },
      { action: "blocked-removal", model: { key: "posts" } },
    ],
  });

  const emptyRemoval = planConfigurationSynchronization({ models: [], storedModels: [stored()] });
  expect(emptyRemoval).toMatchObject({
    diagnostics: [],
    isValid: true,
    operations: [{ action: "remove", model: { key: "posts" } }],
  });

  const snapshotChange = planConfigurationSynchronization({
    models: [model({ structureHash: "structure-b", version: 2 })],
    storedModels: [stored({ draftSnapshotCount: 1, publishedSnapshotCount: 2 })],
  });
  expect(snapshotChange).toMatchObject({
    isValid: false,
    operations: [{ action: "incompatible-change", model: { key: "posts" } }],
  });
  expect(snapshotChange.diagnostics[0].message).toContain("draft=1, published=2");
});

test("rejects duplicate and ambiguous synchronization identity evidence", () => {
  const duplicateStored = planConfigurationSynchronization({
    models: [],
    storedModels: [stored(), stored({ projectionHash: "projection-b" })],
  });
  expect(duplicateStored).toMatchObject({
    isValid: false,
    diagnostics: [{ code: "DUPLICATE_STORED_MODEL", modelKey: "posts" }],
  });

  const missingRename = planConfigurationSynchronization({
    models: [model({ key: "articles", renamedFrom: "missing" })],
    storedModels: [],
  });
  expect(missingRename).toMatchObject({
    isValid: false,
    diagnostics: [{ code: "RENAME_SOURCE_MISSING", relatedModelKey: "missing" }],
  });

  const configuredRenameSource = planConfigurationSynchronization({
    models: [model(), model({ key: "articles", renamedFrom: "posts" })],
    storedModels: [stored()],
  });
  expect(configuredRenameSource).toMatchObject({
    isValid: false,
    diagnostics: [{ code: "RENAME_SOURCE_STILL_CONFIGURED", modelKey: "articles" }],
  });
});

test("renders canonical deterministic reports and check outcomes", () => {
  const input = {
    models: [model({ key: "zebra" }), model({ key: "articles" })],
    storedModels: [stored({ key: "zebra" }), stored({ key: "articles" })],
  };
  const first = planConfigurationSynchronization(input);
  const second = planConfigurationSynchronization({
    models: [...input.models].reverse(),
    storedModels: [...input.storedModels].reverse(),
  });
  expect(renderConfigurationSyncPlanJson(first)).toBe(renderConfigurationSyncPlanJson(second));
  expect(renderConfigurationSyncPlanText(first)).toContain("Apply required: no");
  expect(reportConfigurationSynchronization(first).check.exitCode).toBe(0);

  const pending = planConfigurationSynchronization({ models: [model()], storedModels: [] });
  expect(checkConfigurationSynchronization(pending).exitCode).toBe(1);
});

test("prepares a detached dry run and materializes page defaults only for apply", async () => {
  const page = {
    ...definePage({
      fields: {
        greeting: field.text({ defaultValue: "Hello" }),
        required: field.text({ required: true }),
      },
      key: "home",
      path: "/",
      version: 1,
    }),
    projectionHash: "projection-home",
    structureHash: "structure-home",
  };
  const state = {
    async readConfigurationSyncState() {
      return [];
    },
  };
  const prepared = await prepareConfigurationSynchronization({ models: [page], state });
  expect(prepared.report.check.exitCode).toBe(1);
  expect(prepared.storedModels).toEqual([]);
  const pageEntry = createConfigurationSyncPageEntry({
    appliedAt: 1,
    entryId: "entry-home",
    model: page,
    snapshotId: "snapshot-home",
  });
  expect(pageEntry.entry.draft).toMatchObject({
    blocks: [],
    fields: { greeting: "Hello" },
    title: "home",
    updatedBy: contentSyncActor,
  });

  let received;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => 1 },
    ids: {
      next: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    },
    models: [page],
    prepared,
    target: {
      async applyConfigurationSynchronization(input) {
        received = input;
        return { operations: input.plan.operations, status: "applied", targetVersion: 1 };
      },
    },
  });
  expect(received.pageEntries[0].entry.draft.fields).toEqual({ greeting: "Hello" });
});

test("resolves portable actor display names and ASCII-only search folding", () => {
  expect(actorDisplayName("user-1", "  Ada  ")).toBe("Ada");
  expect(actorDisplayName("user-1", "   ")).toBe("Unknown user");
  expect(actorDisplayName("user-1", null)).toBe("Unknown user");
  expect(actorDisplayName("system:content-sync")).toBe("System");
  expect(foldAscii("Launch ÄÖ Q")).toBe("launch ÄÖ q");
});

test("plans a list-field change as a projection-only label update", async () => {
  const collection = (listFields) =>
    defineCollection({
      fields: { author: field.text() },
      key: "posts",
      ...(listFields === undefined ? {} : { listFields }),
      route: "/blog/:slug",
      version: 1,
    });
  const [before, after] = await Promise.all([
    defineConfig({ content: [collection()] }),
    defineConfig({ content: [collection(["author"])] }),
  ]);
  const storedModel = before.content[0];
  const plan = planConfigurationSynchronization({
    models: after.content,
    storedModels: [
      {
        draftSnapshotCount: 3,
        entryCount: 3,
        key: storedModel.key,
        kind: storedModel.kind,
        projectionHash: storedModel.projectionHash,
        publishedSnapshotCount: 2,
        structureHash: storedModel.structureHash,
        version: storedModel.version,
      },
    ],
  });
  expect(plan.isValid).toBe(true);
  expect(plan.operations).toMatchObject([{ action: "label-update", model: { key: "posts" } }]);
});

const mediaEditor = { id: "editor-1", role: "editor" };
const mediaViewer = { id: "viewer-1", role: "viewer" };
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function mediaRecord(overrides = {}) {
  return {
    createdAt: 1,
    createdBy: "editor-1",
    filename: "cover.png",
    height: 2,
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    storageKey: "media/media-1",
    updatedAt: 1,
    width: 3,
    ...overrides,
  };
}

function catalogItem(overrides = {}) {
  return {
    createdBy: { displayName: "Ada", id: "editor-1" },
    media: mediaRecord(overrides),
    usageCount: 0,
  };
}

function mediaUseCases(media, overrides = {}) {
  return new MediaUseCases({
    clock: { now: () => 5 },
    idGenerator: { next: () => "media-1" },
    imageInspector: { inspect: async () => ({ height: 2, width: 3 }) },
    logger: { error() {} },
    media,
    storage: {
      async delete() {},
      async get() {
        return null;
      },
      async put(input) {
        return { contentType: input.contentType, key: input.key, size: pngBytes.byteLength };
      },
    },
    ...overrides,
  });
}

function bytes(value) {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

test("validates and defaults media list queries before reading", async () => {
  const reads = [];
  const media = mediaUseCases({
    async listMedia(input) {
      reads.push(input);
      return { items: [catalogItem({ id: "media-2" })] };
    },
  });
  await expect(media.list({ actor: mediaViewer, limit: 10 })).resolves.toEqual({
    items: [
      expect.objectContaining({
        createdBy: { displayName: "Ada", id: "editor-1" },
        id: "media-2",
        usageCount: 0,
      }),
    ],
  });
  expect(reads).toEqual([{ limit: 10, sort: "-createdAt" }]);
  expect(reads[0]).not.toHaveProperty("q");

  await media.list({
    actor: mediaViewer,
    limit: 5,
    q: "  Cover  ",
    sort: "size",
    type: "image/png",
  });
  expect(reads[1]).toEqual({ limit: 5, q: "Cover", sort: "size", type: "image/png" });
  await media.list({ actor: mediaViewer, limit: 5, q: "   " });
  expect(reads[2]).toEqual({ limit: 5, sort: "-createdAt" });

  for (const query of [{ q: "x".repeat(201) }, { type: "image/svg+xml" }, { sort: "width" }]) {
    await expect(media.list({ actor: mediaViewer, limit: 5, ...query })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  }
  expect(reads).toHaveLength(3);
});

test("returns media details with bounded usage and uploader names", async () => {
  const usage = Array.from({ length: 51 }, (_, index) => ({
    entryId: `post-${index}`,
    locations: [{ field: "cover", source: "field", states: ["draft", "published"] }],
    modelKey: "posts",
    status: "published",
    title: `Post ${index}`,
  }));
  const requests = [];
  const media = mediaUseCases({
    async loadMediaCatalogItem(id) {
      return id === "media-1" ? { ...catalogItem(), usageCount: 51 } : null;
    },
    async loadMediaUsage(input) {
      requests.push(input);
      return usage;
    },
  });
  const detail = await media.get({ actor: mediaViewer, mediaId: "media-1" });
  expect(detail).toMatchObject({
    createdBy: { displayName: "Ada", id: "editor-1" },
    id: "media-1",
    usageCount: 51,
  });
  expect(detail).not.toHaveProperty("storageKey");
  expect(detail.usage).toHaveLength(50);
  expect(detail.usage[0]).toEqual(usage[0]);
  expect(requests).toEqual([{ limit: 50, mediaId: "media-1" }]);
  await expect(media.get({ actor: mediaViewer, mediaId: "missing" })).resolves.toBeNull();
});

test("reloads catalog views after create and deletion commands", async () => {
  const cleanup = [];
  const loads = [];
  let reload = catalogItem();
  const port = {
    async createMedia(input) {
      return mediaRecord({ id: input.id });
    },
    async loadMediaCatalogItem(id) {
      loads.push(id);
      return reload;
    },
    async markForDeletion() {
      return { media: mediaRecord({ status: "deleting" }), status: "deleting" };
    },
    async retryDeletion() {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    },
  };
  const media = mediaUseCases(port, {
    storage: {
      async delete(key) {
        cleanup.push(key);
      },
      async put(input) {
        return { contentType: input.contentType, key: input.key, size: pngBytes.byteLength };
      },
    },
  });
  await expect(
    media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "cover.png" }),
  ).resolves.toMatchObject({ createdBy: { displayName: "Ada" }, usageCount: 0 });
  reload = { ...catalogItem({ status: "deleting" }), usageCount: 0 };
  await expect(
    media.requestDeletion({ actor: mediaEditor, mediaId: "media-1" }),
  ).resolves.toMatchObject({ status: "deleting", usageCount: 0 });
  await expect(
    media.retryDeletion({ actor: mediaEditor, mediaId: "media-1" }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  expect(loads).toEqual(["media-1", "media-1"]);

  reload = null;
  await expect(
    media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "cover.png" }),
  ).rejects.toThrow("Created media could not be reloaded.");
  expect(cleanup).toEqual([]);
});

test("site-build dispatcher maps every trigger result to one truthful lifecycle write", async () => {
  const lease = (id) =>
    Object.freeze({
      buildId: id,
      event: { attempts: 0, availableAt: 0, id, payload: {}, type: "site.build.requested" },
      expiresAt: 60_000,
      id: dispatcherLeaseId(`lease-${id}`),
      targetVersion: 3,
    });
  const results = {
    accepted: { status: "accepted" },
    acceptedWithId: { status: "accepted", providerBuildId: "dep-1" },
    failed: { status: "failed", reason: "source_missing", path: "pnpm-lock.yaml" },
    succeeded: { status: "succeeded" },
    tracking: { status: "tracking", providerBuildId: "dep-2" },
  };
  const writes = [];
  const work = {
    claimSiteBuilds: async () => Object.keys(results).map(lease),
    renewSiteBuildLease: async () => true,
    recordSiteBuildAccepted: async (input) => writes.push(["accepted", input]),
    recordSiteBuildTracking: async (input) => writes.push(["tracking", input]),
    recordSiteBuildSuccess: async (input) => writes.push(["succeeded", input]),
    recordSiteBuildFailure: async (input) => writes.push(["failed", input]),
    completeTrackedSiteBuild: async () => {
      throw new Error("dispatch never completes tracked builds");
    },
  };
  const dispatcher = new SiteBuildDispatcher({
    clock: { now: () => 7 },
    logger: { error: () => undefined },
    random: () => 0,
    trigger: { trigger: async ({ buildId }) => results[buildId] },
    work,
  });
  await dispatcher.runOnce();
  expect(writes).toEqual([
    ["accepted", { leaseId: "lease-accepted", now: 7 }],
    ["accepted", { leaseId: "lease-acceptedWithId", now: 7, providerBuildId: "dep-1" }],
    [
      "failed",
      {
        leaseId: "lease-failed",
        now: 7,
        path: "pnpm-lock.yaml",
        reason: "source_missing",
        retryAt: 7,
        terminal: false,
      },
    ],
    ["succeeded", { leaseId: "lease-succeeded", now: 7 }],
    ["tracking", { leaseId: "lease-tracking", now: 7, providerBuildId: "dep-2" }],
  ]);
});

function trackingFixture({ checks, observations, reader = "fake", timeoutMs, nowAt = 0 }) {
  const writes = [];
  const logs = [];
  let now = nowAt;
  const work = {
    claimTrackedSiteBuildChecks: async (input) => {
      writes.push(["claim", input]);
      return checks;
    },
    recordTrackedSiteBuildCheck: async (input) => {
      writes.push(["check", input]);
      return true;
    },
    completeTrackedSiteBuild: async (input) => {
      writes.push(["complete", input]);
      if (input.buildId === "conflict")
        throw new DomainError("CONTENT_INVALID_STATE", "Build already has a different outcome.");
    },
  };
  const tracker = new SiteBuildTracker({
    clock: { now: () => unixMilliseconds(now) },
    logger: { error: (entry) => logs.push(entry) },
    ...(reader === null
      ? {}
      : {
          reader: {
            read: async (id) => {
              const value = observations[id];
              if (value instanceof Error) throw value;
              return value;
            },
          },
        }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    work,
  });
  return {
    logs,
    setNow: (value) => {
      now = value;
    },
    tracker,
    writes,
  };
}

const check = (id, extra = {}) => ({
  buildId: id,
  providerBuildId: `dep-${id}`,
  trackingStartedAt: 0,
  ...extra,
});

test("site-build tracker maps observations to proven outcomes and later checks", async () => {
  const fixture = trackingFixture({
    checks: [
      check("ok"),
      check("broken"),
      check("skipped"),
      check("denied"),
      check("rejected"),
      check("building", { lastCheckedAt: 50_000 }),
      check("thrown"),
      check("conflict"),
      check("young-missing"),
    ],
    nowAt: 100_000,
    observations: {
      "dep-ok": { kind: "outcome", outcome: "succeeded", stage: "deploy" },
      "dep-broken": {
        kind: "outcome",
        outcome: "failed",
        reason: "provider_build_failed",
        stage: "build",
      },
      "dep-skipped": {
        kind: "outcome",
        outcome: "cancelled",
        reason: "provider_skipped",
        stage: "queued",
      },
      "dep-denied": { kind: "forbidden" },
      "dep-rejected": { kind: "rejected" },
      "dep-building": { kind: "progress", stage: "build" },
      "dep-thrown": new Error("secret token"),
      "dep-conflict": { kind: "outcome", outcome: "succeeded", stage: "deploy" },
      "dep-young-missing": { kind: "not_found" },
    },
  });
  await fixture.tracker.runOnce(9);
  const [claim, ...rest] = fixture.writes;
  expect(claim).toEqual(["claim", { leaseMs: 60_000, limit: 9, now: 100_000 }]);
  const base = { now: 100_000 };
  expect(rest).toEqual([
    [
      "complete",
      { ...base, buildId: "ok", outcome: "succeeded", providerBuildId: "dep-ok", stage: "deploy" },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "broken",
        outcome: "failed",
        providerBuildId: "dep-broken",
        reason: "provider_build_failed",
        stage: "build",
      },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "skipped",
        outcome: "cancelled",
        providerBuildId: "dep-skipped",
        reason: "provider_skipped",
        stage: "queued",
      },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "denied",
        outcome: "unknown",
        providerBuildId: "dep-denied",
        reason: "tracking_forbidden",
      },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "rejected",
        outcome: "unknown",
        providerBuildId: "dep-rejected",
        reason: "tracking_rejected",
      },
    ],
    [
      "check",
      {
        ...base,
        buildId: "building",
        checkAfter: 130_000,
        providerBuildId: "dep-building",
        stage: "build",
      },
    ],
    // Transient: the gap since tracking start (100 s) becomes the next delay.
    ["check", { ...base, buildId: "thrown", checkAfter: 200_000, providerBuildId: "dep-thrown" }],
    [
      "complete",
      {
        ...base,
        buildId: "conflict",
        outcome: "succeeded",
        providerBuildId: "dep-conflict",
        stage: "deploy",
      },
    ],
    // Not found inside the 5-minute grace is retried like a transient error.
    [
      "check",
      {
        ...base,
        buildId: "young-missing",
        checkAfter: 200_000,
        providerBuildId: "dep-young-missing",
      },
    ],
  ]);
  expect(fixture.logs).toContainEqual({ buildId: "conflict", reason: "tracking_conflict" });
  expect(fixture.logs).toContainEqual({ buildId: "broken", reason: "provider_build_failed" });
  expect(JSON.stringify(fixture.logs)).not.toContain("secret");
});

test("site-build tracker enforces grace, backoff bounds and the overall deadline", async () => {
  const minute = 60_000;
  const fixture = trackingFixture({
    checks: [
      check("old-missing"),
      check("outage", { lastCheckedAt: 50 * minute }),
      check("long-outage", { trackingStartedAt: 0, lastCheckedAt: 1 * minute }),
      check("near-deadline", { trackingStartedAt: -55 * minute + 20_000 }),
    ],
    nowAt: 54 * minute,
    observations: {
      "dep-old-missing": { kind: "not_found" },
      "dep-outage": { kind: "transient" },
      "dep-long-outage": { kind: "transient" },
      "dep-near-deadline": { kind: "transient" },
    },
  });
  await fixture.tracker.runOnce();
  expect(fixture.writes.slice(1)).toEqual([
    [
      "complete",
      {
        buildId: "old-missing",
        now: 54 * minute,
        outcome: "unknown",
        providerBuildId: "dep-old-missing",
        reason: "tracking_not_found",
      },
    ],
    // Gap of 4 minutes since the last successful read; capped by the deadline at 60 minutes.
    [
      "check",
      {
        buildId: "outage",
        checkAfter: 58 * minute,
        now: 54 * minute,
        providerBuildId: "dep-outage",
      },
    ],
    // Gap of 53 minutes is bounded to the 10-minute backoff, then to the deadline.
    [
      "check",
      {
        buildId: "long-outage",
        checkAfter: 60 * minute,
        now: 54 * minute,
        providerBuildId: "dep-long-outage",
      },
    ],
    [
      "complete",
      {
        buildId: "near-deadline",
        now: 54 * minute,
        outcome: "unknown",
        providerBuildId: "dep-near-deadline",
        reason: "tracking_timeout",
      },
    ],
  ]);

  const late = trackingFixture({
    checks: [check("slow")],
    nowAt: 30 * minute,
    observations: { "dep-slow": { kind: "progress", stage: "deploy" } },
    timeoutMs: 30 * minute,
  });
  await late.tracker.runOnce();
  expect(late.writes[1]).toEqual([
    "complete",
    {
      buildId: "slow",
      now: 30 * minute,
      outcome: "unknown",
      providerBuildId: "dep-slow",
      reason: "tracking_timeout",
      stage: "deploy",
    },
  ]);

  const unconfigured = trackingFixture({
    checks: [check("orphan")],
    reader: null,
    observations: {},
  });
  await unconfigured.tracker.runOnce();
  expect(unconfigured.writes[1]).toEqual([
    "complete",
    {
      buildId: "orphan",
      now: 0,
      outcome: "unknown",
      providerBuildId: "dep-orphan",
      reason: "tracking_unconfigured",
    },
  ]);
  expect(() => trackingFixture({ checks: [], observations: {}, timeoutMs: 0 })).toThrow(
    "Tracking timeout is invalid.",
  );
});
