import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  createConfigurationSyncSingletonEntry,
  configurationSyncAdvancesPublicState,
  siteBuildEvent,
  planConfigurationSynchronization,
  SITE_BUILD_DEBOUNCE_MS,
} from "@lacecms/application";
import type { ApplyConfigurationSynchronizationInput } from "@lacecms/application";
import { field } from "@lacecms/content";
import { contentModelKey, unixMilliseconds } from "@lacecms/domain";
import { afterEach, beforeEach, expect, test } from "vitest";
import { checkedInMigrations } from "../schema/migrations.js";
import { STORED_MODEL_STATE_SQL, storedModelStates } from "./model-state.js";
import type { StoredModelStateRow } from "./model-state.js";
import { SYNC_FIELD_REWRITE_ROWS_SQL, type SyncFieldRewriteRow } from "./field-rewrite.js";
import { configurationSyncRecursiveScans } from "./recursive-scans.js";
import { prepareConfigurationSync } from "./preflight.js";
import type { WritePlan } from "../write-plan/plan.js";
import { configurationSyncApplyResult, configurationSyncWritePlan } from "./write-plan.js";

type Model = ApplyConfigurationSynchronizationInput["models"][number];

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const collection = (key: string): Model => ({
  key,
  kind: "collection",
  blocks: [],
  fields: {},
  version: 1,
  structure: { fields: {} },
  structureHash: `structure-${key}`,
  projectionHash: hash(`projection-${key}`),
  publicProjectionHash: hash(`projection-${key}`),
});

let database: DatabaseSync;
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  for (const migration of checkedInMigrations)
    database.exec(
      readFileSync(new URL(`../../drizzle/${migration.name}`, import.meta.url), "utf8"),
    );
});
afterEach(() => database.close());

function stored() {
  return storedModelStates(
    database.prepare(STORED_MODEL_STATE_SQL).all() as unknown as StoredModelStateRow[],
  );
}

function reviewed(models: readonly Model[], at = 10): ApplyConfigurationSynchronizationInput {
  const expectedStoredModels = stored();
  const appliedAt = unixMilliseconds(at);
  const plan = planConfigurationSynchronization({ models, storedModels: expectedStoredModels });
  const singletonEntries = models
    .filter((model) => model.kind !== "collection")
    .map((model) =>
      createConfigurationSyncSingletonEntry({
        model,
        appliedAt,
        entryId: `e-${model.key}`,
        snapshotId: `s-${model.key}`,
      }),
    );
  const events = configurationSyncAdvancesPublicState(plan)
    ? [
        siteBuildEvent({
          reason: "configuration_sync",
          requestedAt: appliedAt,
          requestedBy: "system:content-sync",
          publishedSnapshotId: null,
        }),
      ]
    : [];
  return { appliedAt, events, evidence: {}, expectedStoredModels, models, plan, singletonEntries };
}

function execute(plan: WritePlan<"guard-miss">) {
  expect(
    database
      .prepare(`select 1 where ${plan.admission.sql}`)
      .get(...(plan.admission.params as SQLInputValue[])),
  ).toBeDefined();
  const slots: Record<string, readonly unknown[]> = {};
  let committedOutboxWork = false;
  const changes = plan.statements({ sql: "1", params: [] }).map((statement) => {
    const sql = database.prepare(statement.sql);
    const params = statement.params as SQLInputValue[];
    if (statement.slot !== undefined) {
      slots[statement.slot] = sql.all(...params);
      return 0;
    }
    const changes = Number(sql.run(...params).changes);
    if (statement.outbox && changes > 0) committedOutboxWork = true;
    return changes;
  });
  return { kind: "committed" as const, changes, slots, committedOutboxWork };
}

function applyWithReceipt(input: ApplyConfigurationSynchronizationInput, eventId: string) {
  const report = prepareConfigurationSync(input, stored());
  const receipt = execute(
    configurationSyncWritePlan(input, report, {
      linkDirtyToken: "sync-links",
      nextEventId: () => eventId,
    }),
  );
  return { report, receipt, result: configurationSyncApplyResult(report, receipt) };
}

