import {
  applyPreparedConfigurationSynchronization,
  contentModelRoute,
  ContentUseCases,
  prepareConfigurationSynchronization,
  publicationIdempotencyKey,
  publicationRequestFingerprint,
} from "@lacecms/application";
import type {
  ConfigurationSyncApplyPort,
  ConfigurationSyncStateReadPort,
  ContentEntryCommandPort,
  ContentEntryReadPort,
  DispatcherLeasePort,
  MediaCatalogPort,
  MediaCommandPort,
  MediaDeletionDispatchPort,
  MediaListPort,
  ContentMediaReadPort,
  PublicContentReadPort,
  SaveCompleteDraftInput,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
  SiteBuildReadPort,
} from "@lacecms/application";
import { readAllBuildContentPages } from "./build-export.js";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import type { CollectionModelInput, NormalizedContentModel } from "@lacecms/config";
import { builtInBlocks, defineBlock, field, validateBlockData } from "@lacecms/content";
import type { BlockDefinition, BlockMigrations, JsonObject } from "@lacecms/content";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  Actor,
  ContentBlock,
  ContentEntry,
  ContentModelRoute,
  EntrySeo,
  MediaMetadata,
} from "@lacecms/domain";
import type { ExpectStatic } from "vitest";

/** Every persistence port a SQL runtime adapter must implement identically. */
export type ContractRepository = ConfigurationSyncApplyPort &
  ConfigurationSyncStateReadPort &
  ContentEntryCommandPort &
  ContentEntryReadPort &
  DispatcherLeasePort &
  MediaCatalogPort &
  MediaCommandPort &
  MediaDeletionDispatchPort &
  MediaListPort &
  ContentMediaReadPort &
  PublicContentReadPort &
  SiteBuildCommandPort &
  SiteBuildDispatchPort &
  SiteBuildReadPort;

/** Parameterized seeding and inspection over the runtime's migrated database. */
export interface ContractSql {
  all<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<readonly Row[]>;
  get<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<Row | undefined>;
  run(sql: string, ...params: unknown[]): Promise<void>;
}

export interface ContractRepositoryOptions {
  readonly beforeMutation?: (checkpoint: string) => void;
  readonly nextId?: () => string;
  readonly resolveModel: (key: string) => ContentModelRoute | undefined;
}

export interface RepositoryContractHarness {
  readonly repository: ContractRepository;
  /** Constructs an independent repository over the same database. */
  reopen(options?: Partial<ContractRepositoryOptions>): ContractRepository;
  readonly sql: ContractSql;
}

/** Opens a freshly migrated database for each call. */
export interface RepositoryContractRuntime {
  open(options: ContractRepositoryOptions): Promise<RepositoryContractHarness>;
}

export interface RepositoryContractCase {
  readonly name: string;
  run(runtime: RepositoryContractRuntime, expect: ExpectStatic): Promise<void>;
}

/** Checkpoints both adapters expose inside the atomic publication write. */
export const PUBLICATION_CHECKPOINTS = Object.freeze([
  "publish.snapshot",
  "publish.blocks",
  "publish.references",
  "publish.route",
  "public-state",
  "build-outbox",
]);

/** Checkpoints both adapters expose inside the atomic unpublication write. */
export const UNPUBLICATION_CHECKPOINTS = Object.freeze([
  "unpublish.route",
  "public-state",
  "build-outbox",
  "unpublish.snapshot",
]);

/** Checkpoints both adapters expose inside the atomic draft revert. */
export const REVERT_CHECKPOINTS = Object.freeze([
  "revert.draft",
  "revert.blocks",
  "revert.published",
]);

const editor: Actor = Object.freeze({ id: actorId("editor"), role: "editor" });
const admin: Actor = Object.freeze({ id: actorId("admin"), role: "admin" });
const routes = new Map<string, ContentModelRoute>([
  ["posts", { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" }],
  ["home", { key: contentModelKey("home"), kind: "page", path: "/" }],
  ["settings", { key: contentModelKey("settings"), kind: "global" }],
]);

type ContractModelKey = "home" | "posts" | "settings";
const CONTRACT_MODELS: Readonly<Record<ContractModelKey, readonly [string, string]>> = {
  home: ["page", "Home"],
  posts: ["collection", "Posts"],
  settings: ["global", "Site settings"],
};
const resolveRoute = (key: string): ContentModelRoute | undefined => routes.get(key);
const noModels = (): undefined => undefined;

function sequence(prefix: string): () => string {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function base64Url(value: unknown): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

declare function btoa(data: string): string;
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

async function count(sql: ContractSql, statement: string, ...params: unknown[]): Promise<number> {
  const row = await sql.get<{ count: number }>(statement, ...params);
  return row?.count ?? 0;
}

async function seedModels(sql: ContractSql, ...keys: readonly ContractModelKey[]): Promise<void> {
  for (const key of keys) {
    await sql.run(
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      key,
      CONTRACT_MODELS[key][0],
      CONTRACT_MODELS[key][1],
      1,
      "structure",
      "projection",
      1,
      1,
    );
  }
}

async function seedMedia(sql: ContractSql, id: string, status = "active"): Promise<void> {
  await sql.run(
    "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, 'image.png', 'image/png', 1, '{}', ?, 'editor', 1, 1)",
    id,
    `media/${id}`,
    status,
  );
}

async function seedUser(sql: ContractSql, id: string, name: string, email: string): Promise<void> {
  await sql.run(
    "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, 'editor', 0, 1, 1)",
    id,
    name,
    email,
  );
}

function entry(
  id: string,
  modelKey: ContractModelKey,
  input: {
    readonly blocks?: readonly ContentBlock[];
    readonly fields?: JsonObject;
    readonly slug?: string;
    readonly title?: string;
    readonly updatedAt: number;
    readonly updatedBy?: Actor;
  },
): ContentEntry {
  const entryId = contentEntryId(id);
  return createContentEntry({
    id: entryId,
    model: routes.get(modelKey)!,
    draft: {
      blocks: input.blocks ?? [],
      createdAt: unixMilliseconds(input.updatedAt),
      entryId,
      fields: input.fields ?? {},
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      state: "draft",
      title: input.title ?? id,
      updatedAt: unixMilliseconds(input.updatedAt),
      updatedBy: input.updatedBy ?? editor,
    },
  });
}

function heroBlock(key: string, image: string, title = key, type = "hero", position = 1000) {
  return Object.freeze({
    data: { image, title },
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type,
  });
}

function heroEntry(id: string, modelKey: "home" | "posts", updatedAt: number, title = id) {
  return entry(id, modelKey, {
    blocks: [heroBlock(`${id}-block`, "media-1", title)],
    fields: { image: "media-1", title },
    slug: id,
    title,
    updatedAt,
  });
}

function references(blockKeyValue: string) {
  return [
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" as const },
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey(blockKeyValue) },
  ];
}

function save(
  entryId: string,
  expectedRevision: number,
  updatedAt: number,
  overrides: Partial<SaveCompleteDraftInput["mutation"]> = {},
): SaveCompleteDraftInput {
  return {
    entryId: contentEntryId(entryId),
    mutation: {
      blocks: [],
      expectedRevision,
      fields: {},
      mediaReferences: [],
      title: `Saved ${updatedAt}`,
      updatedAt: unixMilliseconds(updatedAt),
      updatedBy: editor,
      ...overrides,
    },
  };
}

function publish(entryId: string, expectedRevision: number, at: number, snapshot?: string) {
  return {
    entryId: contentEntryId(entryId),
    expectedRevision,
    publishedAt: unixMilliseconds(at),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId(snapshot ?? `${entryId}-published-${at}`),
  };
}

type SyncModel = NormalizedContentModel;

function syncPage(overrides: Record<string, unknown> = {}): SyncModel {
  return {
    fields: {},
    key: "home",
    kind: "page",
    path: "/",
    projectionHash: "projection-home",
    structureHash: "structure-home",
    version: 1,
    ...overrides,
  } as unknown as SyncModel;
}

function syncCollection(overrides: Record<string, unknown> = {}): SyncModel {
  return {
    fields: {},
    key: "posts",
    kind: "collection",
    projectionHash: "projection-posts",
    route: "/blog/:slug",
    structureHash: "structure-posts",
    version: 1,
    ...overrides,
  } as unknown as SyncModel;
}

function syncGlobal(overrides: Record<string, unknown> = {}): SyncModel {
  return {
    fields: {},
    key: "settings",
    kind: "global",
    label: "Site settings",
    projectionHash: "projection-settings",
    structureHash: "structure-settings",
    version: 1,
    ...overrides,
  } as unknown as SyncModel;
}

function syncResolver(models: readonly SyncModel[]) {
  const values = new Map(models.map((model) => [String(model.key), model]));
  return (key: string): ContentModelRoute | undefined => {
    const model = values.get(key);
    return model === undefined ? undefined : contentModelRoute(model);
  };
}

async function applySync(
  target: ContractRepository,
  models: readonly SyncModel[],
  at: number,
  prepared?: Awaited<ReturnType<typeof prepareConfigurationSynchronization>>,
) {
  return applyPreparedConfigurationSynchronization({
    clock: { now: () => unixMilliseconds(at) },
    ids: { next: sequence(`sync-${at}`) },
    models,
    prepared: prepared ?? (await prepareConfigurationSynchronization({ models, state: target })),
    target,
  });
}

const cases: RepositoryContractCase[] = [];
function contract(name: string, run: RepositoryContractCase["run"]): void {
  cases.push(Object.freeze({ name, run }));
}

contract(
  "coalesces manual build requests until claim and queues later work separately",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("build-event"),
      resolveModel: noModels,
    });
    const first = await repository.requestBuild({
      requestedAt: unixMilliseconds(100),
      requestedBy: admin,
    });
    const second = await repository.requestBuild({
      requestedAt: unixMilliseconds(200),
      requestedBy: admin,
    });
    expect(first).toMatchObject({ coalesced: false, targetVersion: 0 });
    expect(second).toMatchObject({ coalesced: true, eventId: first.eventId });
    expect(
      await sql.get("select available_at from outbox_events where id = ?", first.eventId),
    ).toEqual({ available_at: 5_200 });
    expect(
      await repository.claim({
        eventTypes: ["site.build.requested"],
        limit: 1,
        now: unixMilliseconds(5_199),
      }),
    ).toEqual([]);
    const claim = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5_200) });
    expect(claim).toHaveLength(1);
    expect(claim[0]).toMatchObject({ buildId: first.eventId, targetVersion: 0 });
    expect(await sql.all("select id, status, target_version, started_at from site_builds")).toEqual(
      [{ id: first.eventId, status: "running", target_version: 0, started_at: 5_200 }],
    );
    expect(await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5_201) })).toEqual(
      [],
    );
    const next = await repository.requestBuild({
      requestedAt: unixMilliseconds(5_201),
      requestedBy: admin,
    });
    expect(next).toMatchObject({ coalesced: false, targetVersion: 0 });
    expect(next.eventId).not.toBe(first.eventId);
    expect(
      await count(sql, "select count(*) as count from outbox_events where processed_at is null"),
    ).toBe(2);
    expect(
      await repository.renewSiteBuildLease({
        leaseId: claim[0]!.id,
        now: unixMilliseconds(45_200),
      }),
    ).toBe(true);
    const duringRenewal = await repository.claimSiteBuilds({
      limit: 1,
      now: unixMilliseconds(65_200),
    });
    expect(duringRenewal).toHaveLength(1);
    expect(duringRenewal[0]!.buildId).toBe(next.eventId);
    const recovered = await repository.claimSiteBuilds({
      limit: 1,
      now: unixMilliseconds(105_200),
    });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.buildId).toBe(first.eventId);
    expect(recovered[0]!.id).not.toBe(claim[0]!.id);
    expect(
      await sql.get("select status, started_at from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "running", started_at: 5_200 });
    expect(
      await repository.renewSiteBuildLease({
        leaseId: claim[0]!.id,
        now: unixMilliseconds(105_201),
      }),
    ).toBe(false);
    expect(await count(sql, "select count(*) as count from site_builds")).toBe(2);
  },
);

contract(
  "build outcome transitions are lease guarded and reuse one history row",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    const queue = async (at: number) =>
      repository.requestBuild({ requestedAt: unixMilliseconds(at), requestedBy: admin });
    const claim = async (at: number) =>
      (await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(at) }))[0]!;
    const first = await queue(1);
    const lease = await claim(5_001);
    expect(
      await sql.get("select status, started_at from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "running", started_at: 5_001 });
    await repository.recordSiteBuildFailure({
      leaseId: lease.id,
      now: unixMilliseconds(5_002),
      reason: "secret=https://example.test",
      retryAt: unixMilliseconds(10_002),
      terminal: false,
    });
    expect(
      await sql.get("select status, error from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "pending", error: "provider_failed" });
    const recovered = await claim(10_002);
    expect(recovered.buildId).toBe(first.eventId);
    expect(
      await sql.get("select status, started_at from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "running", started_at: 5_001 });
    await expect(
      repository.recordSiteBuildSuccess({ leaseId: lease.id, now: unixMilliseconds(10_003) }),
    ).rejects.toThrow("expired");
    await repository.recordSiteBuildTracking({
      leaseId: recovered.id,
      now: unixMilliseconds(10_003),
      providerBuildId: "provider-1",
    });
    await expect(
      repository.recordSiteBuildTracking({
        leaseId: recovered.id,
        now: unixMilliseconds(10_003),
        providerBuildId: "provider-2",
      }),
    ).rejects.toThrow("expired");
    expect(
      await sql.get(
        "select status, provider_build_id, started_at, provider_check_after from site_builds where id = ?",
        first.eventId,
      ),
    ).toEqual({
      status: "running",
      provider_build_id: "provider-1",
      started_at: 5_001,
      provider_check_after: 10_003,
    });
    for (const now of [10_004, 10_005]) {
      await repository.completeTrackedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "provider-1",
        now: unixMilliseconds(now),
        outcome: "succeeded",
      });
    }
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "provider-1",
        now: unixMilliseconds(10_006),
        outcome: "failed",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "other",
        now: unixMilliseconds(10_006),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(
      await sql.get(
        "select status, completed_at, provider_check_after from site_builds where id = ?",
        first.eventId,
      ),
    ).toEqual({ status: "succeeded", completed_at: 10_004, provider_check_after: null });

    const second = await queue(20_000);
    const terminal = await claim(25_000);
    await repository.recordSiteBuildFailure({
      leaseId: terminal.id,
      now: unixMilliseconds(25_001),
      reason: "trigger_unavailable",
      terminal: true,
    });
    expect(
      await sql.get(
        "select status, completed_at, error from site_builds where id = ?",
        second.eventId,
      ),
    ).toEqual({ status: "failed", completed_at: 25_001, error: "trigger_unavailable" });
    expect(await repository.listSiteBuilds(50)).toMatchObject([
      {
        completedAt: 25_001,
        error: "trigger_unavailable",
        id: second.eventId,
        requestedAt: 20_000,
        startedAt: 25_000,
        status: "failed",
        targetVersion: 0,
      },
      {
        completedAt: 10_004,
        id: first.eventId,
        providerBuildId: "provider-1",
        startedAt: 5_001,
        status: "succeeded",
      },
    ]);
    expect(await repository.getSiteBuild(first.eventId as never)).toMatchObject({
      id: first.eventId,
      providerBuildId: "provider-1",
    });
    expect(await repository.getSiteBuild("missing" as never)).toBeNull();
    expect(
      await sql.get(
        "select attempts, processed_at from outbox_events where id = ?",
        second.eventId,
      ),
    ).toEqual({ attempts: 1, processed_at: 25_001 });
    await sql.run(
      "insert into published_state (singleton_key, version, updated_at) values (1, 9, 25002)",
    );
    const retry = await repository.requestBuild({
      requestedAt: unixMilliseconds(25_003),
      requestedBy: admin,
      retryOfBuildId: second.eventId as never,
    });
    expect(retry).toMatchObject({ coalesced: false, targetVersion: 9 });
    const coalescedRetry = await repository.requestBuild({
      requestedAt: unixMilliseconds(25_004),
      requestedBy: admin,
    });
    expect(coalescedRetry).toMatchObject({ coalesced: true, eventId: retry.eventId });
    const payload = await sql.get<{ payload_json: string }>(
      "select payload_json from outbox_events where id = ?",
      retry.eventId,
    );
    expect(JSON.parse(payload!.payload_json)).toEqual({
      publishedSnapshotId: null,
      reason: "manual",
      requestedAt: 25_004,
      requestedBy: "admin",
      retryOfBuildId: second.eventId,
      targetVersion: 9,
    });
    await expect(
      repository.requestBuild({
        requestedAt: unixMilliseconds(25_005),
        requestedBy: admin,
        retryOfBuildId: first.eventId as never,
      }),
    ).rejects.toThrow("can be retried");
  },
);

contract(
  "provider acceptance, tracked outcomes and retry sources never overstate publication",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("outcome"),
      resolveModel: noModels,
    });
    let clock = 0;
    const dispatch = async () => {
      clock += 10_000;
      const request = await repository.requestBuild({
        requestedAt: unixMilliseconds(clock),
        requestedBy: admin,
      });
      clock += 5_000;
      const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
      expect(lease!.buildId).toBe(request.eventId);
      return lease!;
    };
    const status = async (id: string) =>
      sql.get<{
        status: string;
        provider_build_id: string | null;
        completed_at: number | null;
        error: string | null;
      }>("select status, provider_build_id, completed_at, error from site_builds where id = ?", id);

    const bare = await dispatch();
    await repository.recordSiteBuildAccepted({ leaseId: bare.id, now: unixMilliseconds(clock) });
    expect(await status(bare.buildId)).toEqual({
      status: "accepted",
      provider_build_id: null,
      completed_at: clock,
      error: null,
    });
    expect(
      await repository.claimSiteBuilds({ limit: 10, now: unixMilliseconds(clock + 120_000) }),
    ).toEqual([]);

    const identified = await dispatch();
    await repository.recordSiteBuildAccepted({
      leaseId: identified.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-accepted",
    });
    expect(await status(identified.buildId)).toMatchObject({
      status: "accepted",
      provider_build_id: "dep-accepted",
    });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: identified.buildId,
        providerBuildId: "dep-accepted",
        now: unixMilliseconds(clock + 1),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await status(identified.buildId)).toMatchObject({ status: "accepted" });

    const lost = await dispatch();
    await repository.recordSiteBuildTracking({
      leaseId: lost.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-lost",
    });
    const lostAt = clock + 1;
    for (let repeat = 0; repeat < 2; repeat += 1)
      await repository.completeTrackedSiteBuild({
        buildId: lost.buildId,
        providerBuildId: "dep-lost",
        now: unixMilliseconds(lostAt + repeat),
        outcome: "unknown",
        reason: "ignored for unknown",
      });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: lost.buildId,
        providerBuildId: "dep-lost",
        now: unixMilliseconds(lostAt + 5),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await status(lost.buildId)).toEqual({
      status: "unknown",
      provider_build_id: "dep-lost",
      completed_at: lostAt,
      error: null,
    });

    const skipped = await dispatch();
    await repository.recordSiteBuildTracking({
      leaseId: skipped.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-skipped",
    });
    await repository.completeTrackedSiteBuild({
      buildId: skipped.buildId,
      providerBuildId: "dep-skipped",
      now: unixMilliseconds(clock + 1),
      outcome: "cancelled",
    });
    const broken = await dispatch();
    await repository.recordSiteBuildTracking({
      leaseId: broken.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-broken",
    });
    await repository.completeTrackedSiteBuild({
      buildId: broken.buildId,
      providerBuildId: "dep-broken",
      now: unixMilliseconds(clock + 1),
      outcome: "failed",
      reason: "secret provider text",
    });
    expect(await status(broken.buildId)).toMatchObject({
      status: "failed",
      error: "provider_failed",
    });

    const owned = await dispatch();
    await sql.run(
      "update site_builds set provider_build_id = 'dep-owned' where id = ?",
      owned.buildId,
    );
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: owned.buildId,
        providerBuildId: "dep-owned",
        now: unixMilliseconds(clock),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await status(owned.buildId)).toMatchObject({ status: "running" });
    await expect(
      repository.recordSiteBuildAccepted({
        leaseId: owned.id,
        now: unixMilliseconds(clock),
        providerBuildId: "",
      }),
    ).rejects.toThrow("Provider build ID is invalid.");

    for (const source of [owned.buildId, "missing"])
      await expect(
        repository.requestBuild({
          requestedAt: unixMilliseconds(clock),
          requestedBy: admin,
          retryOfBuildId: source as never,
        }),
      ).rejects.toThrow("can be retried");
    const unprocessed = await count(
      sql,
      "select count(*) as count from outbox_events where processed_at is null and locked_at is null",
    );
    expect(unprocessed).toBe(0);
    for (const source of [bare, lost, skipped, broken]) {
      const receipt = await repository.requestBuild({
        requestedAt: unixMilliseconds(clock),
        requestedBy: admin,
        retryOfBuildId: source.buildId,
      });
      expect(receipt.eventId).not.toBe(source.buildId);
    }
    expect(await status(bare.buildId)).toMatchObject({ status: "accepted" });
    expect(await status(lost.buildId)).toMatchObject({ status: "unknown" });
    expect(await status(skipped.buildId)).toMatchObject({ status: "cancelled" });
    expect((await repository.getSiteBuild(skipped.buildId))?.status).toBe("cancelled");
  },
);

contract(
  "tracking checks are leased, provider guarded and record stages without touching other builds",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("track"),
      resolveModel: noModels,
    });
    let clock = 0;
    const track = async (providerBuildId: string) => {
      clock += 10_000;
      await repository.requestBuild({ requestedAt: unixMilliseconds(clock), requestedBy: admin });
      clock += 5_000;
      const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
      await repository.recordSiteBuildTracking({
        leaseId: lease!.id,
        now: unixMilliseconds(clock),
        providerBuildId,
      });
      return { buildId: lease!.buildId, startedAt: clock };
    };
    const row = async (id: string) =>
      sql.get(
        "select status, provider_stage, provider_checked_at, provider_check_after, error from site_builds where id = ?",
        id,
      );
    const a = await track("dep-a");
    const b = await track("dep-b");
    // A running build still owned by dispatch is never offered for checks.
    clock += 10_000;
    await repository.requestBuild({ requestedAt: unixMilliseconds(clock), requestedBy: admin });
    clock += 5_000;
    const [owned] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
    await sql.run(
      "update site_builds set provider_build_id = 'dep-owned', provider_check_after = 0 where id = ?",
      owned!.buildId,
    );

    const now = unixMilliseconds(clock);
    await expect(
      repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 0, now }),
    ).rejects.toThrow("Tracking claim limit is invalid.");
    const first = await repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 25, now });
    expect(first).toEqual([
      { buildId: a.buildId, providerBuildId: "dep-a", trackingStartedAt: a.startedAt },
      { buildId: b.buildId, providerBuildId: "dep-b", trackingStartedAt: b.startedAt },
    ]);
    // The check lease makes each build exclusive until it expires.
    expect(
      await repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 25, now }),
    ).toEqual([]);
    expect(await row(a.buildId)).toMatchObject({ provider_check_after: clock + 60_000 });

    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: a.buildId,
        checkAfter: unixMilliseconds(clock + 30_000),
        now,
        providerBuildId: "dep-a",
        stage: "build",
      }),
    ).toBe(true);
    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: a.buildId,
        checkAfter: unixMilliseconds(clock + 1),
        now,
        providerBuildId: "dep-b",
        stage: "deploy",
      }),
    ).toBe(false);
    expect(await row(a.buildId)).toEqual({
      status: "running",
      provider_stage: "build",
      provider_checked_at: clock,
      provider_check_after: clock + 30_000,
      error: null,
    });
    // A transient check moves only the next due time.
    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: a.buildId,
        checkAfter: unixMilliseconds(clock + 45_000),
        now: unixMilliseconds(clock + 1),
        providerBuildId: "dep-a",
      }),
    ).toBe(true);
    expect(await row(a.buildId)).toMatchObject({
      provider_stage: "build",
      provider_checked_at: clock,
      provider_check_after: clock + 45_000,
    });

    await repository.completeTrackedSiteBuild({
      buildId: b.buildId,
      now: unixMilliseconds(clock + 2),
      outcome: "succeeded",
      providerBuildId: "dep-b",
      stage: "deploy",
    });
    expect(await row(b.buildId)).toEqual({
      status: "succeeded",
      provider_stage: "deploy",
      provider_checked_at: clock + 2,
      provider_check_after: null,
      error: null,
    });
    expect(await repository.getSiteBuild(b.buildId)).toMatchObject({
      providerCheckedAt: clock + 2,
      providerStage: "deploy",
      status: "succeeded",
    });
    expect(await row(a.buildId)).toMatchObject({ status: "running", provider_stage: "build" });
    // Terminal rows never accept check records and are never due again.
    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: b.buildId,
        checkAfter: unixMilliseconds(clock + 3),
        now: unixMilliseconds(clock + 3),
        providerBuildId: "dep-b",
        stage: "build",
      }),
    ).toBe(false);

    // After the lease and next check, A is due again with its last successful check.
    const later = unixMilliseconds(clock + 120_000);
    expect(
      await repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 25, now: later }),
    ).toEqual([
      {
        buildId: a.buildId,
        lastCheckedAt: clock,
        providerBuildId: "dep-a",
        trackingStartedAt: a.startedAt,
      },
    ]);
    await repository.completeTrackedSiteBuild({
      buildId: a.buildId,
      now: later,
      outcome: "unknown",
      providerBuildId: "dep-a",
      reason: "tracking_timeout",
    });
    await repository.completeTrackedSiteBuild({
      buildId: a.buildId,
      now: unixMilliseconds(later + 1),
      outcome: "unknown",
      providerBuildId: "dep-a",
      reason: "tracking_timeout",
      stage: "deploy",
    });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: a.buildId,
        now: unixMilliseconds(later + 2),
        outcome: "succeeded",
        providerBuildId: "dep-a",
        stage: "deploy",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await row(a.buildId)).toEqual({
      status: "unknown",
      provider_stage: "build",
      provider_checked_at: clock,
      provider_check_after: null,
      error: "tracking_timeout",
    });
    expect(await repository.getSiteBuild(a.buildId)).toMatchObject({ error: "tracking_timeout" });
    expect(
      await repository.claimTrackedSiteBuildChecks({
        leaseMs: 60_000,
        limit: 25,
        now: unixMilliseconds(later + 600_000),
      }),
    ).toEqual([]);
    expect(await row(owned!.buildId)).toMatchObject({ status: "running" });
  },
);

