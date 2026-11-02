// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { publicationKey } from "./import-apply.js";
import { runImportCommand } from "./import-command.js";
import { openImportApi } from "./import-api.mjs";
import { configSource, fixtureConfig, removePackages, writePackage } from "./import-fixtures.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const { normalized: config } = await fixtureConfig();
let project;
const apis = [];
beforeAll(async () => {
  project = await mkdtemp(join(packageRoot, ".import-apply-"));
  await writeFile(join(project, "lace.config.ts"), configSource);
});
afterAll(async () => rm(project, { recursive: true, force: true }));
afterEach(async () => {
  for (const api of apis.splice(0)) await api.close();
  await removePackages();
});

async function api() {
  const opened = await openImportApi(config);
  apis.push(opened);
  return opened;
}

function run(directory, server, args = [], fetch = server.fetch) {
  return runImportCommand([directory, "--url", server.origin, ...args], {
    cwd: project,
    env: { LACE_IMPORT_TOKEN: server.token },
    fetch,
    sleep: async () => {},
  });
}

const writes = (server) =>
  server.requests
    .filter((request) => !request.startsWith("GET "))
    .map((request) => request.replace(/\/[0-9A-Z]{26}(?=\/|$)/gu, "/:id"));

async function entryBySlug(server, model, slug) {
  const list = await server.session(`/api/v1/admin/models/${model}/entries?slug=${slug}`);
  return list.body.items;
}

async function singleton(server, model) {
  const list = await server.session(`/api/v1/admin/models/${model}/entries`);
  return (await server.session(`/api/v1/admin/entries/${list.body.items[0].id}`)).body;
}