function apply(input: ApplyConfigurationSynchronizationInput) {
  return applyWithReceipt(input, "sync-event").report;
}

test("rejects event requests inconsistent with the revalidated sync plan", () => {
  const input = reviewed([collection("posts")]);
  expect(input.events).toHaveLength(1);
  expect(() => apply({ ...input, events: [] })).toThrow("event requests do not match");
  expect(database.prepare("select count(*) as count from outbox_events").get()).toEqual({
    count: 0,
  });
  expect(database.prepare("select count(*) as count from content_models").get()).toEqual({
    count: 0,
  });
});

test("writes reviewed model identities in key order and creates only singleton drafts", () => {
  const posts = collection("posts");
  const discarded = collection("discard");
  const settings = {
    ...collection("settings"),
    kind: "global" as const,
    label: "Site settings",
    fields: { heading: field.text({ defaultValue: "Welcome" }) },
  };
  const home = { ...collection("home"), kind: "page" as const, path: "/" };
  const initial = reviewed([settings, posts, home, discarded]);
  const report = prepareConfigurationSync(initial, []);
  expect(report.operations.map(({ model }) => model.key)).toEqual([
    "discard",
    "home",
    "posts",
    "settings",
  ]);
  apply(initial);
  expect(
    database
      .prepare(`select e.model_key, e.published_snapshot_id, s.fields_json, s.title, s.updated_by
      from content_entries e join content_snapshots s on s.id=e.draft_snapshot_id order by e.model_key`)
      .all(),
  ).toEqual([
    {
      model_key: "home",
      published_snapshot_id: null,
      fields_json: "{}",
      title: "home",
      updated_by: "system:content-sync",
    },
    {
      model_key: "settings",
      published_snapshot_id: null,
      fields_json: '{"heading":"Welcome"}',
      title: "Site settings",
      updated_by: "system:content-sync",
    },
  ]);
  const articles = { ...posts, key: "articles", renamedFrom: "posts" };
  const relabeled = {
    ...settings,
    label: "Settings",
    projectionHash: hash("settings-full"),
    publicProjectionHash: hash("settings-public"),
  };
  const changes = reviewed([relabeled, articles, home]);
  expect(apply(changes).operations.map(({ action, model }) => [action, model.key])).toEqual([
    ["rename", "articles"],
    ["remove", "discard"],
    ["label-update", "settings"],
  ]);
  expect(stored()).toEqual([
    expect.objectContaining({
      key: "articles",
      structure: { fields: {} },
      publicProjectionHash: posts.publicProjectionHash,
    }),
    expect.objectContaining({ key: "home" }),
    expect.objectContaining({
      key: "settings",
      structure: { fields: {} },
      publicProjectionHash: hash("settings-public"),
      publicProjectionSourceHash: hash("settings-full"),
    }),
  ]);
  expect(apply(reviewed([home, articles, relabeled]))).toMatchObject({
    requiresApply: false,
    operations: [],
  });
});

test("rejects a modified report, unsafe removal, and changes in either raw public baseline value", () => {
  const model = { ...collection("settings"), kind: "global" as const };
  const initial = reviewed([model]);
  expect(() =>
    prepareConfigurationSync({ ...initial, plan: { ...initial.plan, operations: [] } }, []),
  ).toThrow(/stale/);
  apply(initial);
  const unsafe = reviewed([]);
  expect(unsafe.plan.isValid).toBe(false);
  expect(() => prepareConfigurationSync(unsafe, stored())).toThrow(/stale/);
  const current = reviewed([model]);
  for (const key of ["publicProjectionHash", "publicProjectionSourceHash"] as const)
    expect(() =>
      prepareConfigurationSync(
        current,
        stored().map((row) => ({ ...row, [key]: "other" })),
      ),
    ).toThrow(/stale/);
});