contract(
  "tracked completions store only their outcome's closed reasons",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("reason"),
      resolveModel: noModels,
    });
    let clock = 0;
    const cases = [
      ["failed", "provider_deploy_failed", "provider_deploy_failed"],
      ["failed", "tracking_timeout", "provider_failed"],
      ["cancelled", "provider_skipped", "provider_skipped"],
      ["cancelled", "provider_build_failed", null],
      ["unknown", "tracking_forbidden", "tracking_forbidden"],
      ["unknown", "provider_cancelled", null],
      ["succeeded", "provider_failed", null],
    ] as const;
    for (const [outcome, reason, stored] of cases) {
      clock += 10_000;
      await repository.requestBuild({ requestedAt: unixMilliseconds(clock), requestedBy: admin });
      clock += 5_000;
      const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
      await repository.recordSiteBuildTracking({
        leaseId: lease!.id,
        now: unixMilliseconds(clock),
        providerBuildId: `dep-${clock}`,
      });
      await repository.completeTrackedSiteBuild({
        buildId: lease!.buildId,
        now: unixMilliseconds(clock),
        outcome,
        providerBuildId: `dep-${clock}`,
        reason,
      });
      expect(
        await sql.get("select status, error from site_builds where id = ?", lease!.buildId),
      ).toEqual({ status: outcome, error: stored });
    }
  },
);

contract(
  "a stray event for a terminal build is finished without dispatch",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    await sql.run(
      "insert into site_builds (id, reason, status, target_version, requested_by, requested_at, started_at, completed_at) values ('stray', 'manual', 'accepted', 0, 'admin', 1, 1, 2)",
    );
    await sql.run(
      `insert into outbox_events (id, type, payload_json, available_at, created_at) values ('stray', 'site.build.requested', '{"publishedSnapshotId":null,"reason":"manual","requestedAt":1,"requestedBy":"admin","targetVersion":0}', 1, 1)`,
    );
    expect(await repository.claimSiteBuilds({ limit: 10, now: unixMilliseconds(10) })).toEqual([]);
    expect(
      await sql.get("select processed_at, locked_by from outbox_events where id = 'stray'"),
    ).toEqual({ processed_at: 10, locked_by: null });
    expect(
      await sql.get("select status, started_at, completed_at from site_builds where id = 'stray'"),
    ).toEqual({ status: "accepted", started_at: 1, completed_at: 2 });
  },
);

contract(
  "marks malformed build events invalid without creating history",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    await sql.run(
      "insert into outbox_events (id, type, payload_json, available_at, created_at) values ('bad-build', 'site.build.requested', '{}', 1, 1)",
    );
    expect(await repository.claimSiteBuilds({ limit: 10, now: unixMilliseconds(2) })).toEqual([]);
    expect(
      await sql.get("select attempts, last_error, processed_at, locked_by from outbox_events"),
    ).toEqual({ attempts: 1, last_error: "invalid_build_event", locked_by: null, processed_at: 2 });
    expect(await count(sql, "select count(*) as count from site_builds")).toBe(0);
  },
);

contract(
  "claims media deletion work exclusively and finalizes or exposes terminal failure",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("event"),
      resolveModel: noModels,
    });
    const insert = async (id: string, attempts = 0) => {
      await seedMedia(sql, id, "deleting");
      await sql.run(
        "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'media.delete.requested', ?, ?, 1, 1)",
        `outbox-${id}`,
        JSON.stringify({ mediaId: id }),
        attempts,
      );
    };
    const claim = async (now: number) =>
      repository.claim({
        eventTypes: ["media.delete.requested"],
        limit: 1,
        now: unixMilliseconds(now),
      });
    await insert("media-success");
    const first = await claim(1);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      event: { attempts: 0, payload: { mediaId: "media-success" } },
      expiresAt: 60_001,
    });
    await expect(claim(2)).resolves.toEqual([]);
    await expect(
      repository.completeMediaDeletion({
        completedAt: unixMilliseconds(2),
        leaseId: first[0]!.id,
        mediaId: mediaId("other-media"),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(repository.loadDeletingMedia(mediaId("media-success"))).resolves.toMatchObject({
      status: "deleting",
    });
    await repository.completeMediaDeletion({
      completedAt: unixMilliseconds(2),
      leaseId: first[0]!.id,
      mediaId: mediaId("media-success"),
    });
    expect(await count(sql, "select count(*) as count from media")).toBe(0);
    expect(await sql.get("select processed_at, locked_by from outbox_events")).toEqual({
      locked_by: null,
      processed_at: 2,
    });
    await expect(
      repository.completeMediaDeletion({
        completedAt: unixMilliseconds(3),
        leaseId: first[0]!.id,
        mediaId: mediaId("media-success"),
      }),
    ).rejects.toThrow("expired");

    await insert("media-retry");
    const retryLease = await claim(3);
    await repository.failMediaDeletion({
      failedAt: unixMilliseconds(4),
      leaseId: retryLease[0]!.id,
      mediaId: mediaId("media-retry"),
      retryAt: unixMilliseconds(100),
      sanitizedError: "temporary",
      terminal: false,
    });
    expect(
      await sql.get(
        "select attempts, available_at, last_error, locked_by from outbox_events where id = 'outbox-media-retry'",
      ),
    ).toEqual({ attempts: 1, available_at: 100, last_error: "temporary", locked_by: null });
    expect((await repository.loadMedia("media-retry"))?.status).toBe("deleting");

    await insert("media-terminal", 7);
    const terminal = await claim(5);
    expect(terminal[0]!.event.id).toBe("outbox-media-terminal");
    await repository.failMediaDeletion({
      failedAt: unixMilliseconds(6),
      leaseId: terminal[0]!.id,
      mediaId: mediaId("media-terminal"),
      sanitizedError: "endpoint\nsecret",
      terminal: true,
    });
    expect(
      await sql.get("select status, last_error from media where id = 'media-terminal'"),
    ).toEqual({ last_error: "endpoint secret", status: "delete_failed" });
    await repository.retryDeletion({
      mediaId: mediaId("media-terminal"),
      requestedAt: unixMilliseconds(7),
      requestedBy: admin,
    });
    expect(
      await sql.get("select status, last_error from media where id = 'media-terminal'"),
    ).toEqual({ last_error: null, status: "deleting" });
    await expect(repository.loadDeletingMedia(mediaId("missing"))).resolves.toBeNull();
  },
);

contract(
  "retires the outbox lease after a completed or failed dispatcher attempt",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    for (const id of ["one", "two"]) {
      await sql.run(
        "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'custom.event', '{}', 0, 1, 1)",
        id,
      );
    }
    const leases = await repository.claim({
      eventTypes: ["custom.event"],
      limit: 10,
      now: unixMilliseconds(10),
    });
    expect(leases.map((lease) => lease.event.id)).toEqual(["one", "two"]);
    await repository.complete({
      completedAt: unixMilliseconds(11),
      leaseId: leases[0]!.id,
      outcome: "succeeded",
    });
    await repository.retry({
      error: "line\nbreak",
      failedAt: unixMilliseconds(11),
      leaseId: leases[1]!.id,
      retryAt: unixMilliseconds(50),
    });
    await expect(
      repository.complete({
        completedAt: unixMilliseconds(12),
        leaseId: leases[0]!.id,
        outcome: "succeeded",
      }),
    ).rejects.toThrow("expired");
    expect(
      await sql.all(
        "select id, attempts, available_at, processed_at, last_error from outbox_events order by id",
      ),
    ).toEqual([
      { attempts: 0, available_at: 1, id: "one", last_error: null, processed_at: 11 },
      { attempts: 1, available_at: 50, id: "two", last_error: "line break", processed_at: null },
    ]);
    await expect(
      repository.claim({ eventTypes: [], limit: 1, now: unixMilliseconds(1) }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.claim({ eventTypes: ["custom.event"], limit: 0, now: unixMilliseconds(1) }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  },
);

contract(
  "applies guarded configuration sync atomically, coalesces build work, and rejects stale plans",
  async (runtime, expect) => {
    const models = [syncPage(), syncCollection()];
    const { repository, sql } = await runtime.open({
      nextId: sequence("outbox"),
      resolveModel: syncResolver(models),
    });
    await expect(applySync(repository, models, 10)).resolves.toMatchObject({
      status: "applied",
      targetVersion: 1,
    });
    expect(await repository.readConfigurationSyncState()).toMatchObject([
      { draftSnapshotCount: 1, entryCount: 1, key: "home", publishedSnapshotCount: 0 },
      { entryCount: 0, key: "posts" },
    ]);
    await expect(
      repository.list({
        limit: 1,
        listFields: [],
        modelKey: contentModelKey("home"),
        sort: "-updatedAt",
      }),
    ).resolves.toMatchObject({ items: [{ title: "home" }] });
    expect(await sql.get("select version from published_state")).toEqual({ version: 1 });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);

    await expect(applySync(repository, models, 11)).resolves.toMatchObject({ status: "noop" });
    expect(await sql.get("select version from published_state")).toEqual({ version: 1 });

    const projectionUpdate = [syncPage(), syncCollection({ projectionHash: "projection-posts-2" })];
    await expect(applySync(repository, projectionUpdate, 12)).resolves.toMatchObject({
      status: "applied",
      targetVersion: 2,
    });
    expect(await sql.get("select version from published_state")).toEqual({ version: 2 });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);

    const stale = await prepareConfigurationSynchronization({
      models: projectionUpdate,
      state: repository,
    });
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "changed-concurrently",
      "posts",
    );
    await expect(applySync(repository, projectionUpdate, 13, stale)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await sql.get("select version from published_state")).toEqual({ version: 2 });
    expect(await sql.get("select projection_hash from content_models where key = 'posts'")).toEqual(
      { projection_hash: "changed-concurrently" },
    );

    const removal = [syncPage()];
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "projection-posts-2",
      "posts",
    );
    await expect(applySync(repository, removal, 14)).resolves.toMatchObject({
      status: "applied",
      targetVersion: 3,
    });
    expect(await sql.all("select key from content_models order by key")).toEqual([{ key: "home" }]);
  },
);

contract("rolls back a failed synchronized page singleton", async (runtime, expect) => {
  const models = [syncPage({ label: "Home" })];
  const { repository, sql } = await runtime.open({
    beforeMutation: (checkpoint) => {
      if (checkpoint === "sync.page.snapshot") throw new Error("injected failure");
    },
    resolveModel: syncResolver(models),
  });
  await expect(applySync(repository, models, 10)).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(await repository.readConfigurationSyncState()).toEqual([]);
  expect(await count(sql, "select count(*) as count from content_entries")).toBe(0);
  expect(await count(sql, "select count(*) as count from published_state")).toBe(0);
  expect(await count(sql, "select count(*) as count from outbox_events")).toBe(0);
});

contract(
  "renames a populated model through the key cascade without inferring a replacement",
  async (runtime, expect) => {
    const posts = syncCollection();
    const articles = syncCollection({ key: "articles", renamedFrom: "posts" });
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([posts, articles]),
    });
    await applySync(repository, [posts], 10);
    await repository.create({
      entry: entry("post-entry", "posts", { title: "Post", updatedAt: 11 }),
      mediaReferences: [],
    });
    await expect(applySync(repository, [articles], 12)).resolves.toMatchObject({
      status: "applied",
    });
    expect(await sql.get("select key from content_models")).toEqual({ key: "articles" });
    expect(await sql.get("select model_key from content_entries")).toEqual({
      model_key: "articles",
    });
  },
);

contract("allows only one independently prepared sync apply to commit", async (runtime, expect) => {
  const models = [syncCollection()];
  const harness = await runtime.open({ resolveModel: syncResolver(models) });
  const first = harness.repository;
  const second = harness.reopen();
  const [firstPrepared, secondPrepared] = await Promise.all([
    prepareConfigurationSynchronization({ models, state: first }),
    prepareConfigurationSynchronization({ models, state: second }),
  ]);
  await expect(applySync(first, models, 10, firstPrepared)).resolves.toMatchObject({
    status: "applied",
  });
  await expect(applySync(second, models, 11, secondPrepared)).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(await count(harness.sql, "select count(*) as count from content_models")).toBe(1);
  expect(await count(harness.sql, "select count(*) as count from outbox_events")).toBe(1);
});

contract(
  "persists bounded draft reads and writes without exposing drafts publicly",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "home");
    await seedMedia(sql, "media-1");
    const first = heroEntry("post-a", "posts", 20, "First");
    const second = heroEntry("post-b", "posts", 20, "Second");
    await expect(
      repository.create({ entry: first, mediaReferences: references("post-a-block") }),
    ).resolves.toMatchObject({ entry: { id: "post-a" }, status: "created" });
    await repository.create({ entry: second, mediaReferences: references("post-b-block") });
    const listInput = {
      limit: 1,
      listFields: [],
      modelKey: contentModelKey("posts"),
      sort: "-updatedAt" as const,
    };
    const firstPage = await repository.list(listInput);
    expect(firstPage.items.map((item) => item.id)).toEqual(["post-b"]);
    const secondPage = await repository.list({ ...listInput, after: firstPage.nextCursor! });
    expect(secondPage.items.map((item) => item.id)).toEqual(["post-a"]);
    expect(secondPage.nextCursor).toBeUndefined();
    await expect(
      repository.list({ ...listInput, after: "not-a-cursor" as never }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.loadDraft({ entryId: first.id })).toMatchObject({
      blocks: [{ key: "post-a-block" }],
      id: "post-a-draft",
      revision: 1,
      title: "First",
    });
    expect(await repository.loadPublished({ entryId: first.id })).toBeNull();
    expect(await repository.load({ entryId: contentEntryId("missing") })).toBeNull();

    const saved = await repository.saveCompleteDraft(
      save("post-a", 1, 30, {
        blocks: [heroBlock("saved-block", "media-1", "Saved")],
        fields: { image: "media-1", title: "Saved" },
        mediaReferences: references("saved-block"),
        slug: "post-a",
        title: "Saved",
      }),
    );
    expect(saved).toMatchObject({ entry: { draft: { revision: 2 } }, status: "saved" });
    expect((await repository.load({ entryId: first.id }))!.draft).toMatchObject({
      blocks: [{ key: "saved-block" }],
      revision: 2,
      title: "Saved",
    });
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = ?",
        "post-a-draft",
      ),
    ).toBe(2);
    await expect(
      repository.saveCompleteDraft(save("post-a", 1, 31, { title: "Stale" })),
    ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    expect((await repository.load({ entryId: first.id }))!.draft.title).toBe("Saved");
    await seedMedia(sql, "deleting-media", "deleting");
    for (const unavailable of ["missing-media", "deleting-media"]) {
      await expect(
        repository.saveCompleteDraft(
          save("post-a", 2, 32, {
            fields: { title: "Broken" },
            mediaReferences: [
              { fieldPath: "image", mediaId: mediaId(unavailable), sourceKey: "$fields" },
            ],
            title: "Broken",
          }),
        ),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    expect((await repository.load({ entryId: first.id }))!.draft).toMatchObject({
      blocks: [{ key: "saved-block" }],
      revision: 2,
      title: "Saved",
    });
    await expect(repository.saveCompleteDraft(save("missing", 1, 33))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    await repository.create({
      entry: heroEntry("home-a", "home", 21),
      mediaReferences: references("home-a-block"),
    });
    await expect(
      repository.create({
        entry: heroEntry("home-b", "home", 22),
        mediaReferences: references("home-b-block"),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_MODEL_CARDINALITY_CONFLICT" });
    expect(await repository.load({ entryId: contentEntryId("home-b") })).toBeNull();
    await expect(
      repository.create({
        entry: entry("broken", "posts", { updatedAt: 23 }),
        mediaReferences: [{ fieldPath: "x", mediaId: mediaId("missing"), sourceKey: "$fields" }],
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.load({ entryId: contentEntryId("broken") })).toBeNull();

    const published = await repository.publish(publish("post-a", 2, 40, "post-a-published"));
    expect(published).toMatchObject({
      outcome: "published",
      status: "published",
      targetVersion: 1,
    });
    if (published.outcome !== "published") throw new Error("expected publication");
    expect(published.entry).toEqual(await repository.load({ entryId: first.id }));
    expect(published.entry.published).toMatchObject({
      createdAt: 40,
      id: "post-a-published",
      revision: 2,
      state: "published",
      updatedBy: { id: "editor" },
    });
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = ?",
        "post-a-published",
      ),
    ).toBe(2);
    await sql.run(
      "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) select ?, entry_id, revision, slug, title, fields_json, schema_version, ?, ?, updated_by from content_snapshots where id = ?",
      "post-b-published",
      41,
      41,
      "post-b-draft",
    );
    await sql.run(
      "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) select ?, block_key, block_type, position, schema_version, data_json, created_at, updated_at from content_blocks where snapshot_id = ?",
      "post-b-published",
      "post-b-draft",
    );
    await sql.run(
      "update content_entries set published_snapshot_id = ? where id = ?",
      "post-b-published",
      "post-b",
    );
    await sql.run(
      "insert into published_routes (path, entry_id, snapshot_id, updated_at) values (?, ?, ?, ?)",
      "/blog/post-b",
      "post-b",
      "post-b-published",
      41,
    );
    expect(await repository.loadPublic("/blog/post-a")).toMatchObject({
      entry: { id: "post-a", published: { id: "post-a-published" } },
      path: "/blog/post-a",
    });
    const publicPage = await repository.listPublic({
      limit: 1,
      modelKey: contentModelKey("posts"),
    });
    expect(publicPage).toMatchObject({ items: [{ path: "/blog/post-b" }] });
    expect(
      await repository.listPublic({
        after: publicPage.nextCursor!,
        limit: 1,
        modelKey: contentModelKey("posts"),
      }),
    ).toMatchObject({ items: [{ path: "/blog/post-a" }] });
    await expect(
      repository.listPublic({
        after: publicPage.nextCursor!,
        limit: 1,
        modelKey: contentModelKey("home"),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.publishedContentVersion()).toBe(1);
    expect((await repository.loadPublicMedia("media-1"))?.id).toBe("media-1");
    expect(await repository.loadPublicMedia("deleting-media")).toBeNull();
    expect(await readAllBuildContentPages(repository)).toMatchObject({
      entries: [{ path: "/blog/post-a" }, { path: "/blog/post-b" }],
      version: 1,
    });
    expect(await repository.loadPublic("/missing")).toBeNull();
    await sql.run(
      "update content_snapshots set fields_json = ? where id = ?",
      "not-json",
      "post-b-published",
    );
    await expect(repository.loadPublic("/blog/post-b")).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  },
);

contract(
  "keeps the previous publication until a later publish replaces it",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: heroEntry("post", "posts", 1),
      mediaReferences: references("post-block"),
    });
    await repository.publish(publish("post", 1, 2, "first-publication"));
    await repository.saveCompleteDraft(save("post", 1, 3, { slug: "renamed", title: "Draft" }));
    expect((await repository.loadPublished({ entryId: contentEntryId("post") }))?.title).toBe(
      "post",
    );
    expect(await repository.loadPublic("/blog/post")).not.toBeNull();
    await repository.publish(publish("post", 2, 4, "second-publication"));
    expect(await repository.loadPublic("/blog/post")).toBeNull();
    expect(await repository.loadPublic("/blog/renamed")).toMatchObject({
      entry: { published: { id: "second-publication", title: "Draft" } },
    });
    expect(
      await sql.all("select id from content_snapshots where entry_id = 'post' order by id"),
    ).toEqual([{ id: "post-draft" }, { id: "second-publication" }]);
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = 'first-publication'",
      ),
    ).toBe(0);
    expect(await repository.publishedContentVersion()).toBe(2);
    expect(
      JSON.parse(
        (await sql.get<{ payload_json: string }>("select payload_json from outbox_events"))!
          .payload_json,
      ),
    ).toEqual({
      publishedSnapshotId: "second-publication",
      reason: "publication",
      requestedAt: 4,
      requestedBy: "editor",
      targetVersion: 2,
    });
    await expect(repository.publish(publish("post", 1, 5))).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    await expect(repository.publish(publish("missing", 1, 5))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  },
);

contract(
  "rejects a route conflict without changing either entry or public state",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: entry("owner", "posts", { slug: "shared", updatedAt: 1 }),
      mediaReferences: [],
    });
    await repository.publish(publish("owner", 1, 2, "owner-published"));
    await repository.create({
      entry: entry("challenger", "posts", {
        blocks: [heroBlock("challenger-block", "media-1")],
        slug: "shared",
        updatedAt: 3,
      }),
      mediaReferences: references("challenger-block"),
    });
    const outboxBefore = await sql.all("select id, payload_json, available_at from outbox_events");
    await expect(
      repository.publish(publish("challenger", 1, 4, "challenger-published")),
    ).rejects.toMatchObject({ code: "CONTENT_ROUTE_CONFLICT" });
    expect(await sql.all("select path, entry_id, snapshot_id from published_routes")).toEqual([
      { entry_id: "owner", path: "/blog/shared", snapshot_id: "owner-published" },
    ]);
    expect((await repository.load({ entryId: contentEntryId("challenger") }))?.published).toBe(
      undefined,
    );
    expect(
      await count(
        sql,
        "select count(*) as count from content_snapshots where id = ?",
        "challenger-published",
      ),
    ).toBe(0);
    expect(await count(sql, "select count(*) as count from content_blocks")).toBe(1);
    expect(await count(sql, "select count(*) as count from content_media_references")).toBe(2);
    expect(await repository.publishedContentVersion()).toBe(1);
    expect(await sql.all("select id, payload_json, available_at from outbox_events")).toEqual(
      outboxBefore,
    );
  },
);

