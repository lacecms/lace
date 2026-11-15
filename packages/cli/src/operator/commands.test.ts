import * as v from "valibot";
import type { Command } from "../shared/core.js";
import { expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openNodeDatabase } from "@lacecms/platform-node";
import { runCommand } from "./commands.js";

const cwd = resolve(import.meta.dirname, "../../../..");
const command = (name: Command, check = false) => ({
  command: name,
  target: "node" as const,
  check,
  json: true,
});

test("nested sync check reports schema/value paths without writes", async () => {
  const root = join(cwd, ".lace-acceptance");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "cli-nested-sync-"));
  const environment = { databasePath: join(directory, "lace.sqlite") };
  const project = async (name: string, version: number, child: string) => {
    const path = join(directory, name);
    await mkdir(path);
    await writeFile(
      join(path, "lace.config.ts"),
      `import { defineConfig, defineCollection } from '@lacecms/config'; import { field } from '@lacecms/content'; export default await defineConfig({blocks:[],content:[defineCollection({key:'posts',route:'/blog/:slug',version:${version},blocks:[],fields:{links:field.list({item:field.group({fields:{${child}}})})}})]});`,
    );
    return path;
  };
  const sql = (statement: string, ...params: (string | number | null)[]) => {
    const database = openNodeDatabase(environment.databasePath);
    try {
      const prepared = database.connection.prepare(statement);
      return prepared.reader ? prepared.all(...params) : prepared.run(...params);
    } finally {
      database.connection.close();
    }
  };
  const state = () =>
    [
      "content_models",
      "content_snapshots",
      "content_media_references",
      "published_state",
      "outbox_events",
    ].map((table) => sql(`select * from ${table} order by 1`));
  try {
    const old = await project("old", 1, "headline:field.text()");
    await runCommand(command("db migrate"), environment, old);
    await runCommand(command("content sync"), environment, old);
    sql(
      "insert into content_entries(id,model_key,created_by,created_at,updated_at) values('e','posts','editor',1,1)",
    );
    sql(
      "insert into content_snapshots(id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values('s','e',1,'Nested',?,1,1,1,'editor')",
      JSON.stringify({ links: [{ headline: "Long title" }] }),
    );
    sql("update content_entries set draft_snapshot_id='s' where id='e'");
    const invalid = await project(
      "invalid",
      2,
      "title:field.text({renamedFrom:'headline',maxLength:2})",
    );
    const before = state();
    const blocked = await runCommand(command("content sync", true), environment, invalid);
    expect(blocked.code).toBe("SYNC_PENDING");
    expect(blocked.exitCode).toBe(2);
    expect(v.parse(v.object({ isValid: v.boolean() }), blocked.data).isValid).toBe(false);
    expect((await runCommand(command("content sync"), environment, invalid)).code).toBe(
      "SYNC_BLOCKED",
    );
    expect(blocked.message).toContain("/links/*/title");
    expect(blocked.message).toContain("/fields/links/0/title");
    expect(
      v.parse(v.object({ diagnostics: v.array(v.unknown()) }), blocked.data).diagnostics,
    ).toContainEqual(expect.objectContaining({ schemaPath: "/links/*/title" }));
    expect(state()).toEqual(before);
    const valid = await project("valid", 2, "title:field.text({renamedFrom:'headline'})");
    expect((await runCommand(command("content sync", true), environment, valid)).code).toBe(
      "SYNC_PENDING",
    );
    expect(state()).toEqual(before);
    expect((await runCommand(command("content sync"), environment, valid)).code).toBe(
      "SYNC_APPLIED",
    );
    expect(
      JSON.parse(
        v.parse(
          v.array(v.object({ fields_json: v.string() })),
          sql("select fields_json from content_snapshots"),
        )[0]!.fields_json,
      ),
    ).toEqual({
      links: [{ title: "Long title" }],
    });
    expect((await runCommand(command("content sync", true), environment, valid)).code).toBe(
      "SYNC_CURRENT",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("operational Node migration, no-write check, sync, and bootstrap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-commands-"));
  const environment = { databasePath: join(directory, "lace.sqlite") };
  try {
    const migrate = await runCommand(command("db migrate"), environment, cwd);
    expect(migrate.code).toBe("MIGRATED");
    const pending = await runCommand(command("content sync", true), environment, cwd);
    expect(pending.code).toBe("SYNC_PENDING");
    expect(pending.exitCode).toBe(2);
    const applied = await runCommand(command("content sync"), environment, cwd);
    expect(applied.code).toBe("SYNC_APPLIED");
    expect((await runCommand(command("content sync", true), environment, cwd)).code).toBe(
      "SYNC_CURRENT",
    );
    const setup = await runCommand(command("auth bootstrap"), environment, cwd);
    expect(setup.code).toBe("BOOTSTRAP_TOKEN");
    expect(v.parse(v.object({ token: v.string() }), setup.data).token).toMatch(
      /^[A-Za-z0-9_-]{40,}$/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("first check after upgrading reports pending baselines and sync records them quietly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-baselines-"));
  const environment = { databasePath: join(directory, "lace.sqlite") };
  const sql = (statement: string) => {
    const database = openNodeDatabase(environment.databasePath);
    try {
      const prepared = database.connection.prepare(statement);
      return prepared.reader ? prepared.all() : prepared.run();
    } finally {
      database.connection.close();
    }
  };
  try {
    await runCommand(command("db migrate"), environment, cwd);
    await runCommand(command("content sync"), environment, cwd);
    expect(sql("select count(*) as n from content_models where structure_json is null")).toEqual([
      { n: 0 },
    ]);
    sql("update content_models set structure_json = null, structure_json_hash = null");
    const version = sql("select version from published_state");

    const pending = await runCommand(command("content sync", true), environment, cwd);
    expect(pending.code).toBe("SYNC_PENDING");
    expect(
      v.parse(v.object({ operations: v.array(v.object({ action: v.string() })) }), pending.data)
        .operations.length,
    ).toBeGreaterThan(0);
    expect(
      v
        .parse(v.object({ operations: v.array(v.object({ action: v.string() })) }), pending.data)
        .operations.every((item) => item.action === "record-baseline"),
    ).toBe(true);
    expect(pending.message).toContain("- record-baseline");

    expect((await runCommand(command("content sync"), environment, cwd)).code).toBe("SYNC_APPLIED");
    expect(sql("select version from published_state")).toEqual(version);
    expect((await runCommand(command("content sync", true), environment, cwd)).code).toBe(
      "SYNC_CURRENT",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

function noteConfigSource(version: number, migrations?: string) {
  const fields =
    version === 1
      ? "{ body: field.text({ required: true }) }"
      : "{ text: field.text({ required: true }) }";
  return `import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";

const note = defineBlock({
  fields: ${fields},
  ${migrations === undefined ? "" : `migrations: ${migrations},`}
  type: "note",
  version: ${version},
});

export default await defineConfig({
  blocks: [note],
  content: [
    defineCollection({
      blocks: ["note"],
      key: "posts",
      route: "/blog/:slug",
      version: ${version},
    }),
  ],
});
`;
}

test("content sync migrates stored blocks and blocks a throwing migration", async () => {
  // Projects live inside the repository so their configuration resolves workspace packages.
  const root = join(cwd, ".lace-acceptance");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "cli-block-migrations-"));
  const environment = { databasePath: join(directory, "lace.sqlite") };
  const project = async (name: string, source: string) => {
    const path = join(directory, name);
    await mkdir(path);
    await writeFile(join(path, "lace.config.ts"), source);
    return path;
  };
  const sql = (statement: string) => {
    const database = openNodeDatabase(environment.databasePath);
    try {
      const prepared = database.connection.prepare(statement);
      return prepared.reader ? prepared.all() : prepared.run();
    } finally {
      database.connection.close();
    }
  };
  try {
    const v1 = await project("v1", noteConfigSource(1));
    await runCommand(command("db migrate"), environment, v1);
    expect((await runCommand(command("content sync"), environment, v1)).code).toBe("SYNC_APPLIED");
    sql(
      "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e1', 'posts', 'editor', 1, 1)",
    );
    sql(
      "insert into content_snapshots (id, entry_id, revision, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('s1', 'e1', 1, 'Note', '{}', 1, 1, 1, 'editor')",
    );
    sql(
      "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) values ('s1', 'n1', 'note', 1, 1, '{\"body\":\"Hello\"}', 1, 1)",
    );
    sql("update content_entries set draft_snapshot_id = 's1' where id = 'e1'");

    const throwing = await project(
      "throwing",
      noteConfigSource(2, `{ 2: () => { throw new Error("boom"); } }`),
    );
    const blocked = await runCommand(command("content sync"), environment, throwing);
    expect(blocked.code).toBe("SYNC_BLOCKED");
    expect(blocked.message).toContain("[BLOCK_MIGRATION_FAILED]");
    expect(blocked.message).toContain('draft e1 "Note" block n1 v1');
    expect(sql("select schema_version, data_json from content_blocks")).toEqual([
      { data_json: '{"body":"Hello"}', schema_version: 1 },
    ]);

    const v2 = await project(
      "v2",
      noteConfigSource(
        2,
        "{ 2: ({ data: { body, ...rest } }) => ({ data: { ...rest, text: body } }) }",
      ),
    );
    const pending = await runCommand(command("content sync", true), environment, v2);
    expect(pending.code).toBe("SYNC_PENDING");
    expect(pending.message).toContain(
      "planned block migrations: note 1 -> 2 (draft=1, published=0, blocks=1)",
    );
    const applied = await runCommand(command("content sync"), environment, v2);
    expect(applied.code).toBe("SYNC_APPLIED");
    expect(applied.message).toContain("Migrated blocks: 1 (drafts=1, published=0).");
    expect(v.parse(v.object({ migrated: v.unknown() }), applied.data).migrated).toEqual({
      blocks: 1,
      drafts: 1,
      published: 0,
    });
    expect(sql("select schema_version, data_json from content_blocks")).toEqual([
      { data_json: '{"text":"Hello"}', schema_version: 2 },
    ]);
    expect(sql("select revision, updated_by from content_snapshots")).toEqual([
      { revision: 2, updated_by: "system:content-sync" },
    ]);
    expect((await runCommand(command("content sync", true), environment, v2)).code).toBe(
      "SYNC_CURRENT",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("Cloudflare local sync and bootstrap use persistent D1 services", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-cloudflare-"));
  const environment = { databaseId: "00000000-0000-0000-0000-000000000000", persistTo: directory };
  try {
    expect(
      (
        await runCommand(
          { command: "db migrate", target: "cloudflare-local", check: false, json: true },
          environment,
          cwd,
        )
      ).code,
    ).toBe("MIGRATED");
    expect(
      (
        await runCommand(
          { command: "content sync", target: "cloudflare-local", check: true, json: true },
          environment,
          cwd,
        )
      ).code,
    ).toBe("SYNC_PENDING");
    expect(
      (
        await runCommand(
          { command: "content sync", target: "cloudflare-local", check: false, json: true },
          environment,
          cwd,
        )
      ).code,
    ).toBe("SYNC_APPLIED");
    expect(
      v.parse(
        v.object({ token: v.string() }),
        (
          await runCommand(
            { command: "auth bootstrap", target: "cloudflare-local", check: false, json: true },
            environment,
            cwd,
          )
        ).data,
      ).token,
    ).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("Cloudflare local migration applies Wrangler journal explicitly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-d1-migrate-"));
  try {
    const outcome = await runCommand(
      { command: "db migrate", target: "cloudflare-local", check: false, json: true },
      { databaseId: "00000000-0000-0000-0000-000000000000", persistTo: directory },
      cwd,
    );
    expect(outcome.code).toBe("MIGRATED");
    expect(
      v.parse(v.object({ versions: v.array(v.unknown()) }), outcome.data).versions.length,
    ).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