test("rewrites by the new key after reading recursive inputs by the former key", () => {
  apply(reviewed([collection("posts")]));
  database.exec(`
    insert into media(id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at)
      values('media','media','media','image/png',1,'{}','active','editor',1,1);
    insert into content_entries(id,model_key,created_by,created_at,updated_at) values('entry','posts','editor',1,1);
    insert into content_snapshots(id,entry_id,revision,title,fields_json,seo_json,schema_version,created_at,updated_at,updated_by)
      values('draft','entry',1,'Post','{"show":false,"photo":"media"}','{}',1,1,1,'editor'),
        ('published','entry',1,'Post','{"show":false,"photo":"media"}','{}',1,1,1,'editor');
    update content_entries set draft_snapshot_id='draft',published_snapshot_id='published' where id='entry';
    insert into content_blocks(snapshot_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at)
      values('draft','old-image','image',1,1,'{}',1,1);
    insert into content_media_references(snapshot_id,source_key,field_path,media_id,created_at)
      values('draft','$fields','photo','media',1),('published','$fields','photo','media',1),
        ('draft','$seo','image','media',1),('draft','old-image','image','media',1);
  `);
  const articles = {
    ...collection("articles"),
    renamedFrom: "posts",
    version: 2,
    fields: {
      show: field.boolean(),
      cover: field.media(),
      caption: field.text({ defaultValue: "Default" }),
    },
    visibility: { cover: { field: "show", values: [true] } },
  } satisfies Model;
  // Feed the compiler a classified rename with recursive fields, a block removal and SEO removal.
  const counts = { draft: 1, published: 1 };
  const report: ApplyConfigurationSynchronizationInput["plan"] = {
    diagnostics: [],
    isValid: true,
    requiresApply: true,
    operations: [
      {
        action: "rename",
        renamedFrom: contentModelKey("posts"),
        model: { ...articles, key: contentModelKey("articles") },
        evolution: {
          recursiveFields: true,
          snapshots: counts,
          backfills: ["caption"],
          blockRemovals: ["image"],
          seoRemoval: true,
          changes: [
            {
              class: "destructive",
              kind: "field-renamed",
              scope: "field",
              from: "photo",
              target: "cover",
              hinted: true,
            },
            {
              class: "compatible",
              kind: "field-added",
              scope: "field",
              target: "caption",
              backfill: counts,
            },
          ],
        },
      },
    ],
  };
  const input = {
    ...reviewed([articles]),
    plan: report,
    linkRewrites: [
      {
        snapshotId: "draft",
        references: [
          {
            sourceKey: "$fields",
            area: "fields",
            pointer: "/someLink",
            targetId: "entry",
            delivered: false,
          },
        ],
      },
    ],
  } satisfies ApplyConfigurationSynchronizationInput;
  const [scan] = configurationSyncRecursiveScans(input.models, report);
  expect(scan).toMatchObject({ readKey: "posts", writeKey: "articles" });
  const rows = database
    .prepare(SYNC_FIELD_REWRITE_ROWS_SQL)
    .all(scan!.readKey, "") as unknown as SyncFieldRewriteRow[];
  const plan = configurationSyncWritePlan(input, report, {
    linkDirtyToken: "sync-links",
    nextEventId: () => "sync-rename",
    rewrites: new Map([[scan!.writeKey, scan!.rewritePage(rows)]]),
  });
  const revision = database.prepare("select revision from content_link_state").get()
    ?.revision as number;
  execute(plan);
  expect(database.prepare("select model_key from content_entries").get()).toEqual({
    model_key: "articles",
  });
  const snapshots = database
    .prepare("select fields_json, seo_json from content_snapshots order by id")
    .all();
  expect(
    snapshots.map((row) => ({ fields: JSON.parse(String(row.fields_json)), seo: row.seo_json })),
  ).toEqual([
    { fields: { show: false, cover: "media", caption: "Default" }, seo: null },
    { fields: { show: false, caption: "Default" }, seo: null },
  ]);
  expect(
    database
      .prepare("select snapshot_id,source_key,field_path from content_media_references")
      .all(),
  ).toEqual([{ snapshot_id: "draft", source_key: "$fields", field_path: "cover" }]);
  expect(
    database.prepare("select snapshot_id,field_path from content_entry_link_references").all(),
  ).toEqual([{ snapshot_id: "draft", field_path: "/someLink" }]);
  expect(database.prepare("select revision from content_link_state").get()).toEqual({
    revision: revision + 1,
  });
  expect(database.prepare("select token from mutation_guards").all()).toEqual([]);
});