contract(
  "replays an idempotent publication once and refuses a changed fingerprint",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedModels(sql, "posts");
    await repository.create({
      entry: entry("post", "posts", { slug: "post", updatedAt: 1 }),
      mediaReferences: [],
    });
    const idempotency = {
      actorId: editor.id,
      fingerprint: publicationRequestFingerprint("fingerprint-1"),
      key: publicationIdempotencyKey("request-1"),
    };
    const [left, right] = await Promise.all([
      repository.publish({ ...publish("post", 1, 2, "left"), idempotency }),
      harness.reopen().publish({ ...publish("post", 1, 2, "right"), idempotency }),
    ]);
    expect([left.outcome, right.outcome].sort()).toEqual(["published", "replayed"]);
    expect(right.entry).toEqual(left.entry);
    expect(await repository.publishedContentVersion()).toBe(1);
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    expect(await count(sql, "select count(*) as count from content_snapshots")).toBe(2);
    const replay = await repository.publish({ ...publish("post", 1, 9, "late"), idempotency });
    expect(replay).toEqual({ entry: left.entry, outcome: "replayed", status: "published" });
    await expect(
      repository.publish({
        ...publish("post", 1, 10),
        idempotency: { ...idempotency, fingerprint: publicationRequestFingerprint("other") },
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.publish({
        ...publish("post", 1, 10),
        idempotency: { ...idempotency, actorId: actorId("someone-else") },
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.publishedContentVersion()).toBe(1);
    expect(
      await sql.get("select scope, key, request_hash, expires_at from idempotency_records"),
    ).toEqual({
      expires_at: 86_400_002,
      key: "request-1",
      request_hash: "fingerprint-1",
      scope: "publication:post:editor",
    });
  },
);

contract("admits exactly one of two concurrent saves at one revision", async (runtime, expect) => {
  const harness = await runtime.open({ resolveModel: resolveRoute });
  const { repository, sql } = harness;
  await seedModels(sql, "posts");
  await seedMedia(sql, "media-1");
  await repository.create({ entry: entry("post", "posts", { updatedAt: 1 }), mediaReferences: [] });
  const attempt = (label: string, at: number) =>
    save("post", 1, at, {
      blocks: [heroBlock(`${label}-block`, "media-1", label)],
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey(`${label}-block`) },
      ],
      title: label,
    });
  const results = await Promise.allSettled([
    repository.saveCompleteDraft(attempt("left", 2)),
    harness.reopen().saveCompleteDraft(attempt("right", 3)),
  ]);
  const committed = results.filter((result) => result.status === "fulfilled");
  const refused = results.filter((result) => result.status === "rejected");
  expect(committed).toHaveLength(1);
  expect(refused).toHaveLength(1);
  expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  const winner = (await repository.load({ entryId: contentEntryId("post") }))!.draft;
  expect(winner.revision).toBe(2);
  expect(winner.blocks.map((block) => block.key)).toEqual([`${winner.title}-block`]);
  expect(await sql.all("select source_key from content_media_references")).toEqual([
    { source_key: `${winner.title}-block` },
  ]);
});

contract("rejects drafts beyond the block and media-reference caps", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  await seedMedia(sql, "media-1");
  const blocks = Array.from({ length: 201 }, (_, index) =>
    heroBlock(`block-${index}`, "media-1", "x", "hero", (index + 1) * 1000),
  );
  const tooManyReferences = Array.from({ length: 201 }, (_, index) => ({
    fieldPath: `image-${index}`,
    mediaId: mediaId("media-1"),
    sourceKey: "$fields" as const,
  }));
  await expect(
    repository.create({
      entry: entry("big", "posts", { blocks, updatedAt: 1 }),
      mediaReferences: [],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await repository.create({ entry: entry("post", "posts", { updatedAt: 1 }), mediaReferences: [] });
  await expect(
    repository.saveCompleteDraft(save("post", 1, 2, { mediaReferences: tooManyReferences })),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(repository.saveCompleteDraft(save("post", 1, 2, { blocks }))).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(await count(sql, "select count(*) as count from content_entries")).toBe(1);
  expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.revision).toBe(1);
});

contract("rolls back publication at every injected checkpoint", async (runtime, expect) => {
  for (const checkpoint of PUBLICATION_CHECKPOINTS) {
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (name === checkpoint) throw new Error(`injected ${checkpoint}`);
      },
      resolveModel: resolveRoute,
    });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: heroEntry("post", "posts", 1),
      mediaReferences: references("post-block"),
    });
    await expect(repository.publish(publish("post", 1, 2, "published"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect((await repository.load({ entryId: contentEntryId("post") }))?.published).toBe(undefined);
    for (const table of [
      "published_routes",
      "published_state",
      "outbox_events",
      "idempotency_records",
    ]) {
      expect(await count(sql, `select count(*) as count from ${table}`), checkpoint).toBe(0);
    }
    expect(await count(sql, "select count(*) as count from content_snapshots"), checkpoint).toBe(1);
    expect(await count(sql, "select count(*) as count from content_blocks"), checkpoint).toBe(1);
    expect(
      await count(sql, "select count(*) as count from content_media_references"),
      checkpoint,
    ).toBe(2);
  }
});

const LIFECYCLE_TABLES = [
  "content_entries",
  "content_snapshots",
  "content_blocks",
  "content_media_references",
  "published_routes",
  "published_state",
  "outbox_events",
  "idempotency_records",
] as const;

async function lifecycleState(sql: ContractSql) {
  const state: Record<string, readonly unknown[]> = {};
  for (const table of LIFECYCLE_TABLES) {
    state[table] = await sql.all(`select * from ${table} order by 1, 2`);
  }
  return state;
}

function unpublishCommand(entryIdValue: string, expected: string, at: number) {
  return {
    entryId: contentEntryId(entryIdValue),
    expectedPublishedSnapshotId: contentSnapshotId(expected),
    unpublishedAt: unixMilliseconds(at),
    unpublishedBy: admin,
  };
}

function revertCommand(entryIdValue: string, expectedRevision: number, published: string, at = 20) {
  return {
    entryId: contentEntryId(entryIdValue),
    expectedPublishedSnapshotId: contentSnapshotId(published),
    expectedRevision,
    revertedAt: unixMilliseconds(at),
    revertedBy: editor,
  };
}

function changedPost(id: string, at: number, expectedRevision = 1) {
  return save(id, expectedRevision, at, {
    blocks: [heroBlock("changed-block", "media-2", "Changed", "hero", 2000)],
    fields: { image: "media-2", title: "Changed" },
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("changed-block") },
    ],
    slug: "changed",
    title: "Changed",
  });
}

async function seedPublishedLifecycle(repository: ContractRepository, sql: ContractSql) {
  await seedModels(sql, "home", "posts");
  await seedMedia(sql, "media-1");
  await seedMedia(sql, "media-2");
  for (const [id, model] of [
    ["home", "home"],
    ["post", "posts"],
  ] as const) {
    await repository.create({
      entry: heroEntry(id, model, 1),
      mediaReferences: references(`${id}-block`),
    });
    await repository.publish(publish(id, 1, 2, `${id}-published`));
  }
}

contract("unpublishes a publication and keeps the draft", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedPublishedLifecycle(repository, sql);
  await repository.saveCompleteDraft(changedPost("post", 3));
  const version = await repository.publishedContentVersion();
  const before = await lifecycleState(sql);
  await expect(repository.unpublish(unpublishCommand("post", "stale", 4))).rejects.toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  expect(await lifecycleState(sql)).toEqual(before);

  const draft = (await repository.load({ entryId: contentEntryId("post") }))!.draft;
  const result = await repository.unpublish(unpublishCommand("post", "post-published", 5));
  expect(result).toMatchObject({
    outcome: "unpublished",
    status: "unpublished",
    targetVersion: version + 1,
  });
  expect(result.entry.published).toBeUndefined();
  expect(result.entry.draft).toEqual(draft);
  const loaded = (await repository.load({ entryId: contentEntryId("post") }))!;
  expect(loaded.published).toBeUndefined();
  expect(loaded.draft).toEqual(draft);
  expect(await repository.loadPublic("/blog/post")).toBeNull();
  expect((await readAllBuildContentPages(repository)).entries.map((value) => value.path)).toEqual([
    "/",
  ]);
  expect(await repository.publishedContentVersion()).toBe(version + 1);
  for (const table of ["content_blocks", "content_media_references"]) {
    expect(
      await count(
        sql,
        `select count(*) as count from ${table} where snapshot_id = ?`,
        "post-published",
      ),
    ).toBe(0);
  }
  expect(
    await count(sql, "select count(*) as count from content_snapshots where id = 'post-published'"),
  ).toBe(0);
  const pending = await sql.all<{ payload_json: string }>(
    "select payload_json from outbox_events where type = 'site.build.requested' and processed_at is null",
  );
  expect(pending).toHaveLength(1);
  expect(JSON.parse(pending[0]!.payload_json)).toMatchObject({ targetVersion: version + 1 });
  const listed = await repository.list({
    limit: 10,
    listFields: [],
    modelKey: contentModelKey("posts"),
    sort: "-updatedAt",
  });
  expect(listed.items[0]).toMatchObject({ id: "post", status: "draft" });
  expect(listed.items[0]).not.toHaveProperty("publishedSnapshotId");

  const afterFirst = await lifecycleState(sql);
  await expect(
    repository.unpublish(unpublishCommand("post", "post-published", 6)),
  ).rejects.toMatchObject({ code: "CONTENT_NOT_PUBLISHED" });
  expect(await lifecycleState(sql)).toEqual(afterFirst);

  await repository.unpublish(unpublishCommand("home", "home-published", 7));
  expect(await repository.loadPublic("/")).toBeNull();
  expect(await repository.load({ entryId: contentEntryId("home") })).not.toBeNull();
  expect(await repository.publishedContentVersion()).toBe(version + 2);

  await repository.publish(publish("post", 2, 8, "post-republished"));
  expect(await repository.loadPublic("/blog/changed")).toMatchObject({
    entry: { published: { id: "post-republished", title: "Changed" } },
  });
});

contract(
  "replays an idempotent unpublication from a second repository",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    const idempotency = {
      actorId: admin.id,
      fingerprint: publicationRequestFingerprint("unpublish-fingerprint"),
      key: publicationIdempotencyKey("unpublish-key"),
    };
    const command = { ...unpublishCommand("post", "post-published", 5), idempotency };
    const first = await repository.unpublish(command);
    expect(first.outcome).toBe("unpublished");
    const committed = await lifecycleState(sql);
    const replay = await harness.reopen().unpublish(command);
    expect(replay).toEqual({ entry: first.entry, outcome: "replayed", status: "unpublished" });
    expect(await lifecycleState(sql)).toEqual(committed);
    await expect(
      repository.unpublish({
        ...command,
        idempotency: { ...idempotency, fingerprint: publicationRequestFingerprint("other") },
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await sql.get("select scope, key from idempotency_records")).toEqual({
      key: "unpublish-key",
      scope: "unpublication:post:admin",
    });
  },
);

contract("rolls back unpublication at every injected checkpoint", async (runtime, expect) => {
  for (const checkpoint of UNPUBLICATION_CHECKPOINTS) {
    let armed = false;
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
      },
      resolveModel: resolveRoute,
    });
    await seedPublishedLifecycle(repository, sql);
    const before = await lifecycleState(sql);
    armed = true;
    await expect(
      repository.unpublish(unpublishCommand("post", "post-published", 5)),
      checkpoint,
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await lifecycleState(sql), checkpoint).toEqual(before);
  }
});

contract("reverts a changed draft to its publication", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedPublishedLifecycle(repository, sql);
  await repository.saveCompleteDraft(changedPost("post", 3));
  const before = await lifecycleState(sql);
  for (const command of [
    revertCommand("post", 1, "post-published"),
    revertCommand("post", 2, "other-published"),
  ]) {
    await expect(repository.revertDraft(command)).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    expect(await lifecycleState(sql)).toEqual(before);
  }

  const published = (await repository.load({ entryId: contentEntryId("post") }))!.published!;
  const result = await repository.revertDraft(revertCommand("post", 2, "post-published"));
  expect(result.status).toBe("reverted");
  expect(result.entry!.draft).toMatchObject({
    blocks: published.blocks,
    fields: published.fields,
    id: "post-draft",
    revision: 3,
    slug: "post",
    title: published.title,
    updatedAt: 20,
    updatedBy: { id: "editor" },
  });
  expect(result.entry!.published).toEqual({ ...published, revision: 3 });
  const referenceRows = (snapshotId: string) =>
    sql.all(
      "select source_key, field_path, media_id from content_media_references where snapshot_id = ? order by source_key, field_path",
      snapshotId,
    );
  expect(await referenceRows("post-draft")).toEqual(await referenceRows("post-published"));
  for (const table of ["published_routes", "published_state", "outbox_events"]) {
    expect(await sql.all(`select * from ${table} order by 1`)).toEqual(before[table]);
  }
  const listed = await repository.list({
    limit: 10,
    listFields: [],
    modelKey: contentModelKey("posts"),
    sort: "-updatedAt",
  });
  expect(listed.items[0]).toMatchObject({ id: "post", status: "published" });

  await repository.publish(publish("post", 3, 21, "post-published-2"));
  const republished = await lifecycleState(sql);
  await expect(
    repository.revertDraft(revertCommand("post", 3, "post-published")),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await lifecycleState(sql)).toEqual(republished);
  await repository.unpublish(unpublishCommand("home", "home-published", 22));
  const unpublished = await lifecycleState(sql);
  await expect(
    repository.revertDraft(revertCommand("home", 1, "home-published")),
  ).rejects.toMatchObject({ code: "CONTENT_NOT_PUBLISHED" });
  expect(await lifecycleState(sql)).toEqual(unpublished);
});

contract("rolls back a draft revert at every injected checkpoint", async (runtime, expect) => {
  for (const checkpoint of REVERT_CHECKPOINTS) {
    let armed = false;
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
      },
      resolveModel: resolveRoute,
    });
    await seedPublishedLifecycle(repository, sql);
    await repository.saveCompleteDraft(changedPost("post", 3));
    const before = await lifecycleState(sql);
    armed = true;
    await expect(
      repository.revertDraft(revertCommand("post", 2, "post-published")),
      checkpoint,
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await lifecycleState(sql), checkpoint).toEqual(before);
  }
});

