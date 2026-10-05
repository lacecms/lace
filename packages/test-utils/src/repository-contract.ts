import {
  applyPreparedConfigurationSynchronization,
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
  MediaReadPort,
  PublicContentReadPort,
  SaveCompleteDraftInput,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
  SiteBuildReadPort,
} from "@lacecms/application";
import type { NormalizedContentModel } from "@lacecms/config";
import type { JsonObject } from "@lacecms/content";
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
import type { Actor, ContentBlock, ContentEntry, ContentModelRoute } from "@lacecms/domain";
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
  MediaReadPort &
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

const editor: Actor = Object.freeze({ id: actorId("editor"), role: "editor" });
const admin: Actor = Object.freeze({ id: actorId("admin"), role: "admin" });
const routes = new Map<string, ContentModelRoute>([
  ["posts", { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" }],
  ["home", { key: contentModelKey("home"), kind: "page", path: "/" }],
]);
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

async function seedModels(sql: ContractSql, ...keys: readonly ("home" | "posts")[]): Promise<void> {
  for (const key of keys) {
    await sql.run(
      "insert into content_models values (?, ?, ?, ?, ?, ?, ?, ?)",
      key,
      key === "home" ? "page" : "collection",
      key === "home" ? "Home" : "Posts",
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
  modelKey: "home" | "posts",
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
    key: blockKey(key),
    position,
    schemaVersion: 1,
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

function syncResolver(models: readonly SyncModel[]) {
  const values = new Map(models.map((model) => [String(model.key), model]));
  return (key: string): ContentModelRoute | undefined => {
    const model = values.get(key) as
      | { readonly kind: string; readonly path?: string; readonly route?: string }
      | undefined;
    if (model === undefined) return undefined;
    return model.kind === "page"
      ? { key: contentModelKey(key), kind: "page", path: model.path! }
      : { key: contentModelKey(key), kind: "collection", route: model.route! };
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
    expect(await sql.all("select id, status, target_version from site_builds")).toEqual([
      { id: first.eventId, status: "pending", target_version: 0 },
    ]);
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
    await expect(
      repository.recordSiteBuildSuccess({ leaseId: lease.id, now: unixMilliseconds(10_003) }),
    ).rejects.toThrow("expired");
    await repository.recordSiteBuildAccepted({
      leaseId: recovered.id,
      now: unixMilliseconds(10_003),
      providerBuildId: "provider-1",
    });
    await expect(
      repository.recordSiteBuildAccepted({
        leaseId: recovered.id,
        now: unixMilliseconds(10_003),
        providerBuildId: "provider-2",
      }),
    ).rejects.toThrow("expired");
    expect(
      await sql.get(
        "select status, provider_build_id, started_at from site_builds where id = ?",
        first.eventId,
      ),
    ).toEqual({ status: "running", provider_build_id: "provider-1", started_at: 10_003 });
    for (const now of [10_004, 10_005]) {
      await repository.completeAcceptedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "provider-1",
        now: unixMilliseconds(now),
        outcome: "succeeded",
      });
    }
    await expect(
      repository.completeAcceptedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "provider-1",
        now: unixMilliseconds(10_006),
        outcome: "failed",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.completeAcceptedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "other",
        now: unixMilliseconds(10_006),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(
      await sql.get("select status, completed_at from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "succeeded", completed_at: 10_004 });

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
        startedAt: 25_001,
        status: "failed",
        targetVersion: 0,
      },
      {
        completedAt: 10_004,
        id: first.eventId,
        providerBuildId: "provider-1",
        startedAt: 10_003,
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
    ).rejects.toThrow("failed build");
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
      entry: {
        draft: { id: "post-a-published", state: "draft" },
        id: "post-a",
        published: { id: "post-a-published" },
      },
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
    expect(await repository.exportBuildContent()).toMatchObject({
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
  const version = (await repository.exportBuildContent()).version;
  await expect(remove(1, 23)).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  await expect(remove(2, 23, "guarded-post-published")).rejects.toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  expect((await repository.exportBuildContent()).version).toBe(version);
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
      key: blockKey(key),
      position,
      schemaVersion: 1,
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

export const contentRepositoryContractCases: readonly RepositoryContractCase[] =
  Object.freeze(cases);