test("queues the committed version once and preserves pending retry lineage on coalesce", () => {
  const posts = collection("posts");
  const initial = applyWithReceipt(reviewed([posts]), "initial-build");
  expect(initial.result).toEqual({
    status: "applied",
    operations: initial.report.operations,
    targetVersion: 1,
  });
  expect(initial.receipt.committedOutboxWork).toBe(true);
  const outbox = () =>
    database
      .prepare("select id, available_at, created_at, payload_json from outbox_events")
      .all()
      .map(({ payload_json, ...row }) => ({ ...row, payload: JSON.parse(String(payload_json)) }));
  expect(outbox()).toEqual([
    {
      id: "initial-build",
      available_at: 10 + SITE_BUILD_DEBOUNCE_MS,
      created_at: 10,
      payload: {
        publishedSnapshotId: null,
        reason: "configuration_sync",
        requestedAt: 10,
        requestedBy: "system:content-sync",
        targetVersion: 1,
      },
    },
  ]);
  database.exec(
    "update outbox_events set payload_json = json_set(payload_json, '$.retryOfBuildId', 'failed-build')",
  );
  const next = {
    ...posts,
    label: "Articles",
    projectionHash: hash("articles"),
    publicProjectionHash: hash("articles"),
  };
  const updated = applyWithReceipt(reviewed([next], 20), "next-build");
  expect(updated.result).toEqual({
    status: "applied",
    operations: updated.report.operations,
    targetVersion: 2,
  });
  expect(updated.receipt.committedOutboxWork).toBe(true);
  expect(updated.receipt.slots.queue).toEqual([
    { event_id: "next-build", pending_id: "initial-build", version: 2 },
  ]);
  expect(outbox()).toEqual([
    {
      id: "initial-build",
      available_at: 20 + SITE_BUILD_DEBOUNCE_MS,
      created_at: 10,
      payload: {
        publishedSnapshotId: null,
        reason: "configuration_sync",
        requestedAt: 20,
        requestedBy: "system:content-sync",
        targetVersion: 2,
        retryOfBuildId: "failed-build",
      },
    },
  ]);
});

test("records baselines and trusted query metadata without public writes and rebuilds once for an opaque legacy identity", () => {
  const posts = collection("posts");
  apply(reviewed([posts]));
  const queryUpdate = { ...posts, projectionHash: hash("query-options") };
  database.exec("update content_models set structure_json_hash = null");
  for (const model of [posts, queryUpdate]) {
    const outcome = applyWithReceipt(reviewed([model]), "unused");
    expect(outcome.result).toEqual({ status: "applied", operations: outcome.report.operations });
    expect(outcome.receipt.committedOutboxWork).toBe(false);
    expect(outcome.receipt.slots).toEqual({});
  }
  expect(database.prepare("select version from published_state").get()).toEqual({ version: 1 });
  database
    .prepare(
      "update content_models set projection_hash = ?, public_projection_hash = null, public_projection_source_hash = null",
    )
    .run(hash("legacy"));
  const legacy = applyWithReceipt(reviewed([queryUpdate]), "legacy-build");
  expect(legacy.result).toMatchObject({ status: "applied", targetVersion: 2 });
  expect(legacy.receipt.committedOutboxWork).toBe(true);
  expect(applyWithReceipt(reviewed([queryUpdate]), "unused").result).toEqual({
    status: "noop",
    operations: [],
  });
  expect(database.prepare("select version from published_state").get()).toEqual({ version: 2 });
});