contract("creates a duplicate only while the source revision matches", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  await seedMedia(sql, "media-1");
  await seedMedia(sql, "media-2");
  await repository.create({
    entry: heroEntry("post", "posts", 1),
    mediaReferences: references("post-block"),
  });
  await repository.saveCompleteDraft(changedPost("post", 2));
  const copy = entry("copy", "posts", {
    blocks: [heroBlock("copy-block", "media-1", "Copy")],
    fields: { image: "media-1", title: "Copy" },
    title: "post (copy)",
    updatedAt: 5,
  });
  const before = await lifecycleState(sql);
  await expect(
    repository.create({
      duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 1 },
      entry: copy,
      mediaReferences: references("copy-block"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await lifecycleState(sql)).toEqual(before);
  await expect(
    repository.create({
      duplicateOf: { entryId: contentEntryId("missing"), expectedRevision: 1 },
      entry: copy,
      mediaReferences: references("copy-block"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(await lifecycleState(sql)).toEqual(before);

  const created = await repository.create({
    duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 2 },
    entry: copy,
    mediaReferences: references("copy-block"),
  });
  expect(created).toMatchObject({ entry: { draft: { revision: 1, title: "post (copy)" } } });
  expect(created.entry!.draft).not.toHaveProperty("slug");
  expect(
    await count(
      sql,
      "select count(*) as count from content_media_references where snapshot_id = ?",
      "copy-draft",
    ),
  ).toBe(2);
  expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.revision).toBe(2);
});

contract("guards deletions by draft revision and publication identity", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  const post = entry("guarded-post", "posts", { slug: "guarded-post", updatedAt: 20 });
  await repository.create({ entry: post, mediaReferences: [] });
  const remove = (expectedRevision: number, at: number, expectedPublishedSnapshotId?: string) =>
    repository.delete({
      deletedAt: unixMilliseconds(at),
      deletedBy: editor,
      entryId: post.id,
      ...(expectedPublishedSnapshotId === undefined
        ? {}
        : { expectedPublishedSnapshotId: contentSnapshotId(expectedPublishedSnapshotId) }),
      expectedRevision,
    });
  await expect(remove(0, 21)).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await repository.load({ entryId: post.id })).not.toBeNull();

  await repository.publish(publish("guarded-post", 1, 22, "guarded-post-published"));
  const version = (await readAllBuildContentPages(repository)).version;
  await expect(remove(1, 23)).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  await expect(remove(2, 23, "guarded-post-published")).rejects.toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  expect((await readAllBuildContentPages(repository)).version).toBe(version);
  expect(await repository.loadPublic("/blog/guarded-post")).not.toBeNull();

  await expect(remove(1, 24, "guarded-post-published")).resolves.toEqual({ status: "deleted" });
  expect(await repository.load({ entryId: post.id })).toBeNull();
  expect(await repository.loadPublic("/blog/guarded-post")).toBeNull();
  expect(await repository.publishedContentVersion()).toBe(version + 1);
  for (const table of ["content_snapshots", "published_routes"]) {
    expect(await count(sql, `select count(*) as count from ${table}`)).toBe(0);
  }
  expect(
    JSON.parse(
      (await sql.get<{ payload_json: string }>("select payload_json from outbox_events"))!
        .payload_json,
    ),
  ).toMatchObject({ publishedSnapshotId: "guarded-post-published", targetVersion: version + 1 });
  await expect(remove(1, 25)).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

  await repository.create({
    entry: entry("draft-only", "posts", { updatedAt: 30 }),
    mediaReferences: [],
  });
  await repository.delete({
    deletedAt: unixMilliseconds(31),
    deletedBy: editor,
    entryId: contentEntryId("draft-only"),
    expectedRevision: 1,
  });
  expect(await repository.publishedContentVersion()).toBe(version + 1);
});

contract(
  "lists entries with derived status, totals, search, sorts, and bound cursors",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedUser(sql, "editor", "editor@example.test", "editor@example.test");
    const gone: Actor = { id: actorId("gone"), role: "editor" };
    const entries = [
      entry("e-zebra", "posts", {
        fields: { body: { type: "doc" }, category: "news" },
        slug: "zebra",
        title: "Zebra draft",
        updatedAt: 10,
      }),
      entry("e-apple", "posts", {
        fields: { rank: 2 },
        slug: "apple-launch",
        title: "apple launch",
        updatedAt: 11,
      }),
      entry("e-banana", "posts", {
        fields: { category: "design" },
        slug: "banana",
        title: "Banana Launch",
        updatedAt: 12,
        updatedBy: gone,
      }),
      entry("e-same-a", "posts", { slug: "same-a", title: "Same", updatedAt: 13 }),
      entry("e-same-b", "posts", { slug: "same-b", title: "same", updatedAt: 13 }),
      entry("e-literal", "posts", {
        slug: "literal",
        title: "100% _off_ 'deal'",
        updatedAt: 14,
        updatedBy: { id: actorId("system:content-sync"), role: "admin" },
      }),
    ];
    for (const value of entries) await repository.create({ entry: value, mediaReferences: [] });
    for (const [id, at] of [
      ["e-apple", 20],
      ["e-banana", 21],
    ] as const) {
      await repository.publish(publish(id, 1, at, `${id}-published`));
    }
    const base = {
      limit: 100,
      listFields: ["category", "rank", "body", "missing"],
      modelKey: contentModelKey("posts"),
      sort: "-updatedAt" as const,
    };
    expect((await repository.list(base)).totals).toEqual({
      all: 6,
      changed: 0,
      draft: 4,
      published: 2,
    });
    await repository.saveCompleteDraft(
      save("e-banana", 1, 30, {
        fields: { category: "design" },
        slug: "banana",
        title: "Banana Launch",
        updatedBy: gone,
      }),
    );
    const all = await repository.list(base);
    expect(all.totals).toEqual({ all: 6, changed: 1, draft: 4, published: 1 });
    const byId = new Map(all.items.map((item) => [String(item.id), item]));
    expect(byId.get("e-zebra")).toEqual({
      draftRevision: 1,
      id: "e-zebra",
      listValues: { category: "news" },
      modelKey: "posts",
      slug: "zebra",
      status: "draft",
      title: "Zebra draft",
      updatedAt: 10,
      updatedBy: { displayName: "editor@example.test", id: "editor" },
    });
    expect(byId.get("e-apple")).toMatchObject({
      listValues: { rank: 2 },
      publishedAt: 20,
      publishedSnapshotId: "e-apple-published",
      status: "published",
    });
    expect(byId.get("e-banana")).toMatchObject({
      publishedAt: 21,
      status: "changed",
      updatedBy: { displayName: "Unknown user", id: "gone" },
    });
    expect(byId.get("e-literal")!.updatedBy.displayName).toBe("System");

    const ids = async (input: Record<string, unknown>) =>
      (await repository.list({ ...base, ...input } as never)).items.map((item) => item.id);
    const search = await repository.list({ ...base, q: "launch", sort: "title" });
    expect(search.items.map((item) => item.id)).toEqual(["e-apple", "e-banana"]);
    expect(search.totals).toEqual({ all: 2, changed: 1, draft: 0, published: 1 });
    const filtered = await repository.list({ ...base, q: "launch", status: "changed" });
    expect(filtered.items.map((item) => item.id)).toEqual(["e-banana"]);
    expect(filtered.totals).toEqual(search.totals);
    expect(await ids({ q: "apple-l" })).toEqual(["e-apple"]);
    for (const [q, expected] of [
      ["%", ["e-literal"]],
      ["_off_", ["e-literal"]],
      ["'deal'", ["e-literal"]],
      ["o_f", []],
    ] as const) {
      expect(await ids({ q })).toEqual(expected);
    }

    const pageThrough = async (sort: string) => {
      const result: string[] = [];
      let after: string | undefined;
      do {
        const page = await repository.list({
          ...base,
          limit: 1,
          sort: sort as never,
          ...(after === undefined ? {} : { after: after as never }),
        });
        result.push(...page.items.map((item) => String(item.id)));
        after = page.nextCursor;
      } while (after !== undefined);
      return result;
    };
    // Publication advances the entry update time; never-published entries sort earliest.
    const expectedOrders = {
      "-publishedAt": ["e-banana", "e-apple", "e-zebra", "e-same-b", "e-same-a", "e-literal"],
      "-title": ["e-zebra", "e-same-b", "e-same-a", "e-banana", "e-apple", "e-literal"],
      "-updatedAt": ["e-banana", "e-apple", "e-literal", "e-same-b", "e-same-a", "e-zebra"],
      publishedAt: ["e-literal", "e-same-a", "e-same-b", "e-zebra", "e-apple", "e-banana"],
      title: ["e-literal", "e-apple", "e-banana", "e-same-a", "e-same-b", "e-zebra"],
      updatedAt: ["e-zebra", "e-same-a", "e-same-b", "e-literal", "e-apple", "e-banana"],
    };
    for (const [sort, expected] of Object.entries(expectedOrders)) {
      expect(await pageThrough(sort)).toEqual(expected);
      expect(await ids({ sort })).toEqual(expected);
    }

    const titlePage = await repository.list({ ...base, limit: 1, sort: "title" });
    for (const mismatch of [
      { sort: "-updatedAt" },
      { q: "launch", sort: "title" },
      { sort: "title", status: "draft" },
      { modelKey: contentModelKey("home"), sort: "title" },
    ]) {
      await expect(
        repository.list({ ...base, after: titlePage.nextCursor!, limit: 1, ...mismatch } as never),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    const forged = (value: unknown) =>
      base64Url({
        id: "e-apple",
        kind: JSON.stringify(["entries", "posts", "title", null, null]),
        value,
        version: 2,
      });
    await expect(
      repository.list({ ...base, after: forged(5) as never, sort: "title" }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await ids({ after: forged("apple launch"), sort: "title" })).toEqual([
      "e-banana",
      "e-same-a",
      "e-same-b",
      "e-zebra",
    ]);
    await expect(
      repository.list({
        ...base,
        after: base64Url({ id: "e-apple", kind: "admin", timestamp: 1, version: 1 }) as never,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(repository.list({ ...base, limit: 101 })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    await expect(
      repository.describeActors([
        actorId("editor"),
        actorId("system:content-sync"),
        actorId("gone"),
      ]),
    ).resolves.toEqual([
      { displayName: "editor@example.test", id: "editor" },
      { displayName: "System", id: "system:content-sync" },
      { displayName: "Unknown user", id: "gone" },
    ]);
    const many = Array.from({ length: 150 }, (_, index) => actorId(`actor-${index}`));
    expect((await repository.describeActors(many)).at(-1)).toEqual({
      displayName: "Unknown user",
      id: "actor-149",
    });
  },
);

contract(
  "lists media with search, type filter, sorts, bound cursors, and usage",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("outbox"),
      resolveModel: resolveRoute,
    });
    await seedModels(sql, "posts");
    await seedUser(sql, "editor", "Ada", "ada@example.test");
    for (const [id, filename, mimeType, size, createdAt, createdBy] of [
      ["m-a", "Cover.png", "image/png", 30, 10, "editor"],
      ["m-b", "cover-2.jpg", "image/jpeg", 10, 11, "gone"],
      ["m-c", "100% _off_ 'deal'.webp", "image/webp", 20, 12, "system:content-sync"],
      ["m-d", "banner.png", "image/png", 20, 12, "editor"],
      ["m-e", "cover.png", "image/png", 30, 10, "editor"],
    ] as const) {
      await repository.createMedia({
        createdAt: unixMilliseconds(createdAt),
        createdBy: actorId(createdBy),
        filename,
        height: 2,
        id: mediaId(id),
        mimeType,
        size,
        storageKey: `media/${id}`,
        width: 3,
      });
    }
    await expect(
      repository.createMedia({
        createdAt: unixMilliseconds(1),
        createdBy: actorId("editor"),
        filename: "dup.png",
        height: 1,
        id: mediaId("m-dup"),
        mimeType: "image/png",
        size: 1,
        storageKey: "media/m-a",
        width: 1,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    const base = { limit: 100, sort: "-createdAt" as const };
    const ids = async (input: Record<string, unknown>) =>
      (await repository.listMedia({ ...base, ...input } as never)).items.map(
        (item) => item.media.id,
      );
    const all = await repository.listMedia(base);
    const byId = new Map(all.items.map((item) => [String(item.media.id), item]));
    expect(byId.get("m-a")).toEqual({
      createdBy: { displayName: "Ada", id: "editor" },
      media: expect.objectContaining({ filename: "Cover.png", height: 2, width: 3 }),
      usageCount: 0,
    });
    expect(byId.get("m-b")!.createdBy).toEqual({ displayName: "Unknown user", id: "gone" });
    expect(byId.get("m-c")!.createdBy.displayName).toBe("System");
    expect(await ids({ q: "cover" })).toEqual(["m-b", "m-e", "m-a"]);
    expect(await ids({ q: "COVER", type: "image/png" })).toEqual(["m-e", "m-a"]);
    for (const [q, expected] of [
      ["%", ["m-c"]],
      ["_off_", ["m-c"]],
      ["'deal'", ["m-c"]],
      ["o_f", []],
    ] as const) {
      expect(await ids({ q })).toEqual(expected);
    }
    await expect(
      repository.listMedia({ ...base, type: "image/gif" as never }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

    const pageThrough = async (sort: string) => {
      const result: string[] = [];
      let after: string | undefined;
      do {
        const page = await repository.listMedia({
          limit: 1,
          sort: sort as never,
          ...(after === undefined ? {} : { after: after as never }),
        });
        result.push(...page.items.map((item) => String(item.media.id)));
        after = page.nextCursor;
      } while (after !== undefined);
      return result;
    };
    const expectedOrders = {
      "-createdAt": ["m-d", "m-c", "m-b", "m-e", "m-a"],
      "-filename": ["m-e", "m-a", "m-b", "m-d", "m-c"],
      "-size": ["m-e", "m-a", "m-d", "m-c", "m-b"],
      createdAt: ["m-a", "m-e", "m-b", "m-c", "m-d"],
      filename: ["m-c", "m-d", "m-b", "m-a", "m-e"],
      size: ["m-b", "m-c", "m-d", "m-a", "m-e"],
    };
    for (const [sort, expected] of Object.entries(expectedOrders)) {
      expect(await pageThrough(sort)).toEqual(expected);
      expect(await ids({ sort })).toEqual(expected);
    }
    const filenamePage = await repository.listMedia({ limit: 1, sort: "filename" });
    for (const mismatch of [
      { sort: "-createdAt" },
      { sort: "filename", type: "image/png" },
      { q: "cover", sort: "filename" },
    ]) {
      await expect(
        repository.listMedia({ after: filenamePage.nextCursor!, limit: 1, ...mismatch } as never),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    const forged = (fields: Record<string, unknown>) =>
      base64Url({
        id: "m-a",
        kind: JSON.stringify(["media", "filename", null, null]),
        value: "cover.png",
        version: 2,
        ...fields,
      });
    for (const after of [
      forged({ value: 10 }),
      forged({ version: 1 }),
      base64Url({ id: "m-a", kind: "media", timestamp: 10, version: 1 }),
      "not a cursor",
    ]) {
      await expect(
        repository.listMedia({ after: after as never, limit: 1, sort: "filename" }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    await expect(
      repository.listMedia({ after: forged({}) as never, limit: 1, sort: "filename" }),
    ).resolves.toMatchObject({ items: [{ media: { id: "m-e" } }] });

    const mediaBlock = (key: string, type: string, position: number, image: string) => ({
      data: { image },
      hidden: false,
      key: blockKey(key),
      position,
      schemaVersion: 1,
      settings: {},
      type,
    });
    const published = entry("e-one", "posts", {
      blocks: [
        mediaBlock("hero-1", "hero", 1000, "m-a"),
        mediaBlock("gallery-1", "gallery", 2000, "m-a"),
      ],
      fields: { cover: "m-a" },
      slug: "e-one",
      title: "Title e-one",
      updatedAt: 20,
    });
    await repository.create({
      entry: published,
      mediaReferences: [
        { fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("hero-1") },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
      ],
    });
    await repository.publish(publish("e-one", 1, 30, "e-one-published"));
    await repository.saveCompleteDraft(
      save("e-one", 1, 40, {
        blocks: [mediaBlock("gallery-1", "carousel", 1000, "m-a")],
        fields: { cover: "m-d" },
        mediaReferences: [
          { fieldPath: "cover", mediaId: mediaId("m-d"), sourceKey: "$fields" },
          { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
        ],
        slug: "e-one",
        title: "Title e-one",
      }),
    );
    await repository.create({
      entry: entry("e-two", "posts", {
        fields: { cover: "m-a" },
        slug: "e-two",
        title: "Title e-two",
        updatedAt: 50,
      }),
      mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" }],
    });
    expect((await repository.loadMediaCatalogItem("m-a"))!.usageCount).toBe(2);
    expect((await repository.loadMediaCatalogItem("m-d"))!.usageCount).toBe(1);
    expect((await repository.loadMediaCatalogItem("m-b"))!.usageCount).toBe(0);
    await expect(repository.loadMediaCatalogItem("missing")).resolves.toBeNull();
    expect(
      new Map((await repository.listMedia(base)).items.map((i) => [i.media.id, i.usageCount])),
    ).toEqual(
      new Map([
        ["m-a", 2],
        ["m-b", 0],
        ["m-c", 0],
        ["m-d", 1],
        ["m-e", 0],
      ]),
    );
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("m-a") })).toEqual([
      {
        entryId: "e-two",
        locations: [{ field: "cover", source: "field", states: ["draft"] }],
        modelKey: "posts",
        slug: "e-two",
        status: "draft",
        title: "Title e-two",
      },
      {
        entryId: "e-one",
        locations: [
          { field: "cover", source: "field", states: ["published"] },
          {
            blockKey: "gallery-1",
            blockType: "carousel",
            field: "image",
            source: "block",
            states: ["draft", "published"],
          },
          {
            blockKey: "hero-1",
            blockType: "hero",
            field: "image",
            source: "block",
            states: ["published"],
          },
        ],
        modelKey: "posts",
        slug: "e-one",
        status: "changed",
        title: "Title e-one",
      },
    ]);
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("m-d") })).toEqual([
      expect.objectContaining({
        entryId: "e-one",
        locations: [{ field: "cover", source: "field", states: ["draft"] }],
      }),
    ]);
    expect(
      (await repository.loadMediaUsage({ limit: 1, mediaId: mediaId("m-a") })).map(
        (value) => value.entryId,
      ),
    ).toEqual(["e-two"]);
    for (const limit of [0, 51]) {
      await expect(
        repository.loadMediaUsage({ limit, mediaId: mediaId("m-a") }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }

    const outboxCount = () =>
      count(
        sql,
        "select count(*) as count from outbox_events where type = 'media.delete.requested'",
      );
    const request = (id: string) => ({
      mediaId: mediaId(id),
      requestedAt: unixMilliseconds(60),
      requestedBy: editor,
    });
    await expect(repository.markForDeletion(request("m-a"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    await expect(repository.retryDeletion(request("m-a"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await sql.run("update media set status = 'delete_failed' where id = 'm-d'");
    await expect(repository.retryDeletion(request("m-d"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    expect(await outboxCount()).toBe(0);
    await expect(repository.markForDeletion(request("m-b"))).resolves.toMatchObject({
      media: { id: "m-b", status: "deleting", updatedAt: 60 },
      status: "deleting",
    });
    await expect(repository.markForDeletion(request("m-b"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await expect(repository.markForDeletion(request("missing"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await outboxCount()).toBe(1);
    expect(
      JSON.parse(
        (await sql.get<{ payload_json: string }>(
          "select payload_json from outbox_events where type = 'media.delete.requested'",
        ))!.payload_json,
      ),
    ).toEqual({ mediaId: "m-b", requestedBy: "editor" });
    expect((await repository.loadMedia("m-a"))!.status).toBe("active");
  },
);

/** Identical lifecycle cases every SQL runtime adapter must pass. */
contract("build diagnostics persist safely across recovery and retry", async (runtime, expect) => {
  const { repository, sql, reopen } = await runtime.open({ resolveModel: noModels });
  const request = await repository.requestBuild({
    requestedAt: unixMilliseconds(1),
    requestedBy: admin,
  });
  const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5001) });
  await repository.recordSiteBuildFailure({
    leaseId: lease!.id,
    now: unixMilliseconds(5002),
    reason: "source_symlink",
    path: "src/linked.astro",
    terminal: false,
    retryAt: unixMilliseconds(6000),
  });
  expect(await repository.getSiteBuild(lease!.buildId)).toMatchObject({
    status: "pending",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  expect(await reopen().getSiteBuild(lease!.buildId)).toMatchObject({
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  expect(
    await sql.get("select last_error from outbox_events where id = ?", request.eventId),
  ).toEqual({ last_error: "source_symlink" });
  const [retryLease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(6000) });
  await expect(
    repository.recordSiteBuildFailure({
      leaseId: lease!.id,
      now: unixMilliseconds(6001),
      reason: "source_missing",
      path: "package.json",
      terminal: true,
    }),
  ).rejects.toThrow();
  await repository.recordSiteBuildFailure({
    leaseId: retryLease!.id,
    now: unixMilliseconds(6001),
    reason: "source_symlink",
    path: "src/linked.astro",
    terminal: true,
  });
  const newRequest = await repository.requestBuild({
    requestedAt: unixMilliseconds(7000),
    requestedBy: admin,
    retryOfBuildId: lease!.buildId,
  });
  const [newLease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(12000) });
  await repository.recordSiteBuildSuccess({ leaseId: newLease!.id, now: unixMilliseconds(12001) });
  expect(await repository.getSiteBuild(newLease!.buildId)).not.toHaveProperty("error");
  expect(await repository.getSiteBuild(newLease!.buildId)).not.toHaveProperty("errorPath");
  expect(newRequest.eventId).not.toBe(request.eventId);
  expect(await repository.getSiteBuild(lease!.buildId)).toMatchObject({
    status: "failed",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
});

for (const fault of ["mutation", "commit"] as const) {
  contract(
    `rolls back publication after actual SQL ${fault} failure and retries safely`,
    async (runtime, expect) => {
      const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
      await seedModels(sql, "posts");
      await seedMedia(sql, "media-1");
      await repository.create({
        entry: heroEntry("post", "posts", 1),
        mediaReferences: references("post-block"),
      });
      if (fault === "commit") {
        await sql.run(
          "create table fault_commit (entry_id text references content_entries(id) deferrable initially deferred)",
        );
        await sql.run(
          "create trigger injected_sql_failure after insert on published_routes begin insert into fault_commit values ('missing-entry'); end",
        );
      } else {
        await sql.run(
          "create trigger injected_sql_failure before insert on published_routes begin select raise(abort, 'injected SQL failure'); end",
        );
      }
      const tables = [
        "content_entries",
        "content_snapshots",
        "content_blocks",
        "content_media_references",
        "published_routes",
        "published_state",
        "outbox_events",
        "site_builds",
        "idempotency_records",
        "mutation_guards",
      ];
      const snapshot = () =>
        Promise.all(
          tables.map(async (table) => [
            table,
            await sql.all(`select * from ${table} order by rowid`),
          ]),
        );
      const before = await snapshot();
      await expect(repository.publish(publish("post", 1, 2, "published"))).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
      expect(await snapshot()).toEqual(before);
      if (fault === "commit") expect(await sql.all("select * from fault_commit")).toEqual([]);
      await sql.run("drop trigger injected_sql_failure");
      await repository.publish(publish("post", 1, 3, "retry-published"));
      expect((await repository.load({ entryId: contentEntryId("post") }))?.published).toBeDefined();
      expect(await count(sql, "select count(*) as count from published_routes")).toBe(1);
    },
  );
}

contract(
  "bulk metadata reads deduplicate IDs, cross chunks and preserve missing/inactive state",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: () => undefined });
    for (let index = 0; index < 201; index++)
      await seedMedia(sql, `bulk-${index}`, index === 200 ? "deleting" : "active");
    expect(await repository.loadMediaMany([])).toEqual([]);
    const records = await repository.loadMediaMany([
      ...Array.from({ length: 201 }, (_, index) => `bulk-${index}`),
      "bulk-0",
      "missing",
    ]);
    expect(records).toHaveLength(201);
    expect(new Set(records.map((record) => record.id)).size).toBe(201);
    expect(records.find((record) => record.id === "bulk-200")?.status).toBe("deleting");
    expect(records.filter((record) => record.status === "active")).toHaveLength(200);
  },
);

/** A real normalized `posts` model (with canonical structure) for schema-evolution cases. */
async function evolvingPosts(
  overrides: Partial<CollectionModelInput> = {},
  blocks: readonly BlockDefinition[] = Object.values(builtInBlocks),
): Promise<NormalizedContentModel> {
  const config = await defineConfig({
    blocks,
    content: [
      defineCollection({
        blocks: ["richText", "image", "quote"],
        fields: { summary: field.text({ maxLength: 100 }) },
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        ...overrides,
      } as CollectionModelInput),
    ],
  });
  return config.runtime.content[0]!;
}

function richTextBlock(key: string) {
  return Object.freeze({
    data: { content: { content: [], type: "doc" } },
    hidden: false,
    key: blockKey(key),
    position: 1000,
    schemaVersion: 1,
    settings: {},
    type: "richText",
  });
}

/** Seeds one draft-only and one published `posts` entry through the repository. */
async function seedEvolvingEntries(
  repository: ContractRepository,
  fields: { readonly draft: JsonObject; readonly published: JsonObject },
  blocks: readonly ContentBlock[] = [],
): Promise<void> {
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks,
      fields: fields.draft,
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [],
  });
  await repository.create({
    entry: entry("live", "posts", {
      fields: fields.published,
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
}

async function syncEvidenceState(sql: ContractSql) {
  return {
    models: await sql.all(
      "select key, config_version, structure_hash, structure_json is not null as has_baseline from content_models order by key",
    ),
    outbox: await count(sql, "select count(*) as count from outbox_events"),
    snapshots: await sql.all(
      "select id, revision, fields_json, updated_at from content_snapshots order by id",
    ),
    version: (await sql.get<{ version: number }>("select version from published_state"))?.version,
  };
}

contract(
  "evolves a populated model with compatible changes and backfills defaults",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    expect(
      await sql.get(
        "select structure_json_hash = structure_hash as valid from content_models where key = 'posts'",
      ),
    ).toEqual({ valid: 1 });
    await seedEvolvingEntries(repository, { draft: { summary: "a" }, published: { summary: "b" } });
    const before = await syncEvidenceState(sql);

    const v2 = await evolvingPosts({
      blocks: ["richText", "image", "quote", "cta"],
      fields: {
        extra: field.text(),
        flag: field.text({ defaultValue: "on", required: true }),
        mandatory: field.text({ required: true }),
        summary: field.text({ maxLength: 200 }),
      },
      version: 2,
    });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [
        {
          action: "version-update",
          evolution: { backfills: ["flag"], snapshots: { draft: 2, published: 1 } },
        },
      ],
    });
    await expect(applySync(repository, [v2], 30, prepared)).resolves.toMatchObject({
      status: "applied",
      targetVersion: before.version! + 1,
    });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    const draftOnly = await repository.load({ entryId: contentEntryId("draft-only") });
    const live = await repository.load({ entryId: contentEntryId("live") });
    expect(draftOnly!.draft).toMatchObject({ fields: { flag: "on", summary: "a" }, revision: 1 });
    expect(live!.draft).toMatchObject({ fields: { flag: "on", summary: "b" }, revision: 1 });
    expect(live!.published).toMatchObject({ fields: { flag: "on", summary: "b" }, revision: 1 });
    expect(draftOnly!.draft.updatedAt).toBe(20);
    expect(await sql.get("select config_version from content_models")).toEqual({
      config_version: 2,
    });
    await expect(applySync(repository, [v2], 31)).resolves.toMatchObject({ status: "noop" });
  },
);

contract(
  "refuses a failing tightening by naming snapshots and applies a satisfied one",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(repository, {
      draft: { summary: "far too long" },
      published: { summary: "also long" },
    });
    const before = await syncEvidenceState(sql);

    const tight = await evolvingPosts({
      fields: { summary: field.text({ maxLength: 3 }) },
      version: 2,
    });
    const refused = await prepareConfigurationSynchronization({
      models: [tight],
      state: repository,
    });
    expect(refused.plan.isValid).toBe(false);
    expect(refused.plan.diagnostics).toMatchObject([
      {
        affectedCount: 3,
        code: "CONSTRAINT_VIOLATED",
        fieldKey: "summary",
        snapshots: [
          { entryId: "draft-only", state: "draft", title: "Draft" },
          { entryId: "live", state: "draft", title: "Live" },
          { entryId: "live", state: "published", title: "Live" },
        ],
      },
    ]);
    await expect(applySync(repository, [tight], 30, refused)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await syncEvidenceState(sql)).toEqual(before);

    const satisfied = await evolvingPosts({
      fields: { summary: field.text({ maxLength: 20, required: true }) },
      version: 2,
    });
    await expect(applySync(repository, [satisfied], 31)).resolves.toMatchObject({
      status: "applied",
    });
    expect((await syncEvidenceState(sql)).snapshots).toEqual(before.snapshots);
  },
);

contract(
  "removes unused fields and block types but refuses removing or changing stored data",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      fields: { legacy: field.text(), summary: field.text() },
    });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(
      repository,
      { draft: { summary: "a" }, published: { summary: "b" } },
      [richTextBlock("text-1")],
    );

    const pruned = await evolvingPosts({
      blocks: ["richText", "image"],
      fields: { summary: field.text() },
      version: 2,
    });
    await expect(applySync(repository, [pruned], 30)).resolves.toMatchObject({
      status: "applied",
    });
    const before = await syncEvidenceState(sql);

    const richTextV2 = defineBlock({
      fields: { content: field.richText({ required: true }), lead: field.text() },
      type: "richText",
      version: 2,
    });
    const destructive = await evolvingPosts(
      { blocks: ["image"], fields: {}, version: 3 },
      Object.values(builtInBlocks),
    );
    const plan = await prepareConfigurationSynchronization({
      models: [destructive],
      state: repository,
    });
    expect(plan.plan.diagnostics).toMatchObject([
      { blockType: "richText", code: "BLOCK_TYPE_REMOVAL_HAS_BLOCKS", affectedCount: 1 },
      { code: "FIELD_REMOVAL_HAS_DATA", fieldKey: "summary", affectedCount: 3 },
    ]);

    const withRichText = (definition: BlockDefinition) => [
      ...Object.values(builtInBlocks).filter((block) => block.type !== "richText"),
      definition,
    ];
    const richTextSameVersion = defineBlock({
      fields: { content: field.richText({ required: true }), lead: field.text() },
      type: "richText",
      version: 1,
    });
    const unversioned = await evolvingPosts(
      { blocks: ["richText", "image"], fields: { summary: field.text() }, version: 3 },
      withRichText(richTextSameVersion),
    );
    const migration = await prepareConfigurationSynchronization({
      models: [unversioned],
      state: repository,
    });
    expect(migration.plan.diagnostics).toMatchObject([
      {
        blockType: "richText",
        code: "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS",
        changeClass: "migration",
      },
    ]);
    expect(migration.plan.diagnostics[0]!.message).toContain(
      "Increase the block version and declare migrations.",
    );
    await expect(applySync(repository, [unversioned], 31, migration)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    const missingConfig = await defineConfig({
      blocks: withRichText(richTextV2),
      content: [
        defineCollection({
          blocks: ["richText", "image"],
          fields: { summary: field.text() },
          key: "posts",
          route: "/blog/:slug",
          version: 3,
        }),
      ],
    });
    const missing = await prepareConfigurationSynchronization({
      blocks: missingConfig.runtime.blocks,
      models: missingConfig.runtime.content,
      state: repository,
    });
    expect(missing.plan.diagnostics).toMatchObject([
      { affectedCount: 1, blockType: "richText", code: "BLOCK_MIGRATION_MISSING" },
    ]);
    expect(missing.plan.diagnostics[0]!.snapshots).toMatchObject([
      { blockKey: "text-1", entryId: "draft-only", schemaVersion: 1, state: "draft" },
    ]);
    expect(await syncEvidenceState(sql)).toEqual(before);
  },
);

contract(
  "prepares check plans without writing and rejects them after a concurrent draft save",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(repository, { draft: {}, published: {} });
    const before = await syncEvidenceState(sql);

    const v2 = await evolvingPosts({
      fields: { flag: field.text({ defaultValue: "on" }), summary: field.text({ maxLength: 50 }) },
      version: 2,
    });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.report.check.exitCode).toBe(1);
    expect(prepared.report.text).toContain("planned backfills: flag");
    expect(prepared.report.text).toContain("validated field-changed field summary");
    expect(await syncEvidenceState(sql)).toEqual(before);

    await repository.saveCompleteDraft(save("draft-only", 1, 40));
    await expect(applySync(repository, [v2], 41, prepared)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    const after = await syncEvidenceState(sql);
    expect(after.models).toEqual(before.models);
    expect(after.version).toBe(before.version);
    expect(after.outbox).toBe(before.outbox);
    expect(after.snapshots.some((row) => String(row.fields_json).includes("flag"))).toBe(false);
  },
);

contract(
  "records baselines for upgraded installations without a build, then evolves",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(repository, { draft: {}, published: {} });
    await sql.run("update content_models set structure_json = null, structure_json_hash = null");
    const v2 = await evolvingPosts({
      fields: { extra: field.text(), summary: field.text({ maxLength: 100 }) },
      version: 2,
    });

    const strict = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(strict.plan.diagnostics).toMatchObject([{ code: "STRUCTURE_BASELINE_MISSING" }]);
    expect(strict.plan.diagnostics[0]!.message).toContain("Restore the previous definition");

    const before = await syncEvidenceState(sql);
    const baseline = await prepareConfigurationSynchronization({ models: [v1], state: repository });
    expect(baseline.plan.operations).toMatchObject([{ action: "record-baseline" }]);
    await expect(applySync(repository, [v1], 30, baseline)).resolves.toMatchObject({
      status: "applied",
    });
    const recorded = await syncEvidenceState(sql);
    expect(recorded.version).toBe(before.version);
    expect(recorded.outbox).toBe(before.outbox);
    expect(recorded.models).toMatchObject([{ has_baseline: 1 }]);
    await expect(applySync(repository, [v2], 31)).resolves.toMatchObject({ status: "applied" });

    await sql.run("update content_models set structure_hash = 'written-by-older-engine'");
    expect((await repository.readConfigurationSyncState())[0]).not.toHaveProperty("structure");
  },
);

contract(
  "accepts a legacy structural hash once when fields use display-like keys",
  async (runtime, expect) => {
    const described = await evolvingPosts({ fields: { description: field.textarea() } });
    expect(described.legacyStructureHash).toEqual(expect.any(String));
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([described]) });
    await applySync(repository, [described], 10);
    await seedEvolvingEntries(repository, { draft: {}, published: {} });
    await sql.run(
      "update content_models set structure_hash = ?, structure_json = null, structure_json_hash = null",
      described.legacyStructureHash,
    );
    const prepared = await prepareConfigurationSynchronization({
      models: [described],
      state: repository,
    });
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [{ action: "record-baseline" }],
    });
    await applySync(repository, [described], 20, prepared);
    expect(await sql.get("select structure_hash from content_models")).toEqual({
      structure_hash: described.structureHash,
    });
    await expect(applySync(repository, [described], 21)).resolves.toMatchObject({
      status: "noop",
    });
  },
);

function block(key: string, type: string, position: number, data: JsonObject) {
  return Object.freeze({
    data,
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type,
  });
}

/** Seeds hinted-rewrite content: two media fields, an image block and a quote block. */
async function seedHintedEntries(repository: ContractRepository, sql: ContractSql): Promise<void> {
  for (const id of ["m-1", "m-2", "m-3"]) await seedMedia(sql, id);
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [
        richTextBlock("text-1"),
        block("img-1", "image", 2000, { alt: "Alt", media: "m-2" }),
        block("quote-1", "quote", 3000, { quote: "Q" }),
      ],
      fields: { cover: "m-1", headline: "Draft head", keep: "k", thumb: "m-3" },
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [
      { fieldPath: "cover", mediaId: mediaId("m-1"), sourceKey: "$fields" },
      { fieldPath: "thumb", mediaId: mediaId("m-3"), sourceKey: "$fields" },
      { fieldPath: "media", mediaId: mediaId("m-2"), sourceKey: blockKey("img-1") },
    ],
  });
  await repository.create({
    entry: entry("live", "posts", {
      fields: { cover: "m-1", headline: "Live head" },
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-1"), sourceKey: "$fields" }],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
}

async function hintedState(sql: ContractSql) {
  return {
    ...(await syncEvidenceState(sql)),
    blocks: await sql.all(
      "select snapshot_id, block_key, block_type, position, data_json from content_blocks order by snapshot_id, position",
    ),
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
  };
}

const hintedFieldsV1 = {
  cover: field.media(),
  headline: field.text(),
  keep: field.text(),
  thumb: field.media(),
};

contract(
  "renames, prunes and drops hinted data with its media references",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({ fields: hintedFieldsV1 });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedHintedEntries(repository, sql);
    const request = (id: string) => ({
      mediaId: mediaId(id),
      requestedAt: unixMilliseconds(40),
      requestedBy: editor,
    });
    await expect(repository.markForDeletion(request("m-3"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    const usage = (id: string) =>
      repository.loadMediaCatalogItem(id).then((item) => item!.usageCount);
    const coverUsage = await usage("m-1");
    const before = await hintedState(sql);

    const v2 = await evolvingPosts({
      blocks: ["richText", "quote"],
      fields: {
        heroImage: field.media({ renamedFrom: "cover" }),
        keep: field.text(),
        title: field.text({ renamedFrom: "headline" }),
      },
      removedBlocks: ["image"],
      removedFields: ["thumb"],
      version: 2,
    });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [
        {
          action: "version-update",
          evolution: {
            blockRemovals: ["image"],
            fieldRemovals: ["thumb"],
            renames: [
              { from: "cover", to: "heroImage" },
              { from: "headline", to: "title" },
            ],
          },
        },
      ],
    });
    expect(prepared.report.text).toContain(
      "planned renames: cover -> heroImage, headline -> title",
    );
    expect(prepared.report.text).toContain("planned field removals: thumb");
    expect(prepared.report.text).toContain("planned block removals: image");
    expect(await hintedState(sql)).toEqual(before);

    await expect(applySync(repository, [v2], 30, prepared)).resolves.toMatchObject({
      status: "applied",
      targetVersion: before.version! + 1,
    });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    const draftOnly = await repository.load({ entryId: contentEntryId("draft-only") });
    const live = await repository.load({ entryId: contentEntryId("live") });
    expect(draftOnly!.draft).toMatchObject({
      fields: { heroImage: "m-1", keep: "k", title: "Draft head" },
      revision: 1,
      updatedAt: 20,
    });
    expect(draftOnly!.draft.fields).not.toHaveProperty("thumb");
    expect(draftOnly!.draft.fields).not.toHaveProperty("headline");
    expect(draftOnly!.draft.blocks.map((value) => [value.key, value.type, value.position])).toEqual(
      [
        ["text-1", "richText", 1000],
        ["quote-1", "quote", 3000],
      ],
    );
    expect(live!.published).toMatchObject({
      fields: { heroImage: "m-1", title: "Live head" },
      revision: 1,
    });
    expect(live!.published!.fields).not.toHaveProperty("cover");

    expect(await usage("m-1")).toBe(coverUsage);
    expect(await usage("m-2")).toBe(0);
    expect(await usage("m-3")).toBe(0);
    expect(
      await sql.all(
        "select distinct field_path from content_media_references where media_id = 'm-1'",
      ),
    ).toEqual([{ field_path: "heroImage" }]);
    await expect(repository.markForDeletion(request("m-3"))).resolves.toMatchObject({
      status: "deleting",
    });

    await expect(applySync(repository, [v2], 31)).resolves.toMatchObject({ status: "noop" });
    const settled = await hintedState(sql);
    const v3 = await evolvingPosts({
      blocks: ["richText", "quote"],
      fields: {
        extra: field.text(),
        heroImage: field.media({ renamedFrom: "cover" }),
        keep: field.text(),
        title: field.text({ renamedFrom: "headline" }),
      },
      removedBlocks: ["image"],
      removedFields: ["thumb"],
      version: 3,
    });
    const inert = await prepareConfigurationSynchronization({ models: [v3], state: repository });
    expect(inert.plan.operations).toMatchObject([
      {
        action: "version-update",
        evolution: { changes: [{ kind: "field-added", target: "extra" }] },
      },
    ]);
    await applySync(repository, [v3], 32, inert);
    const after = await hintedState(sql);
    expect(after.snapshots).toEqual(settled.snapshots);
    expect(after.blocks).toEqual(settled.blocks);
    expect(after.references).toEqual(settled.references);
  },
);

contract(
  "refuses unhinted removals of stored data and renames onto stored data",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({ fields: hintedFieldsV1 });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedHintedEntries(repository, sql);
    const before = await hintedState(sql);

    const unhinted = await evolvingPosts({
      blocks: ["richText", "quote"],
      fields: { cover: field.media(), headline: field.text(), keep: field.text() },
      version: 2,
    });
    const refused = await prepareConfigurationSynchronization({
      models: [unhinted],
      state: repository,
    });
    expect(refused.plan.diagnostics).toMatchObject([
      {
        affectedCount: 1,
        blockType: "image",
        code: "BLOCK_TYPE_REMOVAL_HAS_BLOCKS",
        snapshots: [{ entryId: "draft-only", state: "draft", title: "Draft" }],
      },
      {
        affectedCount: 1,
        code: "FIELD_REMOVAL_HAS_DATA",
        fieldKey: "thumb",
        snapshots: [{ entryId: "draft-only", state: "draft", title: "Draft" }],
      },
    ]);
    expect(refused.report.text).toContain('removedBlocks: ["image"]');
    expect(refused.report.text).toContain('removedFields: ["thumb"]');
    await expect(applySync(repository, [unhinted], 30, refused)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await hintedState(sql)).toEqual(before);

    // A stray stored value under the new key blocks the move instead of being overwritten.
    await sql.run(
      "update content_snapshots set fields_json = json_set(fields_json, '$.title', 'stray') where id = 'live-published'",
    );
    const stray = await hintedState(sql);
    const renamed = await evolvingPosts({
      fields: {
        cover: field.media(),
        keep: field.text(),
        thumb: field.media(),
        title: field.text({ renamedFrom: "headline" }),
      },
      version: 2,
    });
    const onto = await prepareConfigurationSynchronization({
      models: [renamed],
      state: repository,
    });
    expect(onto.plan.diagnostics).toMatchObject([
      {
        affectedCount: 1,
        code: "FIELD_RENAME_TARGET_HAS_DATA",
        fieldKey: "title",
        snapshots: [{ entryId: "live", state: "published" }],
      },
    ]);
    await expect(applySync(repository, [renamed], 31, onto)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await hintedState(sql)).toEqual(stray);
  },
);

contract("renames a model and one of its fields in one apply", async (runtime, expect) => {
  const v1 = await evolvingPosts({ fields: hintedFieldsV1 });
  const articles = await evolvingPosts({
    fields: {
      cover: field.media(),
      keep: field.text(),
      thumb: field.media(),
      title: field.text({ renamedFrom: "headline" }),
    },
    key: "articles",
    renamedFrom: "posts",
    version: 2,
  });
  const { repository, sql } = await runtime.open({
    resolveModel: syncResolver([v1, articles]),
  });
  await applySync(repository, [v1], 10);
  await seedHintedEntries(repository, sql);

  const prepared = await prepareConfigurationSynchronization({
    models: [articles],
    state: repository,
  });
  expect(prepared.plan.operations).toMatchObject([
    {
      action: "rename",
      evolution: { renames: [{ from: "headline", to: "title" }] },
      renamedFrom: "posts",
    },
  ]);
  await expect(applySync(repository, [articles], 30, prepared)).resolves.toMatchObject({
    status: "applied",
  });
  expect(await sql.all("select model_key from content_entries order by id")).toEqual([
    { model_key: "articles" },
    { model_key: "articles" },
  ]);
  const live = await repository.load({ entryId: contentEntryId("live") });
  expect(live!.published!.fields).toEqual({ cover: "m-1", title: "Live head" });
});

const noteV1 = defineBlock({
  fields: { body: field.text({ required: true }), image: field.media() },
  type: "note",
  version: 1,
});

function noteV3(migrations: BlockMigrations = {}): BlockDefinition {
  return defineBlock({
    fields: { cover: field.media(), text: field.text({ required: true }) },
    migrations: {
      2: ({ data: { body, image, ...rest } }) => ({
        data: {
          ...rest,
          ...(image === undefined ? {} : { cover: image }),
          ...(body === undefined ? {} : { quote: body }),
        },
      }),
      3: ({ data: { quote, ...rest } }) => ({
        data: quote === undefined ? rest : { ...rest, text: quote },
      }),
      ...migrations,
    },
    type: "note",
    version: 3,
  });
}

/** A `posts` configuration whose blocks include one `note` definition. */
async function noteConfig(note: BlockDefinition, version: number) {
  return defineConfig({
    blocks: [...Object.values(builtInBlocks), note],
    content: [
      defineCollection({
        blocks: ["richText", "note"],
        fields: { summary: field.text() },
        key: "posts",
        route: "/blog/:slug",
        version,
      }),
    ],
  });
}

type NoteConfig = Awaited<ReturnType<typeof noteConfig>>;

async function prepareNotes(repository: ContractRepository, config: NoteConfig) {
  return prepareConfigurationSynchronization({
    blocks: config.runtime.blocks,
    models: config.runtime.content,
    state: repository,
  });
}

async function syncNotes(
  repository: ContractRepository,
  config: NoteConfig,
  at: number,
  prepared?: Awaited<ReturnType<typeof prepareNotes>>,
) {
  return applyPreparedConfigurationSynchronization({
    blocks: config.runtime.blocks,
    clock: { now: () => unixMilliseconds(at) },
    ids: { next: sequence(`sync-${at}`) },
    models: config.runtime.content,
    prepared: prepared ?? (await prepareNotes(repository, config)),
    target: repository,
  });
}

function note(key: string, data: JsonObject, position = 2000) {
  return Object.freeze({
    data,
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type: "note",
  });
}

/**
 * Seeds a draft-only entry with a media-holding note, a published entry in
 * sync with its draft, and a published entry with a newer draft.
 */
async function seedNoteEntries(repository: ContractRepository, sql: ContractSql): Promise<void> {
  for (const id of ["m-1", "m-2"]) await seedMedia(sql, id);
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [richTextBlock("text-1"), note("n1", { body: "Draft note", image: "m-1" })],
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [{ fieldPath: "image", mediaId: mediaId("m-1"), sourceKey: blockKey("n1") }],
  });
  await repository.create({
    entry: entry("live", "posts", {
      blocks: [note("n1", { body: "Live" })],
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
  await repository.create({
    entry: entry("changed", "posts", {
      blocks: [note("n1", { body: "Old" })],
      slug: "changed",
      title: "Changed",
      updatedAt: 23,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("changed", 1, 24, "changed-published"));
  await repository.saveCompleteDraft(
    save("changed", 1, 25, { blocks: [note("n1", { body: "New" })], slug: "changed" }),
  );
}

async function noteState(sql: ContractSql) {
  return {
    ...(await syncEvidenceState(sql)),
    blocks: await sql.all(
      "select snapshot_id, block_key, block_type, position, schema_version, data_json from content_blocks order by snapshot_id, position",
    ),
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
    updatedBy: await sql.all("select id, updated_by from content_snapshots order by id"),
  };
}

async function openNotes(runtime: RepositoryContractRuntime) {
  const v1 = await noteConfig(noteV1, 1);
  const harness = await runtime.open({ resolveModel: syncResolver(v1.runtime.content) });
  await syncNotes(harness.repository, v1, 10);
  await seedNoteEntries(harness.repository, harness.sql);
  return harness;
}

contract(
  "migrates stale blocks from version 1 to 3 in drafts and published snapshots",
  async (runtime, expect) => {
    const { repository, sql } = await openNotes(runtime);
    const before = await noteState(sql);
    const v3 = await noteConfig(noteV3(), 2);
    const prepared = await prepareNotes(repository, v3);
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [
        {
          action: "version-update",
          evolution: {
            migrations: [
              {
                blockType: "note",
                blocks: 5,
                draft: 3,
                fromVersions: [1],
                published: 2,
                toVersion: 3,
              },
            ],
          },
        },
      ],
    });
    expect(prepared.report.text).toContain(
      "planned block migrations: note 1 -> 3 (draft=3, published=2, blocks=5)",
    );
    expect(prepared.report.check.exitCode).toBe(1);
    expect(await noteState(sql)).toEqual(before);

    await expect(syncNotes(repository, v3, 30, prepared)).resolves.toMatchObject({
      migrated: { blocks: 5, drafts: 3, published: 2 },
      status: "applied",
      targetVersion: before.version! + 1,
    });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    expect(await sql.all("select config_version from content_models")).toEqual([
      { config_version: 2 },
    ]);

    const draftOnly = (await repository.load({ entryId: contentEntryId("draft-only") }))!;
    expect(draftOnly.draft).toMatchObject({
      revision: 2,
      updatedAt: 30,
      updatedBy: { id: "system:content-sync" },
    });
    expect(draftOnly.draft.blocks).toEqual([
      { ...richTextBlock("text-1") },
      {
        data: { cover: "m-1", text: "Draft note" },
        hidden: false,
        key: "n1",
        position: 2000,
        schemaVersion: 3,
        settings: {},
        type: "note",
      },
    ]);
    const live = (await repository.load({ entryId: contentEntryId("live") }))!;
    expect([live.draft.revision, live.published!.revision]).toEqual([2, 2]);
    expect(live.published).toMatchObject({ createdAt: 22, updatedBy: { id: "editor" } });
    const changed = (await repository.load({ entryId: contentEntryId("changed") }))!;
    expect([changed.draft.revision, changed.published!.revision]).toEqual([3, 1]);
    expect(changed.draft.blocks[0]!.data).toEqual({ text: "New" });
    expect(changed.published!.blocks[0]!.data).toEqual({ text: "Old" });

    const definition = v3.runtime.blocks.get("note")!;
    for (const value of [live.published!, changed.published!]) {
      for (const stored of value.blocks) {
        expect(stored.schemaVersion).toBe(definition.version);
        expect(() => validateBlockData(definition, stored.data, "publish")).not.toThrow();
      }
    }
    expect(
      await sql.all(
        "select snapshot_id, source_key, field_path from content_media_references where media_id = 'm-1'",
      ),
    ).toEqual([{ field_path: "cover", snapshot_id: "draft-only-draft", source_key: "n1" }]);
    expect((await repository.loadMediaCatalogItem("m-1"))!.usageCount).toBe(1);

    await expect(syncNotes(repository, v3, 31)).resolves.toMatchObject({ status: "noop" });
    await expect(repository.saveCompleteDraft(save("draft-only", 1, 40))).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
  },
);

contract(
  "refuses throwing, invalid and media-introducing migrations without writing",
  async (runtime, expect) => {
    const { repository, sql } = await openNotes(runtime);
    const before = await noteState(sql);
    const refusals = [
      [
        noteV3({
          3: () => {
            throw new Error("boom");
          },
        }),
        "BLOCK_MIGRATION_FAILED",
      ],
      [noteV3({ 3: () => ({ data: {} }) }), "BLOCK_MIGRATION_INVALID"],
      [
        noteV3({ 3: ({ data: { quote } }) => ({ data: { cover: "m-2", text: quote ?? "x" } }) }),
        "BLOCK_MIGRATION_INVALID",
      ],
    ] as const;
    for (const [definition, code] of refusals) {
      const config = await noteConfig(definition, 2);
      const prepared = await prepareNotes(repository, config);
      expect(prepared.plan.isValid).toBe(false);
      expect(prepared.plan.diagnostics).toMatchObject([{ blockType: "note", code }]);
      await expect(syncNotes(repository, config, 30, prepared)).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
    }
    const invalid = await prepareNotes(
      repository,
      await noteConfig(noteV3({ 3: () => ({ data: {} }) }), 2),
    );
    // Drafts validate in draft mode; only published snapshots lack the required text.
    expect(invalid.plan.diagnostics[0]).toMatchObject({ affectedCount: 2 });
    expect(invalid.plan.diagnostics[0]!.snapshots).toMatchObject([
      { blockKey: "n1", entryId: "changed", path: "data.text", state: "published" },
      { blockKey: "n1", entryId: "live", path: "data.text", state: "published" },
    ]);
    expect(await noteState(sql)).toEqual(before);
  },
);

contract(
  "resumes block migration and nested backfills after an interrupted synchronization",
  async (runtime, expect) => {
    const harness = await openNotes(runtime);
    const { repository, sql } = harness;
    const before = await noteState(sql);
    const v3 = await defineConfig({
      blocks: [...Object.values(builtInBlocks), noteV3()],
      content: [
        defineCollection({
          key: "posts",
          route: "/blog/:slug",
          version: 2,
          blocks: ["richText", "note"],
          fields: {
            summary: field.text(),
            profile: field.group({
              defaultValue: {},
              fields: { flag: field.text({ defaultValue: "on" }) },
            }),
          },
        }),
      ],
    });
    let checkpoints = 0;
    const failing = harness.reopen({
      beforeMutation: (name) => {
        if (name.startsWith("sync.migration.") && ++checkpoints === 3) {
          throw new Error("injected failure");
        }
      },
      resolveModel: syncResolver(v3.runtime.content),
    });
    await expect(syncNotes(failing, v3, 30)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    const interrupted = await noteState(sql);
    expect(interrupted.models).toEqual(before.models);
    expect(interrupted.version).toBe(before.version);
    expect(interrupted.outbox).toBe(before.outbox);
    expect(
      interrupted.snapshots.every(
        (row) => JSON.parse(row.fields_json as string).profile === undefined,
      ),
    ).toBe(true);

    await expect(syncNotes(repository, v3, 30)).resolves.toMatchObject({ status: "applied" });
    const resumed = await noteState(sql);
    expect(resumed.blocks.filter((row) => row.block_type === "note")).toEqual(
      resumed.blocks
        .filter((row) => row.block_type === "note")
        .map((row) => ({ ...row, schema_version: 3 })),
    );
    expect(resumed.snapshots.map((row) => [row.id, row.revision])).toEqual([
      ["changed-draft", 3],
      ["changed-published", 1],
      ["draft-only-draft", 2],
      ["live-draft", 2],
      ["live-published", 2],
    ]);
    expect(resumed.models).toMatchObject([{ config_version: 2, has_baseline: 1 }]);
    expect(resumed.version).toBe(before.version! + 1);
    for (const row of resumed.snapshots)
      expect(JSON.parse(row.fields_json as string).profile).toEqual({ flag: "on" });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    await expect(syncNotes(repository, v3, 31)).resolves.toMatchObject({ status: "noop" });
  },
);

contract(
  "stops block migration as stale when a draft is saved after the scan",
  async (runtime, expect) => {
    const { repository, sql } = await openNotes(runtime);
    const before = await noteState(sql);
    const v3 = await noteConfig(noteV3(), 2);
    const racing: ContractRepository = Object.assign(
      Object.create(repository) as ContractRepository,
      {
        async applyConfigurationSyncBlockMigrations(
          input: Parameters<ContractRepository["applyConfigurationSyncBlockMigrations"]>[0],
        ) {
          await repository.saveCompleteDraft(save("changed", 2, 26, { slug: "changed" }));
          return repository.applyConfigurationSyncBlockMigrations(input);
        },
      },
    );
    await expect(syncNotes(racing, v3, 30)).rejects.toThrow("stale");
    const stopped = await noteState(sql);
    expect(stopped.models).toEqual(before.models);
    expect(stopped.version).toBe(before.version);

    await expect(syncNotes(repository, v3, 31)).resolves.toMatchObject({ status: "applied" });
    const changed = (await repository.load({ entryId: contentEntryId("changed") }))!;
    expect(changed.draft).toMatchObject({ blocks: [], revision: 3 });
    expect(changed.published).toMatchObject({ revision: 1 });
    expect(changed.published!.blocks[0]).toMatchObject({ data: { text: "Old" }, schemaVersion: 3 });
  },
);

contract(
  "migrates entries holding the maximum blocks and references within budgets",
  async (runtime, expect) => {
    const v1 = await noteConfig(noteV1, 1);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncNotes(repository, v1, 10);
    await seedMedia(sql, "m-1");
    const blocks = Array.from({ length: 200 }, (_, index) =>
      note(`n${index}`, { body: `Note ${index}`, image: "m-1" }, index + 1),
    );
    await repository.create({
      entry: entry("big", "posts", { blocks, slug: "big", title: "Big", updatedAt: 20 }),
      mediaReferences: blocks.map((value) => ({
        fieldPath: "image",
        mediaId: mediaId("m-1"),
        sourceKey: value.key,
      })),
    });
    await repository.publish(publish("big", 1, 21, "big-published"));
    const v3 = await noteConfig(noteV3(), 2);
    await expect(syncNotes(repository, v3, 30)).resolves.toMatchObject({
      migrated: { blocks: 400, drafts: 1, published: 1 },
      status: "applied",
    });
    const big = (await repository.load({ entryId: contentEntryId("big") }))!;
    expect([big.draft.revision, big.published!.revision]).toEqual([2, 2]);
    expect(big.published!.blocks.at(-1)).toMatchObject({
      data: { cover: "m-1", text: "Note 199" },
      position: 200,
      schemaVersion: 3,
    });
    expect(
      await sql.all(
        "select field_path, count(*) as count from content_media_references group by field_path",
      ),
    ).toEqual([{ count: 400, field_path: "cover" }]);
  },
);

/** Checkpoints both adapters expose inside the atomic media metadata update. */
export const MEDIA_METADATA_CHECKPOINTS = Object.freeze([
  "media.metadata",
  "public-state",
  "build-outbox",
]);

function metadataUpdate(
  id: string,
  expectedUpdatedAt: number,
  updatedAt: number,
  values: {
    readonly alt?: string | null;
    readonly caption?: string | null;
    readonly focalPoint?: { readonly x: number; readonly y: number } | null;
  } = {},
) {
  return {
    alt: values.alt ?? null,
    caption: values.caption ?? null,
    expectedUpdatedAt: unixMilliseconds(expectedUpdatedAt),
    focalPoint: values.focalPoint ?? null,
    mediaId: mediaId(id),
    requestedBy: editor,
    updatedAt: unixMilliseconds(updatedAt),
  };
}

async function mediaMetadataState(sql: ContractSql): Promise<Record<string, readonly unknown[]>> {
  return {
    ...(await lifecycleState(sql)),
    media: await sql.all("select * from media order by id"),
  };
}

async function pendingBuilds(sql: ContractSql) {
  const rows = await sql.all<{ payload_json: string }>(
    "select payload_json from outbox_events where type = 'site.build.requested' and processed_at is null",
  );
  return rows.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
}

contract(
  "updates media metadata and requests a build only for published usage",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    await repository.saveCompleteDraft(changedPost("post", 3));
    await seedMedia(sql, "media-3");
    const version = await repository.publishedContentVersion();
    const builds = await pendingBuilds(sql);
    expect(builds).toHaveLength(1);

    const drafted = await repository.updateMediaMetadata(
      metadataUpdate("media-2", 1, 10, { focalPoint: { x: 0.2, y: 0.8 } }),
    );
    expect(drafted).toEqual({ media: expect.objectContaining({ focalPoint: { x: 0.2, y: 0.8 } }) });
    expect(drafted.media.updatedAt).toBe(10);
    const unused = await repository.updateMediaMetadata(
      metadataUpdate("media-3", 1, 10, { alt: "Unused" }),
    );
    expect(unused).not.toHaveProperty("targetVersion");
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await pendingBuilds(sql)).toEqual(builds);

    const live = await repository.updateMediaMetadata(
      metadataUpdate("media-1", 1, 11, {
        alt: "Red bicycle",
        caption: "A\nbike",
        focalPoint: { x: 0, y: 1 },
      }),
    );
    expect(live.targetVersion).toBe(version + 1);
    expect(await repository.publishedContentVersion()).toBe(version + 1);
    const coalesced = await pendingBuilds(sql);
    expect(coalesced).toHaveLength(1);
    expect(coalesced[0]).toMatchObject({
      publishedSnapshotId: null,
      reason: "media_metadata",
      requestedBy: "editor",
      targetVersion: version + 1,
    });
    const described = {
      alt: "Red bicycle",
      caption: "A\nbike",
      focalPoint: { x: 0, y: 1 },
      updatedAt: 11,
    };
    expect(live.media).toMatchObject(described);
    expect(await repository.loadMedia("media-1")).toMatchObject(described);
    expect(await repository.loadPublicMedia("media-1")).toMatchObject(described);
    expect((await repository.loadMediaMany(["media-1"]))[0]).toMatchObject(described);
    expect((await repository.loadMediaCatalogItem("media-1"))!.media).toMatchObject(described);
    const listed = await repository.listMedia({ limit: 10, sort: "-createdAt" });
    expect(listed.items.find((item) => item.media.id === "media-1")!.media).toMatchObject(
      described,
    );
    expect(listed.items.find((item) => item.media.id === "media-3")!.media).toMatchObject({
      alt: "Unused",
    });
    expect(await sql.get("select metadata_json from media where id = 'media-1'")).toEqual({
      metadata_json: "{}",
    });

    const cleared = await repository.updateMediaMetadata(metadataUpdate("media-1", 11, 12));
    for (const key of ["alt", "caption", "focalPoint"]) {
      expect(cleared.media).not.toHaveProperty(key);
    }
    expect(cleared.targetVersion).toBe(version + 2);

    // A write committed by an independent repository makes the expected version stale.
    await harness.reopen().updateMediaMetadata(metadataUpdate("media-1", 12, 13, { alt: "Other" }));
    const committed = await mediaMetadataState(sql);
    await expect(
      repository.updateMediaMetadata(metadataUpdate("media-1", 12, 14, { alt: "Stale" })),
    ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    await expect(
      repository.updateMediaMetadata(metadataUpdate("missing", 1, 2, { alt: "x" })),
    ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    await seedMedia(sql, "media-4", "deleting");
    const withDeleting = await mediaMetadataState(sql);
    await expect(
      repository.updateMediaMetadata(metadataUpdate("media-4", 1, 2, { alt: "x" })),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await mediaMetadataState(sql)).toEqual(withDeleting);
    expect(withDeleting["published_state"]).toEqual(committed["published_state"]);

    // Concurrent edits at the same expected version commit once.
    const outcomes = await Promise.allSettled([
      repository.updateMediaMetadata(metadataUpdate("media-1", 13, 20, { alt: "First" })),
      harness.reopen().updateMediaMetadata(metadataUpdate("media-1", 13, 21, { alt: "Second" })),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const refused = outcomes.find((outcome) => outcome.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toMatchObject({
      code: "MEDIA_UPDATE_CONFLICT",
    });
    expect(await repository.publishedContentVersion()).toBe(version + 4);
  },
);

contract(
  "returns the active media of published snapshots with public reads",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "home", "posts");
    for (const id of ["media-1", "media-2", "media-3"]) await seedMedia(sql, id);
    await sql.run(
      "update media set width = 1600, height = 900, alt = 'Office', caption = 'Our office', focal_x = 0.25, focal_y = 0.4 where id = 'media-2'",
    );
    await repository.create({
      entry: heroEntry("post", "posts", 1),
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" },
        { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("post-block") },
        { fieldPath: "media", mediaId: mediaId("media-2"), sourceKey: blockKey("other-block") },
      ],
    });
    await repository.publish(publish("post", 1, 2, "post-published"));
    await repository.saveCompleteDraft(
      save("post", 1, 3, {
        mediaReferences: [
          { fieldPath: "image", mediaId: mediaId("media-3"), sourceKey: "$fields" },
        ],
        title: "DRAFT ONLY",
      }),
    );

    const expectMedia = (media: readonly MediaMetadata[]) => {
      expect(media.map((item) => item.id)).toEqual(["media-1", "media-2"]);
      expect(media[1]).toMatchObject({
        alt: "Office",
        caption: "Our office",
        focalPoint: { x: 0.25, y: 0.4 },
        height: 900,
        width: 1600,
      });
    };
    const loaded = (await repository.loadPublic("/blog/post"))!;
    expectMedia(loaded.media);
    expect(loaded.entry.published!.title).toBe("post");
    expect(JSON.stringify(loaded)).not.toContain("DRAFT ONLY");
    const listed = await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") });
    expectMedia(listed.items[0]!.media);
    const exported = await readAllBuildContentPages(repository);
    expectMedia(exported.entries[0]!.media);
    expect(JSON.stringify(exported)).not.toContain("DRAFT ONLY");
  },
);

contract("enforces media metadata constraints in the database", async (runtime, expect) => {
  const { sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedMedia(sql, "media-1");
  for (const [statement, ...params] of [
    ["update media set focal_x = 0.5 where id = 'media-1'"],
    ["update media set focal_x = 0.5, focal_y = 1.5 where id = 'media-1'"],
    ["update media set focal_x = -0.1, focal_y = 0.5 where id = 'media-1'"],
    ["update media set alt = ? where id = 'media-1'", "x".repeat(1001)],
    ["update media set caption = ? where id = 'media-1'", "x".repeat(2001)],
  ] as const) {
    await expect(sql.run(statement, ...params), statement).rejects.toThrow();
  }
  await sql.run(
    "update media set alt = ?, caption = ?, focal_x = 0, focal_y = 1 where id = 'media-1'",
    "x".repeat(1000),
    "x".repeat(2000),
  );
  expect(await sql.get("select focal_x, focal_y from media where id = 'media-1'")).toEqual({
    focal_x: 0,
    focal_y: 1,
  });
});

contract(
  "rolls back media metadata updates at every injected checkpoint",
  async (runtime, expect) => {
    for (const checkpoint of MEDIA_METADATA_CHECKPOINTS) {
      let armed = false;
      const { repository, sql } = await runtime.open({
        beforeMutation: (name) => {
          if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
        },
        resolveModel: resolveRoute,
      });
      await seedPublishedLifecycle(repository, sql);
      const before = await mediaMetadataState(sql);
      armed = true;
      await expect(
        repository.updateMediaMetadata(metadataUpdate("media-1", 1, 10, { alt: "Rolled back" })),
        checkpoint,
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      expect(await mediaMetadataState(sql), checkpoint).toEqual(before);
    }
  },
);

// ---------------------------------------------------------------- globals

function globalEntry(id: string, updatedAt: number, image = "media-1") {
  return entry(id, "settings", {
    blocks: [heroBlock(`${id}-block`, image, "Banner")],
    fields: { image, title: "Lace" },
    title: "Site settings",
    updatedAt,
  });
}

async function seedPublishedGlobal(repository: ContractRepository, sql: ContractSql) {
  await seedModels(sql, "home", "posts", "settings");
  await seedMedia(sql, "media-1");
  await seedMedia(sql, "media-2");
  for (const [id, model] of [
    ["home", "home"],
    ["post", "posts"],
  ] as const) {
    await repository.create({
      entry: heroEntry(id, model, 1),
      mediaReferences: references(`${id}-block`),
    });
    await repository.publish(publish(id, 1, 2, `${id}-published`));
  }
  await repository.create({
    entry: globalEntry("settings", 1, "media-2"),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("settings-block") },
    ],
  });
  return repository.publish(publish("settings", 1, 3, "settings-published"));
}

contract("synchronizes a global singleton without a route", async (runtime, expect) => {
  const models = [syncPage(), syncGlobal()];
  const { repository, sql } = await runtime.open({
    nextId: sequence("outbox"),
    resolveModel: syncResolver(models),
  });
  await expect(applySync(repository, models, 10)).resolves.toMatchObject({ status: "applied" });
  expect(await repository.readConfigurationSyncState()).toMatchObject([
    { entryCount: 1, key: "home", kind: "page" },
    { draftSnapshotCount: 1, entryCount: 1, key: "settings", kind: "global" },
  ]);
  const listed = await repository.list({
    limit: 10,
    listFields: [],
    modelKey: contentModelKey("settings"),
    sort: "-updatedAt",
  });
  expect(listed.items).toMatchObject([{ status: "draft", title: "Site settings" }]);
  const loaded = await repository.load({ entryId: contentEntryId(listed.items[0]!.id) });
  expect(loaded).toMatchObject({
    draft: { blocks: [], revision: 1, updatedBy: { id: "system:content-sync" } },
    model: { key: "settings", kind: "global" },
  });
  expect(loaded!.draft).not.toHaveProperty("slug");
  expect(
    await sql.get("select singleton_key from content_entries where model_key = 'settings'"),
  ).toEqual({ singleton_key: 1 });
  expect(await count(sql, "select count(*) as count from published_routes")).toBe(0);
  await expect(
    repository.create({ entry: globalEntry("second", 11), mediaReferences: [] }),
  ).rejects.toMatchObject({ code: "CONTENT_MODEL_CARDINALITY_CONFLICT" });
  expect(
    await count(sql, "select count(*) as count from content_entries where model_key = 'settings'"),
  ).toBe(1);
});

contract("rolls back a failed synchronized global singleton", async (runtime, expect) => {
  const models = [syncGlobal()];
  const { repository, sql } = await runtime.open({
    beforeMutation: (checkpoint) => {
      if (checkpoint === "sync.page.snapshot") throw new Error("injected failure");
    },
    resolveModel: syncResolver(models),
  });
  await expect(applySync(repository, models, 10)).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(await repository.readConfigurationSyncState()).toEqual([]);
  expect(await count(sql, "select count(*) as count from content_entries")).toBe(0);
});

contract("publishes and reads a global by model key without a route", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({
    nextId: sequence("outbox"),
    resolveModel: resolveRoute,
  });
  await seedModels(sql, "settings");
  await seedMedia(sql, "media-1");
  await repository.create({
    entry: globalEntry("settings", 1),
    mediaReferences: references("settings-block"),
  });
  expect(await repository.loadPublicGlobal(contentModelKey("settings"))).toBeNull();
  expect(await repository.loadPublicMedia("media-1")).toBeNull();
  const version = await repository.publishedContentVersion();
  const published = await repository.publish(publish("settings", 1, 2, "settings-published"));
  expect(published).toMatchObject({ outcome: "published", targetVersion: version + 1 });
  expect(await count(sql, "select count(*) as count from published_routes")).toBe(0);
  expect(await repository.publishedContentVersion()).toBe(version + 1);
  const pending = await sql.all<{ payload_json: string }>(
    "select payload_json from outbox_events where type = 'site.build.requested' and processed_at is null",
  );
  expect(pending).toHaveLength(1);

  const read = await repository.loadPublicGlobal(contentModelKey("settings"));
  expect(read).toMatchObject({
    entry: {
      id: "settings",
      model: { key: "settings", kind: "global" },
      published: { fields: { image: "media-1", title: "Lace" }, id: "settings-published" },
    },
    media: [{ id: "media-1" }],
  });
  expect(read).not.toHaveProperty("path");
  expect(await repository.loadPublicMedia("media-1")).toMatchObject({ id: "media-1" });

  await repository.saveCompleteDraft(
    save("settings", 1, 3, { fields: { title: "Changed" }, title: "Site settings" }),
  );
  await repository.publish(publish("settings", 2, 4, "settings-republished"));
  expect(await repository.loadPublicGlobal(contentModelKey("settings"))).toMatchObject({
    entry: { published: { fields: { title: "Changed" }, id: "settings-republished" } },
    media: [],
  });
  expect(await repository.publishedContentVersion()).toBe(version + 2);
  expect(
    await count(sql, "select count(*) as count from outbox_events where processed_at is null"),
  ).toBe(1);
  expect(
    await count(sql, "select count(*) as count from content_snapshots where entry_id = 'settings'"),
  ).toBe(2);
});

contract(
  "keeps globals out of routed reads and lists them in the export",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedPublishedGlobal(repository, sql);
    await seedMedia(sql, "media-3");
    await repository.saveCompleteDraft(
      save("settings", 1, 4, {
        fields: { image: "media-3" },
        mediaReferences: [
          { fieldPath: "image", mediaId: mediaId("media-3"), sourceKey: "$fields" },
        ],
        title: "Site settings",
      }),
    );

    expect(await repository.loadPublic("/")).toMatchObject({ entry: { id: "home" } });
    for (const key of ["home", "posts", "missing"]) {
      expect(await repository.loadPublicGlobal(contentModelKey(key)), key).toBeNull();
    }
    expect(
      (await repository.listPublic({ limit: 10, modelKey: contentModelKey("settings") })).items,
    ).toEqual([]);
    expect(
      (await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") })).items.map(
        (item) => item.entry.id,
      ),
    ).toEqual(["post"]);

    const exported = await readAllBuildContentPages(repository);
    expect(exported.entries.map((item) => item.path)).toEqual(["/", "/blog/post"]);
    expect(exported.globals.map((item) => item.entry.id)).toEqual(["settings"]);
    expect(exported.globals[0]).toMatchObject({
      entry: { published: { fields: { image: "media-2" } } },
      media: [{ id: "media-2" }],
    });
    expect(exported.globals[0]).not.toHaveProperty("path");
    expect(
      [...exported.entries, ...exported.globals].flatMap((item) => item.media.map((m) => m.id)),
    ).toEqual(["media-1", "media-1", "media-2"]);
    // Media referenced only by the global's draft stays private.
    expect(await repository.loadPublicMedia("media-3")).toBeNull();
    expect(await repository.loadPublicMedia("media-2")).toMatchObject({ id: "media-2" });
  },
);

contract("unpublishes and reverts a global without touching routes", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedPublishedGlobal(repository, sql);
  await repository.saveCompleteDraft(
    save("settings", 1, 4, { fields: { title: "Changed" }, title: "Site settings" }),
  );
  const version = await repository.publishedContentVersion();
  const reverted = await repository.revertDraft(revertCommand("settings", 2, "settings-published"));
  expect(reverted.entry!.draft).toMatchObject({ fields: { image: "media-2" }, revision: 3 });
  expect(await repository.publishedContentVersion()).toBe(version);

  const routesBefore = await sql.all("select * from published_routes order by path");
  const result = await repository.unpublish(unpublishCommand("settings", "settings-published", 5));
  expect(result).toMatchObject({ outcome: "unpublished", targetVersion: version + 1 });
  expect(result.entry.draft).toEqual(reverted.entry!.draft);
  expect(await repository.loadPublicGlobal(contentModelKey("settings"))).toBeNull();
  expect((await readAllBuildContentPages(repository)).globals).toEqual([]);
  expect(await repository.loadPublicMedia("media-2")).toBeNull();
  expect(await sql.all("select * from published_routes order by path")).toEqual(routesBefore);
  expect(await repository.publishedContentVersion()).toBe(version + 1);
});

contract(
  "rolls back global publication and unpublication at every checkpoint",
  async (runtime, expect) => {
    const publicationCheckpoints = PUBLICATION_CHECKPOINTS.filter(
      (checkpoint) => checkpoint !== "publish.route",
    );
    for (const checkpoint of publicationCheckpoints) {
      const { repository, sql } = await runtime.open({
        beforeMutation: (name) => {
          if (name === checkpoint) throw new Error(`injected ${checkpoint}`);
        },
        resolveModel: resolveRoute,
      });
      await seedModels(sql, "settings");
      await seedMedia(sql, "media-1");
      await repository.create({
        entry: globalEntry("settings", 1),
        mediaReferences: references("settings-block"),
      });
      const before = await lifecycleState(sql);
      await expect(
        repository.publish(publish("settings", 1, 2, "settings-published")),
        checkpoint,
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      expect(await lifecycleState(sql), checkpoint).toEqual(before);
    }
    for (const checkpoint of UNPUBLICATION_CHECKPOINTS) {
      let armed = false;
      const { repository, sql } = await runtime.open({
        beforeMutation: (name) => {
          if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
        },
        resolveModel: resolveRoute,
      });
      await seedPublishedGlobal(repository, sql);
      const before = await lifecycleState(sql);
      armed = true;
      await expect(
        repository.unpublish(unpublishCommand("settings", "settings-published", 5)),
        checkpoint,
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      expect(await lifecycleState(sql), checkpoint).toEqual(before);
    }
  },
);

const seoReference = (media: string) =>
  Object.freeze({ fieldPath: "image", mediaId: mediaId(media), sourceKey: "$seo" as const });

/** A `posts` entry whose draft carries an SEO group. */
function seoEntry(id: string, seo: EntrySeo, updatedAt: number, slug = id): ContentEntry {
  const value = entry(id, "posts", { slug, title: id, updatedAt });
  return createContentEntry({ draft: { ...value.draft, seo }, id: value.id, model: value.model });
}

async function seoState(sql: ContractSql) {
  return {
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
    seo: await sql.all("select id, revision, seo_json from content_snapshots order by id"),
    version: (await sql.get<{ version: number }>("select version from published_state"))?.version,
  };
}

contract(
  "persists and copies the SEO group through save, publish, revert and duplicate",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    for (const id of ["media-1", "media-2"]) await seedMedia(sql, id);
    const seo = { canonical: "https://example.com/a", image: mediaId("media-1"), title: "A" };
    await repository.create({
      entry: seoEntry("post", seo, 1, "post"),
      mediaReferences: [seoReference("media-1")],
    });
    expect(await sql.get("select seo_json from content_snapshots where id = 'post-draft'")).toEqual(
      { seo_json: '{"canonical":"https://example.com/a","image":"media-1","title":"A"}' },
    );

    const changedSeo = { image: mediaId("media-2"), noindex: true as const, title: "B" };
    await repository.saveCompleteDraft(
      save("post", 1, 2, {
        mediaReferences: [seoReference("media-2")],
        seo: changedSeo,
        slug: "post",
      }),
    );
    expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.seo).toEqual(
      changedSeo,
    );
    await repository.publish(publish("post", 2, 3, "post-published"));
    const published = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(published.published!.seo).toEqual(changedSeo);
    expect(
      await sql.all(
        "select snapshot_id, media_id from content_media_references where source_key = '$seo' order by snapshot_id",
      ),
    ).toEqual([
      { media_id: "media-2", snapshot_id: "post-draft" },
      { media_id: "media-2", snapshot_id: "post-published" },
    ]);
    const publicEntry = await repository.loadPublic("/blog/post");
    expect(publicEntry!.entry.published!.seo).toEqual(changedSeo);
    expect(publicEntry!.media.map((media) => media.id)).toEqual(["media-2"]);
    const exported = await readAllBuildContentPages(repository);
    expect(exported.entries[0]!.entry.published!.seo).toEqual(changedSeo);
    expect(exported.entries[0]!.media.map((media) => media.id)).toEqual(["media-2"]);
    expect(await repository.loadPublicMedia(mediaId("media-2"))).not.toBeNull();
    expect(await repository.loadPublicMedia(mediaId("media-1"))).toBeNull();

    // Saving without a group clears it from the draft only.
    await repository.saveCompleteDraft(save("post", 2, 4, { slug: "post" }));
    const cleared = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(cleared.draft).not.toHaveProperty("seo");
    expect(cleared.published!.seo).toEqual(changedSeo);
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = 'post-draft'",
      ),
    ).toBe(0);

    await repository.revertDraft({
      entryId: contentEntryId("post"),
      expectedPublishedSnapshotId: contentSnapshotId("post-published"),
      expectedRevision: 3,
      revertedAt: unixMilliseconds(5),
      revertedBy: editor,
    });
    const reverted = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(reverted.draft.seo).toEqual(changedSeo);
    expect(
      await sql.all(
        "select source_key, media_id from content_media_references where snapshot_id = 'post-draft'",
      ),
    ).toEqual([{ media_id: "media-2", source_key: "$seo" }]);

    await repository.create({
      duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 4 },
      entry: seoEntry("copy", changedSeo, 6, "copy"),
      mediaReferences: [seoReference("media-2")],
    });
    expect((await repository.load({ entryId: contentEntryId("copy") }))!.draft.seo).toEqual(
      changedSeo,
    );
    expect((await repository.loadMediaCatalogItem("media-2"))!.usageCount).toBe(2);
  },
);

contract(
  "SEO images protect media and appear in usage but stay private while draft-only",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: seoEntry("post", { image: mediaId("media-1") }, 1),
      mediaReferences: [seoReference("media-1")],
    });
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("media-1"),
        requestedAt: unixMilliseconds(2),
        requestedBy: editor,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
    expect((await repository.loadMediaCatalogItem("media-1"))!.usageCount).toBe(1);
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("media-1") })).toEqual([
      expect.objectContaining({
        entryId: "post",
        locations: [{ field: "image", source: "seo", states: ["draft"] }],
      }),
    ]);
    expect(await repository.loadPublicMedia(mediaId("media-1"))).toBeNull();
    expect((await readAllBuildContentPages(repository)).entries).toEqual([]);
  },
);

/** A `posts` configuration with SEO and a `note` block of the given definition. */
async function seoNoteConfig(
  note: BlockDefinition,
  version: number,
  overrides: Partial<CollectionModelInput> = {},
) {
  return defineConfig({
    blocks: [...Object.values(builtInBlocks), note],
    content: [
      defineCollection({
        blocks: ["richText", "note"],
        fields: { headline: field.text() },
        key: "posts",
        route: "/blog/:slug",
        seo: true,
        version,
        ...overrides,
      } as CollectionModelInput),
    ],
  });
}

async function syncSeoNotes(
  repository: ContractRepository,
  config: Awaited<ReturnType<typeof seoNoteConfig>>,
  at: number,
) {
  const prepared = await prepareConfigurationSynchronization({
    blocks: config.runtime.blocks,
    models: config.runtime.content,
    state: repository,
  });
  if (!prepared.plan.isValid) return { prepared };
  return {
    prepared,
    result: await applyPreparedConfigurationSynchronization({
      blocks: config.runtime.blocks,
      clock: { now: () => unixMilliseconds(at) },
      ids: { next: sequence(`sync-${at}`) },
      models: config.runtime.content,
      prepared,
      target: repository,
    }),
  };
}

async function seedSeoNotes(repository: ContractRepository, sql: ContractSql): Promise<void> {
  for (const id of ["m-1", "m-2"]) await seedMedia(sql, id);
  const value = entry("live", "posts", {
    blocks: [note("n1", { body: "Live", image: "m-1" })],
    fields: { headline: "Head" },
    slug: "live",
    title: "Live",
    updatedAt: 20,
  });
  await repository.create({
    entry: createContentEntry({
      draft: { ...value.draft, seo: { image: mediaId("m-2"), title: "Live SEO" } },
      id: value.id,
      model: value.model,
    }),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("m-1"), sourceKey: blockKey("n1") },
      seoReference("m-2"),
    ],
  });
  await repository.publish(publish("live", 1, 21, "live-published"));
}

contract(
  "block migrations and field rewrites during synchronization keep SEO groups",
  async (runtime, expect) => {
    const v1 = await seoNoteConfig(noteV1, 1);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncSeoNotes(repository, v1, 10);
    await seedSeoNotes(repository, sql);
    const seoRows = () =>
      sql.all("select id, seo_json from content_snapshots where seo_json is not null order by id");
    const seoReferences = () =>
      sql.all(
        "select snapshot_id, media_id from content_media_references where source_key = '$seo' order by snapshot_id",
      );
    const rows = await seoRows();
    const references = await seoReferences();
    expect(rows).toHaveLength(2);
    expect(references).toHaveLength(2);

    const migrated = await syncSeoNotes(repository, await seoNoteConfig(noteV3(), 2), 30);
    expect(migrated.result).toMatchObject({ status: "applied" });
    expect(await seoRows()).toEqual(rows);
    expect(await seoReferences()).toEqual(references);

    const rewritten = await syncSeoNotes(
      repository,
      await seoNoteConfig(noteV3(), 3, {
        blocks: ["richText"],
        fields: { title: field.text({ renamedFrom: "headline" }) },
        removedBlocks: ["note"],
      }),
      40,
    );
    expect(rewritten.result).toMatchObject({ status: "applied" });
    const live = (await repository.load({ entryId: contentEntryId("live") }))!;
    expect(live.draft.fields).toEqual({ title: "Head" });
    expect(live.draft.blocks).toEqual([]);
    expect(live.published!.seo).toEqual({ image: "m-2", title: "Live SEO" });
    expect(await seoReferences()).toEqual(references);
  },
);

contract(
  "refuses disabling SEO with stored values and prunes them atomically with the hint",
  async (runtime, expect) => {
    const v1 = await seoNoteConfig(noteV1, 1);
    let armed = false;
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (armed && name === "sync.model.remove-seo") throw new Error("injected remove-seo");
      },
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncSeoNotes(repository, v1, 10);
    await seedSeoNotes(repository, sql);
    const before = await seoState(sql);

    const unhinted = await syncSeoNotes(
      repository,
      await seoNoteConfig(noteV1, 2, { seo: false }),
      30,
    );
    expect(unhinted.prepared.plan.diagnostics).toMatchObject([
      {
        affectedCount: 2,
        code: "SEO_REMOVAL_HAS_DATA",
        snapshots: [
          { entryId: "live", state: "draft", title: "Live" },
          { entryId: "live", state: "published", title: "Live" },
        ],
      },
    ]);
    expect(unhinted.prepared.report.text).toContain("removedSeo: true");
    expect(await seoState(sql)).toEqual(before);

    const hinted = await seoNoteConfig(noteV1, 2, { removedSeo: true, seo: false });
    armed = true;
    await expect(syncSeoNotes(repository, hinted, 31)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await seoState(sql)).toEqual(before);
    armed = false;

    const pruned = await syncSeoNotes(repository, hinted, 32);
    expect(pruned.prepared.report.text).toContain("planned SEO removal");
    expect(pruned.result).toMatchObject({ status: "applied", targetVersion: before.version! + 1 });
    const after = await seoState(sql);
    expect(after.seo.map((row) => row.seo_json)).toEqual([null, null]);
    expect(after.seo.map((row) => row.revision)).toEqual(before.seo.map((row) => row.revision));
    expect(after.references).toEqual(before.references.filter((row) => row.source_key !== "$seo"));
    expect((await repository.loadMediaCatalogItem("m-2"))!.usageCount).toBe(0);
    expect((await repository.loadMediaCatalogItem("m-1"))!.usageCount).toBe(1);
  },
);

contract(
  "media metadata of a published SEO image requests a build while a draft-only one does not",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    for (const id of ["media-1", "media-2"]) await seedMedia(sql, id);
    await repository.create({
      entry: seoEntry("live", { image: mediaId("media-1") }, 1),
      mediaReferences: [seoReference("media-1")],
    });
    await repository.publish(publish("live", 1, 2, "live-published"));
    await repository.create({
      entry: seoEntry("draft", { image: mediaId("media-2") }, 3),
      mediaReferences: [seoReference("media-2")],
    });
    // A draft-only use keeps the item off the public site.
    await repository.saveCompleteDraft(save("live", 1, 4, { slug: "live" }));
    const version = await repository.publishedContentVersion();
    const builds = await pendingBuilds(sql);

    const drafted = await repository.updateMediaMetadata(
      metadataUpdate("media-2", 1, 10, { alt: "Draft" }),
    );
    expect(drafted).not.toHaveProperty("targetVersion");
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await pendingBuilds(sql)).toEqual(builds);

    const live = await repository.updateMediaMetadata(
      metadataUpdate("media-1", 1, 11, { alt: "Share image" }),
    );
    expect(live.targetVersion).toBe(version + 1);
    const pending = await pendingBuilds(sql);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ reason: "media_metadata", targetVersion: version + 1 });
    expect(await repository.loadPublicMedia("media-1")).toMatchObject({ alt: "Share image" });
  },
);