describe("import apply", () => {
  test("first run writes in order, resolves references and publishes; reruns write nothing", async () => {
    const server = await api();
    const directory = await writePackage();
    const first = await run(directory, server, ["--publish"]);
    expect(first).toMatchObject({ ok: true, code: "IMPORT_COMPLETED", exitCode: 0 });
    expect(first.message).toContain("Media:");
    expect(first.message).toContain("Import completed: 2 media uploaded");
    expect(writes(server)).toEqual([
      "POST /api/v1/admin/media",
      "PATCH /api/v1/admin/media/:id",
      "POST /api/v1/admin/media",
      "PATCH /api/v1/admin/media/:id",
      "POST /api/v1/admin/models/posts/entries",
      "POST /api/v1/admin/models/posts/entries",
      "PUT /api/v1/admin/entries/:id/draft",
      "PUT /api/v1/admin/entries/:id/draft",
      "PUT /api/v1/admin/entries/:id/draft",
      "POST /api/v1/admin/entries/:id/publish",
      "POST /api/v1/admin/entries/:id/publish",
      "POST /api/v1/admin/entries/:id/publish",
      "POST /api/v1/admin/entries/:id/publish",
    ]);
    const [launch] = await entryBySlug(server, "posts", "launch");
    const [second] = await entryBySlug(server, "posts", "second");
    const launchEntry = (await server.session(`/api/v1/admin/entries/${launch.id}`)).body;
    expect(launchEntry.draft.fields.related).toBe(`entry:${encodeURIComponent(second.id)}`);
    expect(launchEntry.published.revision).toBe(launchEntry.draft.revision);
    const home = await singleton(server, "home");
    expect(home.published).toBeDefined();
    expect(home.draft.seo.image).toBe(home.draft.fields.hero);
    expect(home.draft.blocks.map((block) => [block.key, block.hidden])).toEqual([
      ["b1", false],
      ["b2", true],
    ]);
    const hero = (await server.session(`/api/v1/admin/media/${home.draft.fields.hero}`)).body;
    expect(hero).toMatchObject({ alt: "Hero", tags: ["project-a"] });
    expect((await singleton(server, "settings")).draft.title).toBe("Site settings");

    server.requests.length = 0;
    const rerun = await run(directory, server, ["--publish", "--json"]);
    expect(rerun.data.plan.summary).toMatchObject({
      upload: 0,
      mediaUnchanged: 2,
      create: 0,
      update: 0,
      unchanged: 4,
      publish: 0,
      published: 4,
    });
    expect(writes(server)).toEqual([]);

    await unlink(join(directory, "lace-import.state.json"));
    server.requests.length = 0;
    const stateless = await run(directory, server, ["--publish", "--json"]);
    expect(stateless.data.plan.summary).toMatchObject({ unchanged: 4, published: 4 });
    expect(writes(server)).toEqual([]);
  });

  test("drafts edited after the import conflict unless --overwrite; equal edits stay unchanged", async () => {
    const server = await api();
    const directory = await writePackage();
    expect((await run(directory, server)).ok).toBe(true);
    const home = await singleton(server, "home");
    const { draft } = home;
    const edit = (title) =>
      server.session(`/api/v1/admin/entries/${home.id}/draft`, {
        method: "PUT",
        json: {
          title,
          fields: draft.fields,
          blocks: draft.blocks,
          seo: draft.seo,
          expectedRevision: draft.revision,
        },
      });
    expect((await edit("Home")).status).toBe(200);
    server.requests.length = 0;
    const equal = await run(directory, server, ["--json"]);
    expect(equal.data.plan.entries[0]).toMatchObject({ key: "home", action: "unchanged" });
    expect(writes(server)).toEqual([]);
    const state = JSON.parse(await readFile(join(directory, "lace-import.state.json"), "utf8"));
    expect(state.targets[server.origin].entries.home.revision).toBe(draft.revision + 1);

    const latest = await singleton(server, "home");
    expect(
      (
        await server.session(`/api/v1/admin/entries/${home.id}/draft`, {
          method: "PUT",
          json: {
            title: "Edited by an editor",
            fields: latest.draft.fields,
            blocks: latest.draft.blocks,
            seo: latest.draft.seo,
            expectedRevision: latest.draft.revision,
          },
        })
      ).status,
    ).toBe(200);
    server.requests.length = 0;
    const conflict = await run(directory, server, ["--json"]);
    expect(conflict).toMatchObject({ ok: false, code: "IMPORT_CONFLICT", exitCode: 2 });
    expect(conflict.message).toContain("home");
    expect(conflict.data.plan.entries[0].action).toBe("conflict");
    expect(writes(server)).toEqual([]);

    server.requests.length = 0;
    const overwritten = await run(directory, server, ["--overwrite"]);
    expect(overwritten.ok).toBe(true);
    expect(writes(server)).toEqual(["PUT /api/v1/admin/entries/:id/draft"]);
    expect((await singleton(server, "home")).draft.title).toBe("Home");
  });

  test("an interrupted run completes on rerun without duplicates", async () => {
    const server = await api();
    const directory = await writePackage();
    server.failWhen((request) => request.startsWith("PUT "));
    const interrupted = await run(directory, server, ["--publish"]);
    expect(interrupted).toMatchObject({ ok: false, code: "IMPORT_FAILED", exitCode: 6 });
    server.failWhen(undefined);
    const resumed = await run(directory, server, ["--publish", "--json"]);
    expect(resumed.ok).toBe(true);
    expect(resumed.data.plan.summary).toMatchObject({ upload: 0, create: 0 });
    expect(await entryBySlug(server, "posts", "launch")).toHaveLength(1);
    expect(await entryBySlug(server, "posts", "second")).toHaveLength(1);
    const media = await server.session("/api/v1/admin/media");
    expect(media.body.items).toHaveLength(2);
  });

  test("a concurrent edit stops the run with the completed writes recorded", async () => {
    const server = await api();
    const directory = await writePackage();
    let raced = false;
    const racing = async (url, init = {}) => {
      if (!raced && init.method === "PUT") {
        raced = true;
        const path = new URL(url).pathname.replace(/\/draft$/u, "");
        const current = (await server.session(path)).body.draft;
        await server.session(`${path}/draft`, {
          method: "PUT",
          json: {
            title: "Raced",
            fields: current.fields,
            blocks: current.blocks,
            ...(current.slug === undefined ? {} : { slug: current.slug }),
            ...(current.seo === undefined ? {} : { seo: current.seo }),
            expectedRevision: current.revision,
          },
        });
      }
      return server.fetch(url, init);
    };
    const result = await run(directory, server, [], racing);
    expect(result).toMatchObject({ code: "IMPORT_FAILED", exitCode: 6 });
    expect(result.message).toContain("CONTENT_REVISION_CONFLICT");
    const state = JSON.parse(await readFile(join(directory, "lace-import.state.json"), "utf8"));
    expect(Object.keys(state.targets[server.origin].media)).toEqual(["hero", "cover"]);
    expect(Object.keys(state.targets[server.origin].entries)).toEqual(["launch", "second"]);
  });

  test("publication keys are deterministic printable ASCII", () => {
    expect(publicationKey("abc/1", 3)).toBe("lace-import:abc%2F1:3");
    expect(publicationKey("x".repeat(300), 1)).toMatch(/^lace-import:[0-9a-f]{64}$/u);
  });
});