// ---------------------------------------------------------------- block envelope

/** A hero block with envelope values; the repository stores what it receives. */
function envelopeBlock(
  key: string,
  image: string,
  envelope: Partial<Pick<ContentBlock, "anchor" | "className" | "hidden" | "settings">>,
  position = 1000,
): ContentBlock {
  return Object.freeze({ ...heroBlock(key, image, key, "hero", position), ...envelope });
}

function blockReference(media: string, key: string) {
  return Object.freeze({ fieldPath: "image", mediaId: mediaId(media), sourceKey: blockKey(key) });
}

async function envelopeRows(sql: ContractSql) {
  return sql.all(
    "select snapshot_id, block_key, anchor, class_name, hidden, settings_json from content_blocks order by snapshot_id, position",
  );
}

contract(
  "persists and copies block envelopes through save, publish, revert and duplicate",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    for (const id of ["media-1", "media-2"]) await seedMedia(sql, id);
    const shown = envelopeBlock("b1", "media-1", {
      anchor: "pricing",
      className: "wide md:w-1/2",
      settings: { align: "center", boxed: true },
    });
    const hidden = envelopeBlock("b2", "media-2", { hidden: true, settings: {} }, 2000);
    await repository.create({
      entry: entry("post", "posts", { blocks: [shown, hidden], slug: "post", updatedAt: 1 }),
      mediaReferences: [blockReference("media-1", "b1"), blockReference("media-2", "b2")],
    });
    expect(await envelopeRows(sql)).toEqual([
      {
        anchor: "pricing",
        block_key: "b1",
        class_name: "wide md:w-1/2",
        hidden: 0,
        settings_json: '{"align":"center","boxed":true}',
        snapshot_id: "post-draft",
      },
      {
        anchor: null,
        block_key: "b2",
        class_name: null,
        hidden: 1,
        settings_json: "{}",
        snapshot_id: "post-draft",
      },
    ]);
    expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.blocks).toEqual([
      shown,
      hidden,
    ]);

    // The published copy shares the draft's anchors: uniqueness is per snapshot.
    await repository.publish(publish("post", 1, 2, "post-published"));
    const published = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(published.published!.blocks).toEqual([shown, hidden]);

    const changed = envelopeBlock("b1", "media-1", { settings: { align: "left" } });
    await repository.saveCompleteDraft(
      save("post", 1, 3, {
        blocks: [changed],
        mediaReferences: [blockReference("media-1", "b1")],
        slug: "post",
      }),
    );
    const saved = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(saved.draft.blocks).toEqual([changed]);
    expect(saved.published!.blocks).toEqual([shown, hidden]);

    await repository.revertDraft({
      entryId: contentEntryId("post"),
      expectedPublishedSnapshotId: contentSnapshotId("post-published"),
      expectedRevision: 2,
      revertedAt: unixMilliseconds(4),
      revertedBy: editor,
    });
    expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.blocks).toEqual([
      shown,
      hidden,
    ]);

    const copyBlocks = [
      envelopeBlock("c1", "media-1", { anchor: "pricing", className: "wide md:w-1/2" }),
      envelopeBlock("c2", "media-2", { hidden: true }, 2000),
    ];
    await repository.create({
      duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 3 },
      entry: entry("copy", "posts", { blocks: copyBlocks, updatedAt: 5 }),
      mediaReferences: [blockReference("media-1", "c1"), blockReference("media-2", "c2")],
    });
    expect((await repository.load({ entryId: contentEntryId("copy") }))!.draft.blocks).toEqual(
      copyBlocks,
    );
  },
);

contract(
  "leaves hidden blocks and their exclusive media out of public delivery",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    for (const id of ["media-1", "media-2", "media-3"]) await seedMedia(sql, id);
    await repository.create({
      entry: entry("post", "posts", {
        blocks: [
          envelopeBlock("b1", "media-1", { anchor: "top" }),
          envelopeBlock("b2", "media-2", { hidden: true }, 2000),
          // media-1 is also held by a hidden block; the visible use keeps it public.
          envelopeBlock("b3", "media-1", { hidden: true }, 3000),
        ],
        slug: "post",
        updatedAt: 1,
      }),
      mediaReferences: [
        blockReference("media-1", "b1"),
        blockReference("media-2", "b2"),
        blockReference("media-1", "b3"),
      ],
    });
    await repository.publish(publish("post", 1, 2, "post-published"));
    await repository.create({
      entry: entry("settings", "settings", {
        blocks: [envelopeBlock("g1", "media-3", { hidden: true })],
        fields: { image: "media-1", title: "Lace" },
        title: "Site settings",
        updatedAt: 3,
      }),
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" as const },
        blockReference("media-3", "g1"),
      ],
    });
    await repository.publish(publish("settings", 1, 4, "settings-published"));

    const keys = (value: { readonly entry: ContentEntry } | null) =>
      value!.entry.published!.blocks.map((block) => block.key as string);
    const mediaIds = (value: { readonly media: readonly { readonly id: string }[] } | null) =>
      value!.media.map((media) => media.id);
    const byPath = await repository.loadPublic("/blog/post");
    expect(keys(byPath)).toEqual(["b1"]);
    expect(byPath!.entry.published!.blocks[0]).toMatchObject({ anchor: "top", hidden: false });
    expect(mediaIds(byPath)).toEqual(["media-1"]);
    const page = await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") });
    expect(keys(page.items[0]!)).toEqual(["b1"]);
    expect(mediaIds(page.items[0]!)).toEqual(["media-1"]);
    const global = await repository.loadPublicGlobal(contentModelKey("settings"));
    expect(keys(global)).toEqual([]);
    expect(mediaIds(global)).toEqual(["media-1"]);
    const exported = await readAllBuildContentPages(repository);
    expect(keys(exported.entries[0]!)).toEqual(["b1"]);
    expect(exported.entries.flatMap(mediaIds)).toEqual(["media-1"]);
    expect(keys(exported.globals[0]!)).toEqual([]);
    expect(mediaIds(exported.globals[0]!)).toEqual(["media-1"]);
    expect(await repository.loadPublicMedia(mediaId("media-1"))).not.toBeNull();
    expect(await repository.loadPublicMedia(mediaId("media-2"))).toBeNull();
    expect(await repository.loadPublicMedia(mediaId("media-3"))).toBeNull();

    // Hidden blocks stay stored, so their media stays protected and listed.
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("media-2"),
        requestedAt: unixMilliseconds(5),
        requestedBy: editor,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("media-2") })).toEqual([
      expect.objectContaining({
        entryId: "post",
        locations: [
          {
            blockKey: "b2",
            blockType: "hero",
            field: "image",
            source: "block",
            states: ["draft", "published"],
          },
        ],
      }),
    ]);
    expect(
      (await repository.load({ entryId: contentEntryId("post") }))!.published!.blocks.map(
        (block) => block.key as string,
      ),
    ).toEqual(["b1", "b2", "b3"]);
  },
);

const panelV1 = defineBlock({
  fields: { body: field.text() },
  settings: { tone: field.text({ defaultValue: "light" }) },
  type: "note",
  version: 1,
});

const panelV2 = defineBlock({
  fields: { body: field.text() },
  migrations: {
    2: ({ data, settings: { tone = "light", ...rest } }) => ({
      data,
      settings: { ...rest, theme: tone },
    }),
  },
  settings: {
    align: field.select({ defaultValue: "left", options: ["left", "center"] }),
    theme: field.text({ defaultValue: "light" }),
  },
  type: "note",
  version: 2,
});

contract(
  "block migrations rewrite settings and keep anchors, class names and hidden flags",
  async (runtime, expect) => {
    const v1 = await noteConfig(panelV1, 1);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncNotes(repository, v1, 10);
    const stored = Object.freeze({
      ...note("n1", { body: "Live" }),
      anchor: "intro",
      className: "lead",
      hidden: true,
      settings: { tone: "dark" },
    });
    await repository.create({
      entry: entry("live", "posts", {
        blocks: [stored],
        slug: "live",
        title: "Live",
        updatedAt: 20,
      }),
      mediaReferences: [],
    });
    await repository.publish(publish("live", 1, 21, "live-published"));

    const v2 = await noteConfig(panelV2, 2);
    const prepared = await prepareNotes(repository, v2);
    expect(prepared.plan.isValid).toBe(true);
    await syncNotes(repository, v2, 30, prepared);
    expect(await envelopeRows(sql)).toEqual(
      ["live-draft", "live-published"].map((snapshot) => ({
        anchor: "intro",
        block_key: "n1",
        class_name: "lead",
        hidden: 1,
        settings_json: '{"align":"left","theme":"dark"}',
        snapshot_id: snapshot,
      })),
    );
    const live = (await repository.load({ entryId: contentEntryId("live") }))!;
    expect(live.draft.blocks[0]).toMatchObject({ schemaVersion: 2, settings: { theme: "dark" } });
    expect(live.published!.blocks[0]).toMatchObject({ anchor: "intro", hidden: true });
  },
);

contract(
  "preserves composite JSON and nested media through the complete lifecycle",
  async (runtime, expect) => {
    const config = await defineConfig({
      blocks: [
        defineBlock({
          type: "nested",
          version: 1,
          fields: {
            images: field.list({ item: field.group({ fields: { image: field.media() } }) }),
          },
        }),
      ],
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          route: "/blog/:slug",
          blocks: ["nested"],
          fields: {
            team: field.list({ item: field.group({ fields: { photo: field.media() } }) }),
            empty: field.group({ fields: {} }),
          },
        }),
        definePage({
          key: "home",
          version: 1,
          path: "/",
          blocks: [],
          fields: { images: field.list({ item: field.media() }) },
        }),
        defineGlobal({
          key: "settings",
          version: 1,
          blocks: [],
          fields: { images: field.list({ item: field.media() }) },
        }),
      ],
    });
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "home", "settings");
    for (const id of ["visible", "hidden", "draft-only"]) await seedMedia(sql, id);
    const useCases = new ContentUseCases({
      clock: { now: () => unixMilliseconds(10) },
      config: config.runtime,
      content: repository,
      media: repository,
      idGenerator: { next: sequence("composite") },
    });
    const blocks = [
      {
        type: "nested",
        schemaVersion: 1,
        key: blockKey("nested"),
        position: 1000,
        hidden: true,
        data: { images: [{ image: "hidden" }] },
      },
    ];
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Nested",
      slug: "nested",
      blocks,
      fields: { team: [{ photo: "visible" }], empty: {} },
    });
    const references = () =>
      sql.all(
        "select source_key, field_path, media_id from content_media_references where snapshot_id = ? order by source_key, field_path",
        created.draft.id,
      );
    expect(await references()).toEqual([
      { source_key: "$fields", field_path: "/team/0/photo", media_id: "visible" },
      { source_key: "nested", field_path: "/images/0/image", media_id: "hidden" },
    ]);
    await useCases.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
    expect(await repository.loadPublic("/blog/nested")).toMatchObject({
      entry: { published: { fields: { team: [{ photo: "visible" }], empty: {} }, blocks: [] } },
    });
    expect(await repository.loadPublicMedia("visible")).not.toBeNull();
    expect(await repository.loadPublicMedia("hidden")).toBeNull();
    expect((await readAllBuildContentPages(repository)).entries[0]).toMatchObject({
      entry: { published: { fields: created.draft.fields, blocks: [] } },
    });
    const listed = await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") });
    expect(listed.items[0]!.entry.published!.fields).toEqual(created.draft.fields);
    for (const modelKey of ["home", "settings"]) {
      const singleton = await useCases.create({
        actor: editor,
        modelKey,
        title: "Singleton",
        fields: { images: ["visible"] },
        blocks: [],
      });
      await useCases.publish({ actor: admin, entryId: singleton.id, expectedRevision: 1 });
    }
    expect((await repository.loadPublic("/"))!.entry.published!.fields).toEqual({
      images: ["visible"],
    });
    expect(
      (await repository.loadPublicGlobal(contentModelKey("settings")))!.entry.published!.fields,
    ).toEqual({ images: ["visible"] });
    expect(
      (await readAllBuildContentPages(repository)).globals[0]!.entry.published!.fields,
    ).toEqual({
      images: ["visible"],
    });
    const version = await repository.publishedContentVersion();
    expect(
      (await repository.updateMediaMetadata(metadataUpdate("hidden", 1, 11, { alt: "Hidden" })))
        .targetVersion,
    ).toBe(version + 1);
    expect(
      (await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("hidden") }))[0]!.locations,
    ).toContainEqual({
      source: "block",
      blockKey: "nested",
      blockType: "nested",
      field: "/images/0/image",
      states: ["draft", "published"],
    });
    const saved = await useCases.save({
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      title: "Changed",
      slug: "nested",
      blocks,
      fields: { team: [{ photo: "draft-only" }, { photo: "visible" }], empty: {} },
    });
    expect(await references()).toEqual([
      { source_key: "$fields", field_path: "/team/0/photo", media_id: "draft-only" },
      { source_key: "$fields", field_path: "/team/1/photo", media_id: "visible" },
      { source_key: "nested", field_path: "/images/0/image", media_id: "hidden" },
    ]);
    expect(await repository.loadPublicMedia("draft-only")).toBeNull();
    await expect(
      useCases.save({
        actor: editor,
        entryId: created.id,
        expectedRevision: 1,
        title: "Stale",
        blocks: [],
        fields: {},
      }),
    ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    const duplicate = await useCases.duplicate({
      actor: editor,
      entryId: created.id,
      expectedRevision: saved.draft.revision,
    });
    expect(duplicate.draft.fields).toEqual(saved.draft.fields);
    expect(duplicate.draft.blocks[0]!.key).not.toBe("nested");
    expect(
      await sql.get(
        "select source_key, field_path from content_media_references where snapshot_id = ? and media_id = 'hidden'",
        duplicate.draft.id,
      ),
    ).toEqual({ source_key: duplicate.draft.blocks[0]!.key, field_path: "/images/0/image" });
    const reverted = await useCases.revertDraft({
      actor: editor,
      entryId: created.id,
      expectedRevision: 2,
    });
    expect(reverted.draft.fields).toEqual(created.draft.fields);
    expect(await references()).not.toContainEqual(
      expect.objectContaining({ media_id: "draft-only" }),
    );
    await useCases.delete({ actor: editor, entryId: duplicate.id, expectedRevision: 1 });
    await useCases.delete({
      actor: admin,
      entryId: created.id,
      expectedRevision: reverted.draft.revision,
    });
    expect(
      (
        await repository.markForDeletion({
          mediaId: mediaId("hidden"),
          requestedBy: editor,
          requestedAt: unixMilliseconds(12),
        })
      ).status,
    ).toBe("deleting");
  },
);

contract(
  "migration scans count model lists and every unchanged hidden block before writes",
  async (runtime, expect) => {
    const other = defineBlock({
      type: "other",
      version: 1,
      fields: { rows: field.list({ item: field.text() }) },
    });
    const old = defineBlock({ type: "note", version: 1, fields: { image: field.media() } });
    const next = defineBlock({
      type: "note",
      version: 2,
      fields: { images: field.list({ item: field.media() }) },
      migrations: { 2: ({ data }) => ({ data: { images: [data.image!] } }) },
    });
    const configuration = (note: BlockDefinition, version: number) =>
      defineConfig({
        blocks: [other, note],
        content: [
          defineCollection({
            key: "posts",
            version,
            route: "/blog/:slug",
            blocks: ["note", "other"],
            fields: { rows: field.list({ item: field.text() }) },
          }),
        ],
      });
    const before = await configuration(old, 1);
    const after = await configuration(next, 2);
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await syncNotes(repository, before, 1);
    await seedMedia(sql, "m-1");
    const blocks: ContentBlock[] = [
      note("n1", { image: "m-1" }, 1000),
      ...Array.from({ length: 4 }, (_, i) => ({
        ...note(`n${i + 2}`, { rows: Array(100).fill("x") }, (i + 2) * 1000),
        type: "other",
        hidden: true,
      })),
    ];
    await repository.create({
      entry: entry("budget", "posts", {
        blocks,
        fields: { rows: Array(100).fill("x") },
        slug: "budget",
        updatedAt: 2,
      }),
      mediaReferences: [{ sourceKey: blockKey("n1"), fieldPath: "image", mediaId: mediaId("m-1") }],
    });
    const refused = await prepareNotes(repository, after);
    expect(refused.plan.isValid).toBe(false);
    expect(refused.report.text).toContain("too_many_list_items");
    expect(
      (await repository.load({ entryId: contentEntryId("budget") }))!.draft.blocks[0]!
        .schemaVersion,
    ).toBe(1);
    await repository.saveCompleteDraft({
      entryId: contentEntryId("budget"),
      mutation: {
        blocks,
        fields: { rows: Array(99).fill("x") },
        expectedRevision: 1,
        title: "Budget",
        slug: "budget",
        updatedBy: editor,
        updatedAt: unixMilliseconds(5),
        mediaReferences: [
          { sourceKey: blockKey("n1"), fieldPath: "image", mediaId: mediaId("m-1") },
        ],
      },
    });
    await repository.publish(publish("budget", 2, 6, "budget-published"));
    const prepared = await prepareNotes(repository, after);
    expect(prepared.plan.isValid).toBe(true);
    await syncNotes(repository, after, 10, prepared);
    const loaded = (await repository.load({ entryId: contentEntryId("budget") }))!;
    for (const snapshot of [loaded.draft, loaded.published!]) {
      expect(snapshot.blocks[0]).toMatchObject({ schemaVersion: 2, data: { images: ["m-1"] } });
      expect(snapshot.fields.rows).toHaveLength(99);
      expect(
        await sql.get(
          "select field_path from content_media_references where snapshot_id = ? and source_key = 'n1'",
          snapshot.id,
        ),
      ).toEqual({ field_path: "/images/0" });
    }
    expect((await prepareNotes(repository, after)).plan.isValid).toBe(true);
    const incompatible = await defineConfig({
      blocks: [other, next],
      content: [
        defineCollection({
          key: "posts",
          version: 3,
          route: "/blog/:slug",
          blocks: ["note", "other"],
          fields: { rows: field.list({ item: field.text(), maxItems: 90 }) },
        }),
      ],
    });
    const state = await lifecycleState(sql);
    const refusedEvolution = await prepareNotes(repository, incompatible);
    expect(refusedEvolution.plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATED" }),
    );
    await expect(syncNotes(repository, incompatible, 12, refusedEvolution)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(state);
  },
);

contract(
  "nested synchronization rewrites parent/child hints and references atomically",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      blocks: ["image"],
      fields: {
        links: field.list({
          item: field.group({
            fields: { headline: field.text(), photo: field.media(), legacy: field.media() },
          }),
        }),
        optional: field.group({ fields: { note: field.text() } }),
        required: field.text({ required: true }),
      },
    });
    const v2 = await evolvingPosts({
      version: 2,
      blocks: ["image"],
      removedFields: ["/cards/*/legacy"],
      fields: {
        cards: field.list({
          renamedFrom: "links",
          item: field.group({
            fields: {
              title: field.text({ renamedFrom: "headline" }),
              image: field.media({ renamedFrom: "photo" }),
              caption: field.text({ defaultValue: "new" }),
              requiredChild: field.text({ required: true }),
            },
          }),
        }),
        optional: field.group({ fields: { note: field.text({ defaultValue: "optional" }) } }),
        required: field.text({ required: true }),
      },
    });
    let fail = false;
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([v1]),
      beforeMutation(checkpoint) {
        if (fail && checkpoint === "sync.model.rewrite-fields.1")
          throw new Error("nested injected failure");
      },
    });
    await applySync(repository, [v1], 1);
    await seedMedia(sql, "nested-keep");
    await seedMedia(sql, "nested-drop");
    const originalFields = {
      links: [
        { headline: "First", photo: "nested-keep", legacy: "nested-drop" },
        { headline: "Second" },
      ],
      optional: {},
    };
    await repository.create({
      entry: entry("nested", "posts", {
        fields: originalFields,
        slug: "nested",
        updatedAt: 2,
        blocks: [
          {
            data: { image: "nested-keep" },
            hidden: true,
            key: blockKey("retained"),
            position: 1000,
            schemaVersion: 1,
            settings: {},
            type: "image",
          },
        ],
      }),
      mediaReferences: [
        { sourceKey: blockKey("retained"), fieldPath: "image", mediaId: mediaId("nested-keep") },
        { sourceKey: "$fields", fieldPath: "/links/0/photo", mediaId: mediaId("nested-keep") },
        { sourceKey: "$fields", fieldPath: "/links/0/legacy", mediaId: mediaId("nested-drop") },
      ],
    });
    await repository.publish(publish("nested", 1, 3, "nested-publication"));
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("nested-drop"),
        requestedBy: editor,
        requestedAt: unixMilliseconds(3),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
    const before = await lifecycleState(sql);
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan.isValid).toBe(true);
    expect(await lifecycleState(sql)).toEqual(before);
    fail = true;
    await expect(applySync(repository, [v2], 4, prepared)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(before);
    expect((await repository.readConfigurationSyncState())[0]!.version).toBe(1);
    fail = false;
    const version = await repository.publishedContentVersion();
    await expect(applySync(repository, [v2], 5, prepared)).resolves.toMatchObject({
      status: "applied",
      targetVersion: version + 1,
    });
    const loaded = (await repository.load({ entryId: contentEntryId("nested") }))!;
    for (const snapshot of [loaded.draft, loaded.published!]) {
      expect(snapshot.fields).toEqual({
        cards: [
          { title: "First", image: "nested-keep", caption: "new" },
          { title: "Second", caption: "new" },
        ],
        optional: { note: "optional" },
      });
      expect(snapshot.revision).toBe(1);
      expect(snapshot.updatedAt).toBe(snapshot.state === "draft" ? 2 : 3);
      expect(
        await sql.all(
          "select source_key,field_path,media_id from content_media_references where snapshot_id=? order by source_key",
          snapshot.id,
        ),
      ).toEqual([
        { source_key: "$fields", field_path: "/cards/0/image", media_id: "nested-keep" },
        { source_key: "retained", field_path: "image", media_id: "nested-keep" },
      ]);
    }
    expect(await repository.loadMediaUsage({ mediaId: mediaId("nested-drop"), limit: 20 })).toEqual(
      [],
    );
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("nested-drop"),
        requestedBy: editor,
        requestedAt: unixMilliseconds(6),
      }),
    ).resolves.toMatchObject({ status: "deleting" });
    const completed = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 6)).resolves.toMatchObject({ status: "noop" });
    expect(await lifecycleState(sql)).toEqual(completed);
  },
);

contract(
  "nested synchronization scans and rewrites multiple snapshot pages and rejects stale saves/publication/duplication",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      blocks: [],
      fields: { profile: field.group({ fields: { name: field.text() } }) },
    });
    const v2 = await evolvingPosts({
      version: 2,
      blocks: [],
      fields: {
        profile: field.group({
          fields: {
            title: field.text({ renamedFrom: "name" }),
            enabled: field.boolean({ defaultValue: true }),
          },
        }),
      },
    });
    const { repository, sql, reopen } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 1);
    for (let index = 0; index < 103; index++)
      await repository.create({
        entry: entry(`nested-${index}`, "posts", {
          fields: index === 0 ? {} : { profile: { name: String(index) } },
          slug: `nested-${index}`,
          updatedAt: 2,
        }),
        mediaReferences: [],
      });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan.isValid).toBe(true);
    expect(prepared.plan.operations[0]).toMatchObject({
      evolution: { snapshots: { draft: 103, published: 0 } },
    });
    await reopen().saveCompleteDraft({
      entryId: contentEntryId("nested-1"),
      mutation: {
        blocks: [],
        fields: { profile: { name: "new" } },
        expectedRevision: 1,
        title: "Saved",
        updatedAt: unixMilliseconds(3),
        updatedBy: editor,
        mediaReferences: [],
      },
    });
    const changed = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 4, prepared)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(changed);
    const beforePublication = await prepareConfigurationSynchronization({
      models: [v2],
      state: repository,
    });
    await repository.publish(publish("nested-2", 1, 4, "nested-2-published"));
    const published = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 5, beforePublication)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(published);
    const beforeDuplicate = await prepareConfigurationSynchronization({
      models: [v2],
      state: repository,
    });
    await repository.create({
      duplicateOf: { entryId: contentEntryId("nested-2"), expectedRevision: 1 },
      entry: entry("nested-duplicate", "posts", {
        fields: { profile: { name: "2" } },
        updatedAt: 5,
      }),
      mediaReferences: [],
    });
    const duplicated = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 6, beforeDuplicate)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(duplicated);
    await applySync(repository, [v2], 7);
    expect((await repository.load({ entryId: contentEntryId("nested-0") }))!.draft.fields).toEqual(
      {},
    );
    expect((await repository.load({ entryId: contentEntryId("nested-1") }))!.draft.fields).toEqual({
      profile: { title: "new", enabled: true },
    });
    expect(
      await count(
        sql,
        "select count(*) as count from content_snapshots where json_extract(fields_json,'$.profile.enabled')=1",
      ),
    ).toBe(104);
  },
);

contract(
  "nested model defaults compose with block migration budgets before any writes",
  async (runtime, expect) => {
    const other = defineBlock({
      type: "other",
      version: 1,
      fields: { rows: field.list({ item: field.text() }) },
    });
    const old = defineBlock({
      type: "note",
      version: 1,
      fields: { label: field.text() },
      settings: { tone: field.select({ options: ["dark", "light"], defaultValue: "dark" }) },
    });
    const next = defineBlock({
      type: "note",
      version: 2,
      fields: { rows: field.list({ item: field.text() }) },
      settings: { tone: field.select({ options: ["dark", "light"], defaultValue: "dark" }) },
      migrations: { 2: ({ settings }) => ({ data: { rows: Array(30).fill("m") }, settings }) },
    });
    const config = (noteBlock: BlockDefinition, version: number, added = 0) =>
      defineConfig({
        blocks: [other, noteBlock],
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version,
            blocks: ["other", "note"],
            fields: {
              rows: field.list({ item: field.text() }),
              required: field.text({ required: true }),
              profile: field.group({
                fields: added
                  ? {
                      extra: field.list({
                        item: field.text(),
                        defaultValue: Array(added).fill("f"),
                      }),
                    }
                  : {},
              }),
            },
          }),
        ],
      });
    const beforeConfig = await config(old, 1);
    const overflowConfig = await config(next, 2, 20);
    const validConfig = await config(next, 2, 10);
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await syncNotes(repository, beforeConfig, 1);
    await repository.create({
      entry: entry("nested-budget", "posts", {
        slug: "budget",
        updatedAt: 2,
        fields: { rows: Array(60).fill("x"), profile: {} },
        blocks: [
          { ...note("migration", { label: "old" }), settings: { tone: "light" } },
          ...Array.from({ length: 4 }, (_, index) => ({
            ...note(`kept-${index}`, { rows: Array(100).fill("x") }, (index + 3) * 1000),
            type: "other",
            hidden: true,
          })),
        ],
      }),
      mediaReferences: [],
    });
    await repository.publish(publish("nested-budget", 1, 3, "nested-budget-publication"));
    const before = await lifecycleState(sql);
    const refused = await prepareNotes(repository, overflowConfig);
    expect(refused.plan.isValid).toBe(false);
    expect(refused.plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "BACKFILL_EXCEEDS_LIMIT" }),
    );
    await expect(syncNotes(repository, overflowConfig, 4, refused)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(before);
    const valid = await prepareNotes(repository, validConfig);
    expect(valid.plan.isValid).toBe(true);
    await syncNotes(repository, validConfig, 5, valid);
    const loaded = (await repository.load({ entryId: contentEntryId("nested-budget") }))!;
    for (const snapshot of [loaded.draft, loaded.published!]) {
      expect(snapshot.fields.profile).toEqual({ extra: Array(10).fill("f") });
      expect(snapshot.blocks[0]).toMatchObject({
        schemaVersion: 2,
        data: { rows: Array(30).fill("m") },
        settings: { tone: "light" },
      });
    }
  },
);

contract(
  "nested synchronization refuses type loss, bounds and media defaults without writes",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      blocks: [],
      fields: {
        links: field.list({
          item: field.group({ fields: { title: field.text(), image: field.media() } }),
        }),
      },
    });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 1);
    await seedEvolvingEntries(repository, {
      draft: { links: [] },
      published: { links: [{ title: "stored" }] },
    });
    const baseline = await lifecycleState(sql);
    const scenarios = [
      {
        definition: field.list({ item: field.group({ fields: { image: field.media() } }) }),
        code: "FIELD_REMOVAL_HAS_DATA",
      },
      {
        definition: field.list({
          item: field.group({ fields: { title: field.number(), image: field.media() } }),
        }),
        code: "FIELD_TYPE_CHANGED",
      },
      {
        definition: field.list({
          maxItems: 0,
          item: field.group({ fields: { title: field.text(), image: field.media() } }),
        }),
        code: "CONSTRAINT_VIOLATED",
      },
      {
        definition: field.list({
          minItems: 2,
          item: field.group({ fields: { title: field.text(), image: field.media() } }),
        }),
        code: "CONSTRAINT_VIOLATED",
        count: 1,
      },
      {
        definition: field.list({
          item: field.group({
            fields: { title: field.text(), image: field.media({ defaultValue: "media-default" }) },
          }),
        }),
        code: "MEDIA_DEFAULT_BACKFILL_UNSUPPORTED",
      },
    ];
    for (const scenario of scenarios) {
      const v2 = await evolvingPosts({
        version: 2,
        blocks: [],
        fields: { links: scenario.definition },
      });
      const prepared = await prepareConfigurationSynchronization({
        models: [v2],
        state: repository,
      });
      expect(prepared.plan.diagnostics).toContainEqual(
        expect.objectContaining({
          code: scenario.code,
          ...(scenario.count === undefined ? {} : { affectedCount: scenario.count }),
        }),
      );
      await expect(applySync(repository, [v2], 30, prepared)).rejects.toThrow();
      expect(await lifecycleState(sql)).toEqual(baseline);
    }
    const valid = await evolvingPosts({
      version: 2,
      blocks: [],
      fields: {
        links: field.list({
          minItems: 1,
          item: field.group({
            fields: {
              title: field.text({ required: true }),
              image: field.media(),
              newRequired: field.text({ required: true }),
            },
          }),
        }),
      },
    });
    await expect(applySync(repository, [valid], 31)).resolves.toMatchObject({ status: "applied" });
    expect(
      (await repository.load({ entryId: contentEntryId("draft-only") }))!.draft.fields,
    ).toEqual({ links: [] });
  },
);

contract(
  "CE9A placeholder-only sync preserves populated snapshots and stale guards",
  async (runtime, expect) => {
    const make = async (placeholder?: string) =>
      (
        await defineConfig({
          content: [
            defineCollection({
              key: "posts",
              route: "/posts/:slug",
              version: 1,
              fields: {
                nested: field.group({
                  fields: {
                    title: field.text({ ...(placeholder === undefined ? {} : { placeholder }) }),
                  },
                }),
              },
            }),
          ],
        })
      ).runtime.content;
    const original = await make();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(original),
      nextId: sequence("guidance"),
    });
    await applySync(repository, original, 10);
    const created = entry("guidance-entry", "posts", {
      updatedAt: 15,
      slug: "guidance",
      fields: { nested: { title: "Stored" } },
    });
    await repository.create({ entry: created, mediaReferences: [] });
    await repository.publish(publish("guidance-entry", 1, 20));
    const before = await repository.load({ entryId: created.id });
    for (const [index, placeholder] of ["Title", "New title", undefined].entries()) {
      const models = await make(placeholder);
      expect(models[0]!.structureHash).toBe(original[0]!.structureHash);
      const plan = await prepareConfigurationSynchronization({ models, state: repository });
      expect(plan.plan.operations).toMatchObject([{ action: "label-update" }]);
      await applySync(repository, models, 30 + index, plan);
      expect(await repository.load({ entryId: created.id })).toEqual(before);
    }
    const models = await make("Stale");
    const plan = await prepareConfigurationSynchronization({ models, state: repository });
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "concurrent",
      "posts",
    );
    await expect(applySync(repository, models, 40, plan)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await repository.load({ entryId: created.id })).toEqual(before);
  },
);
contract(
  "CE9B layout-only sync preserves populated snapshots and stale guards",
  async (runtime, expect) => {
    const make = async (label?: string) =>
      (
        await defineConfig({
          blocks: [
            defineBlock({
              type: "layout",
              version: 1,
              fields: { title: field.text() },
              settings: { size: field.number({ defaultValue: 1 }) },
              ...(label === undefined
                ? {}
                : {
                    layout: { mode: "tabs", groups: [{ key: "main", label, fields: ["title"] }] },
                    settingsLayout: {
                      mode: "sections",
                      groups: [{ key: "style", label, fields: ["size"] }],
                    },
                  }),
            }),
          ],
          content: [
            defineCollection({
              key: "posts",
              route: "/posts/:slug",
              version: 1,
              blocks: ["layout"],
              ...(label === undefined
                ? {}
                : {
                    layout: { mode: "tabs", groups: [{ key: "main", label, fields: ["nested"] }] },
                  }),
              fields: {
                nested: field.group({
                  fields: {
                    title: field.text(),
                    photo: field.media(),
                    links: field.list({ item: field.text() }),
                  },
                  ...(label === undefined
                    ? {}
                    : {
                        layout: {
                          mode: "sections",
                          groups: [{ key: "main", label, fields: ["title", "photo", "links"] }],
                        },
                      }),
                }),
              },
            }),
          ],
        })
      ).runtime.content;
    const original = await make();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(original),
      nextId: sequence("guidance"),
    });
    await applySync(repository, original, 10);
    await seedMedia(sql, "layout-media");
    const created = entry("guidance-entry", "posts", {
      updatedAt: 15,
      slug: "guidance",
      fields: { nested: { title: "Stored", photo: "layout-media", links: ["first", "second"] } },
      blocks: [
        { ...block("layout-key", "layout", 1000, { title: "Block" }), settings: { size: 2 } },
      ],
    });
    await repository.create({
      entry: created,
      mediaReferences: [
        { sourceKey: "$fields", fieldPath: "/nested/photo", mediaId: mediaId("layout-media") },
      ],
    });
    await repository.publish(publish("guidance-entry", 1, 20));
    const before = await repository.load({ entryId: created.id });
    const unchanged = async () => ({
      references: await sql.all("select * from content_media_references order by snapshot_id"),
      published: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events"),
    });
    const state = await unchanged();
    for (const [index, placeholder] of ["Title", "New title", undefined].entries()) {
      const models = await make(placeholder);
      expect(models[0]!.structureHash).toBe(original[0]!.structureHash);
      const plan = await prepareConfigurationSynchronization({ models, state: repository });
      expect(plan.plan.operations).toMatchObject([{ action: "label-update" }]);
      await applySync(repository, models, 30 + index, plan);
      expect(await repository.load({ entryId: created.id })).toEqual(before);
      const nextState = await unchanged();
      expect(nextState.references).toEqual(state.references);
      expect(nextState.published).toMatchObject([{ version: 3 + index }]);
      expect(nextState.outbox).toHaveLength(1);
      expect(
        JSON.parse((nextState.outbox[0] as { payload_json: string }).payload_json),
      ).toMatchObject({ reason: "configuration_sync", targetVersion: 3 + index });
      expect(
        (await prepareConfigurationSynchronization({ models, state: repository })).plan.operations,
      ).toEqual([]);
    }
    const models = await make("Stale");
    const plan = await prepareConfigurationSynchronization({ models, state: repository });
    const beforeStale = await unchanged();
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "concurrent",
      "posts",
    );
    await expect(applySync(repository, models, 40, plan)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await repository.load({ entryId: created.id })).toEqual(before);
    expect(await unchanged()).toEqual(beforeStale);
  },
);

/** Media IDs each page entry and global delivers, in path then key order. */
function deliveredMediaIds(items: readonly { readonly media: readonly MediaMetadata[] }[]) {
  return [...new Set(items.flatMap((item) => item.media.map((value) => String(value.id))))].sort();
}

/**
 * A site with routed entries in every path position, a global, SEO and block
 * media, media referenced only by a hidden block, and draft-only content.
 */
async function seedExportSite(repository: ContractRepository, sql: ContractSql): Promise<void> {
  await seedModels(sql, "home", "posts", "settings");
  for (const id of ["media-1", "media-2", "media-3", "media-4", "media-5", "media-6"]) {
    await seedMedia(sql, id);
  }
  const home = entry("home", "home", {
    blocks: [
      heroBlock("home-hero", "media-1"),
      envelopeBlock("home-hidden", "media-5", { hidden: true }, 2000),
    ],
    fields: { title: "Home" },
    updatedAt: 1,
  });
  await repository.create({
    entry: home,
    mediaReferences: [
      blockReference("media-1", "home-hero"),
      blockReference("media-5", "home-hidden"),
    ],
  });
  await repository.publish(publish("home", 1, 2, "home-published"));
  const posts: readonly [string, readonly string[]][] = [
    ["post-d", ["media-2"]],
    ["post-a", ["media-2"]],
    ["post-c", ["media-3"]],
    ["post-b", []],
  ];
  for (const [id, media] of posts) {
    const value = entry(id, "posts", {
      blocks: media.map((image) => heroBlock(`${id}-block`, image)),
      fields: { title: id },
      slug: id,
      updatedAt: 3,
    });
    await repository.create({
      entry:
        id === "post-b"
          ? createContentEntry({
              draft: { ...value.draft, seo: { image: mediaId("media-4"), title: "B" } },
              id: value.id,
              model: value.model,
            })
          : value,
      mediaReferences: [
        ...media.map((image) => blockReference(image, `${id}-block`)),
        ...(id === "post-b" ? [seoReference("media-4")] : []),
      ],
    });
    await repository.publish(publish(id, 1, 4, `${id}-published`));
  }
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [heroBlock("draft-only-block", "media-6")],
      slug: "draft-only",
      updatedAt: 5,
    }),
    mediaReferences: [blockReference("media-6", "draft-only-block")],
  });
  await repository.create({
    entry: globalEntry("settings", 6, "media-1"),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey("settings-block") },
    ],
  });
  await repository.publish(publish("settings", 1, 7, "settings-published"));
}

contract(
  "pages the build export by path with first-page globals and per-page media",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedExportSite(repository, sql);
    const version = await repository.publishedContentVersion();

    const paged = await readAllBuildContentPages(repository, 2);
    expect(paged.pages.map((page) => page.entries.map((item) => item.path))).toEqual([
      ["/", "/blog/post-a"],
      ["/blog/post-b", "/blog/post-c"],
      ["/blog/post-d"],
    ]);
    expect(paged.pages.map((page) => page.version)).toEqual([version, version, version]);
    expect(paged.pages.map((page) => page.nextCursor === undefined)).toEqual([false, false, true]);
    expect(paged.pages[0]!.globals!.map((item) => item.entry.id)).toEqual(["settings"]);
    for (const page of paged.pages.slice(1)) expect(page).not.toHaveProperty("globals");

    // Each page delivers exactly its own media; hidden-only and draft-only media never appear.
    expect(
      paged.pages.map((page) => deliveredMediaIds([...page.entries, ...(page.globals ?? [])])),
    ).toEqual([["media-1", "media-2"], ["media-3", "media-4"], ["media-2"]]);
    expect(paged.entries[0]!.entry.published!.blocks.map((block) => block.key)).toEqual([
      "home-hero",
    ]);
    expect(paged.entries.map((item) => item.entry.id)).not.toContain("draft-only");
    expect(paged.entries[2]!.entry.published!.seo).toEqual({ image: "media-4", title: "B" });

    // Concatenated pages equal one complete page sequence of the same state.
    const complete = await readAllBuildContentPages(repository);
    expect(complete.pages).toHaveLength(1);
    expect(complete.pages[0]).not.toHaveProperty("nextCursor");
    expect(paged.entries).toEqual(complete.entries);
    expect(paged.globals).toEqual(complete.globals);
    expect(deliveredMediaIds([...paged.entries, ...paged.globals])).toEqual([
      "media-1",
      "media-2",
      "media-3",
      "media-4",
    ]);

    // A site without routed entries still delivers its globals on the only page.
    await repository.unpublish(unpublishCommand("home", "home-published", 10));
    for (const id of ["post-a", "post-b", "post-c", "post-d"]) {
      await repository.unpublish(unpublishCommand(id, `${id}-published`, 11));
    }
    const globalsOnly = await repository.exportBuildContentPage({ limit: 1 });
    expect(globalsOnly.entries).toEqual([]);
    expect(globalsOnly.globals!.map((item) => item.entry.id)).toEqual(["settings"]);
    expect(globalsOnly).not.toHaveProperty("nextCursor");
    expect(deliveredMediaIds(globalsOnly.globals!)).toEqual(["media-1"]);

    for (const limit of [0, 101, 1.5]) {
      await expect(repository.exportBuildContentPage({ limit })).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
    }
  },
);

contract("ends build-export pages at the stored byte budget", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  const text = (length: number) => "x".repeat(length);
  // About 1.8 MB each: two fit the 4 MB budget, a third does not.
  const sizes: readonly [string, number][] = [
    ["p1", 1],
    ["p2", 1],
    ["p3", 1],
    ["p4", 5],
    ["p5", 0],
  ];
  for (const [id, extraBlocks] of sizes) {
    const blocks =
      extraBlocks === 0
        ? []
        : Array.from({ length: extraBlocks }, (_, index) =>
            Object.freeze({
              ...heroBlock(`${id}-big-${index}`, "media-1", text(900_000), "hero", 1000 + index),
            }),
          );
    await repository.create({
      entry: entry(id, "posts", {
        blocks: [
          ...blocks,
          // A hidden block never counts against the budget.
          envelopeBlock(`${id}-hidden`, "media-1", { hidden: true }, 9000),
        ],
        fields: { body: id === "p5" ? "small" : text(900_000) },
        slug: id,
        updatedAt: 1,
      }),
      mediaReferences: [],
    });
    await repository.publish(publish(id, 1, 2, `${id}-published`));
  }
  const paged = await readAllBuildContentPages(repository);
  // p4 alone holds about 5.4 MB and is delivered on its own page.
  expect(paged.pages.map((page) => page.entries.map((item) => item.path))).toEqual([
    ["/blog/p1", "/blog/p2"],
    ["/blog/p3"],
    ["/blog/p4"],
    ["/blog/p5"],
  ]);
  expect(paged.entries[3]!.entry.published!.blocks).toHaveLength(5);
  // The entry limit ends a page before the budget does.
  const limited = await readAllBuildContentPages(repository, 1);
  expect(limited.pages.map((page) => page.entries.length)).toEqual([1, 1, 1, 1, 1]);
});

contract(
  "refuses build-export cursors of a changed published state or another list",
  async (runtime, expect) => {
    const models = [syncPage(), syncCollection(), syncGlobal()];
    const notes = syncCollection({
      key: "notes",
      projectionHash: "projection-notes",
      route: "/notes/:slug",
      structureHash: "structure-notes",
    });
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([...models, notes]),
    });
    await applySync(repository, models, 1);
    await seedMedia(sql, "media-1");
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      await repository.create({
        entry: entry(id, "posts", {
          blocks: [heroBlock(`${id}-block`, "media-1")],
          slug: id,
          updatedAt: 2,
        }),
        mediaReferences: [blockReference("media-1", `${id}-block`)],
      });
      if (id !== "f") await repository.publish(publish(id, 1, 3, `${id}-published`));
    }

    const mutations: readonly [string, () => Promise<unknown>][] = [
      ["publish", () => repository.publish(publish("f", 1, 4, "f-published"))],
      ["unpublish", () => repository.unpublish(unpublishCommand("f", "f-published", 5))],
      [
        "delete",
        () =>
          repository.delete({
            deletedAt: unixMilliseconds(6),
            deletedBy: editor,
            entryId: contentEntryId("e"),
            expectedPublishedSnapshotId: contentSnapshotId("e-published"),
            expectedRevision: 1,
          }),
      ],
      ["media metadata", () => repository.updateMediaMetadata(metadataUpdate("media-1", 1, 7))],
      ["sync", () => applySync(repository, [...models, notes], 8)],
    ];
    for (const [name, mutate] of mutations) {
      const first = await repository.exportBuildContentPage({ limit: 1 });
      expect(first.nextCursor, name).toBeDefined();
      await mutate();
      const actual = await repository.publishedContentVersion();
      expect(actual, name).toBe(first.version + 1);
      const failure = await repository
        .exportBuildContentPage({ after: first.nextCursor!, limit: 1 })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure, name).toMatchObject({
        actualVersion: actual,
        code: "BUILD_EXPORT_VERSION_CHANGED",
        expectedVersion: first.version,
      });
    }

    const current = await repository.exportBuildContentPage({ limit: 1 });
    expect(
      (await repository.exportBuildContentPage({ after: current.nextCursor!, limit: 1 })).entries,
    ).toHaveLength(1);
    const collectionCursor = (
      await repository.listPublic({ limit: 1, modelKey: contentModelKey("posts") })
    ).nextCursor!;
    for (const after of [collectionCursor, "not-a-cursor", base64Url({ kind: "build-export" })]) {
      await expect(
        repository.exportBuildContentPage({ after: after as never, limit: 1 }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE", name: "BuildExportCursorError" });
    }
  },
);

export const contentRepositoryContractCases: readonly RepositoryContractCase[] =
  Object.freeze(cases);
