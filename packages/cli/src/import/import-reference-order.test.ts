import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adminContentEntrySchema } from "@lacecms/contracts";
import * as v from "valibot";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { openImportApi } from "../test-support/import-api.js";
import { removePackages, writePackage } from "../test-support/import-fixtures.js";
import { outcomePlan } from "../test-support/import-outcome.js";
import { runImportCommand } from "./import-command.js";
import type { ImportEntry, ImportPackage } from "./import-format.js";
import { ImportState, STATE_FILE } from "./import-state.js";

const source = `import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";
const review = () => field.reference({ models: ["reviews"] });
export default await defineConfig({ content: [
  definePage({ key: "service", version: 1, path: "/", fields: {
    cards: field.list({ item: review() }), hiddenPick: review(), show: field.boolean(),
  }, visibility: { hiddenPick: { field: "show", values: [true] } } }),
  defineCollection({ key: "reviews", version: 1, fields: { peer: review() } }),
] });`;

const base = fileURLToPath(new URL("../..", import.meta.url));
type Api = Awaited<ReturnType<typeof openImportApi>>;
let project: string;
let config: Parameters<typeof openImportApi>[0];
const apis: Api[] = [];
beforeAll(async () => {
  project = await mkdtemp(join(base, ".import-reference-order-"));
  const configFile = join(project, "lace.config.ts");
  await writeFile(configFile, source);
  config = (await import(pathToFileURL(configFile).href)).default as typeof config;
});
afterAll(async () => rm(project, { recursive: true, force: true }));
afterEach(async () => {
  for (const api of apis.splice(0)) await api.close();
  await removePackages();
});

async function api() {
  const server = await openImportApi(config);
  apis.push(server);
  return server;
}

function run(root: string, server: Api, ...args: string[]) {
  return runImportCommand([root, ...args], {
    cwd: project,
    env: { LACE_IMPORT_TOKEN: server.token, LACE_API_BASE_URL: server.origin },
    fetch: server.fetch,
  });
}

function review(key: string, peer?: string | { $entry: string }): ImportEntry {
  return {
    key,
    model: "reviews",
    title: key,
    fields: peer === undefined ? {} : { peer },
    blocks: [],
  };
}

function pack(...entries: ImportEntry[]): ImportPackage {
  return { formatVersion: 1, media: [], entries };
}

async function replace(root: string, ...entries: ImportEntry[]) {
  await writeFile(join(root, "lace-import.json"), JSON.stringify(pack(...entries)));
}

function state(root: string, server: Api) {
  return ImportState.open(join(root, STATE_FILE), server.origin);
}

function writes(server: Api) {
  return server.requests.filter((request) => !request.startsWith("GET "));
}

async function read(server: Api, id: string) {
  return v.parse(
    adminContentEntrySchema,
    (await server.session(`/api/v1/admin/entries/${id}`)).body,
  );
}

test("publishes route-less selections first and keeps repeated IDs and hidden draft selections", async () => {
  const server = await api();
  const service = {
    key: "service",
    model: "service",
    title: "Service",
    blocks: [],
    fields: {
      cards: [{ $entry: "b" }, { $entry: "a" }, { $entry: "b" }],
      show: false,
      hiddenPick: { $entry: "draft" },
    },
  };
  const root = await writePackage(
    pack(service, review("b"), review("a"), { ...review("draft"), publish: false }),
  );
  const first = await run(root, server, "--publish");
  expect(first, first.message).toMatchObject({ code: "IMPORT_COMPLETED" });
  expect(outcomePlan(first.data).publishOrder).toEqual(["b", "a", "service"]);
  const ids = await state(root, server);
  const saved = await read(server, ids.entry("service")!.id);
  const ordered = ["b", "a", "b"].map((key) => ids.entry(key)!.id);
  expect(saved.draft.fields).toEqual({
    cards: ordered,
    show: false,
    hiddenPick: ids.entry("draft")!.id,
  });
  expect(saved.published?.fields).toEqual({ cards: ordered, show: false });
  expect((await read(server, ids.entry("draft")!.id)).published).toBeUndefined();

  await replace(
    root,
    { ...service, fields: { ...service.fields, show: true } },
    review("b"),
    review("a"),
    { ...review("draft"), publish: false },
  );
  server.requests.length = 0;
  const withheld = await run(root, server, "--publish");
  expect(withheld).toMatchObject({ code: "IMPORT_INVALID" });
  expect(withheld.message).toContain("/entries/0/fields/hiddenPick");
  expect(writes(server)).toEqual([]);
});

test("plans a reversal in both phases and resumes through interrupted saves and publications", async () => {
  const server = await api();
  const root = await writePackage(pack(review("a", { $entry: "b" }), review("b")));
  const seed = await run(root, server, "--publish");
  expect(seed, seed.message).toMatchObject({ code: "IMPORT_COMPLETED" });
  expect(outcomePlan(seed.data).publishOrder).toEqual(["b", "a"]);
  const ids = await state(root, server);
  const a = ids.entry("a")!.id;
  const b = ids.entry("b")!.id;
  await replace(root, review("b", { $entry: "a" }), review("a"));
  server.requests.length = 0;
  const dry = await run(root, server, "--publish", "--dry-run");
  expect(dry, dry.message).toMatchObject({ code: "IMPORT_PLANNED" });
  expect(outcomePlan(dry.data)).toMatchObject({ draftOrder: ["a", "b"], publishOrder: ["a", "b"] });
  expect(writes(server)).toEqual([]);

  const draftA = `PUT /api/v1/admin/entries/${a}/draft`;
  const draftB = `PUT /api/v1/admin/entries/${b}/draft`;
  const publishA = `POST /api/v1/admin/entries/${a}/publish`;
  const publishB = `POST /api/v1/admin/entries/${b}/publish`;
  server.failWhen((request) => request === draftB);
  expect(await run(root, server, "--publish")).toMatchObject({ code: "IMPORT_FAILED" });
  expect(writes(server)).toEqual([draftA, draftB]);
  expect((await read(server, a)).draft.fields).toEqual({});
  expect((await read(server, a)).published?.fields).toEqual({ peer: b });

  server.requests.length = 0;
  server.failWhen((request) => request === publishB);
  expect(await run(root, server, "--publish")).toMatchObject({ code: "IMPORT_FAILED" });
  expect(writes(server)).toEqual([draftB, publishA, publishB]);
  expect((await read(server, a)).published?.fields).toEqual({});

  server.requests.length = 0;
  server.failWhen(undefined);
  const resumed = await run(root, server, "--publish");
  expect(resumed, resumed.message).toMatchObject({ code: "IMPORT_COMPLETED" });
  expect(writes(server)).toEqual([publishB]);
  expect((await read(server, b)).published?.fields).toEqual({ peer: a });

  server.requests.length = 0;
  expect(await run(root, server, "--publish")).toMatchObject({ code: "IMPORT_COMPLETED" });
  expect(writes(server)).toEqual([]);

  await replace(root, review("a", b), review("b", a));
  server.requests.length = 0;
  const literalCycle = await run(root, server);
  expect(literalCycle).toMatchObject({ code: "IMPORT_INVALID" });
  expect(literalCycle.message).toContain('/entries/0/fields/peer: "a" selects "b"');
  expect(literalCycle.message).toContain('/entries/1/fields/peer: "b" selects "a"');
  expect(writes(server)).toEqual([]);
});

test("defers external paths to guarded writes and keeps earlier successful drafts on retry", async () => {
  const server = await api();
  const root = await writePackage(
    pack(review("a"), review("b"), review("external", { $entry: "b" })),
  );
  const seed = await run(root, server);
  expect(seed, seed.message).toMatchObject({ code: "IMPORT_COMPLETED" });
  const ids = await state(root, server);
  const a = ids.entry("a")!.id;
  const b = ids.entry("b")!.id;
  const external = ids.entry("external")!.id;
  await replace(root, { ...review("a"), title: "Edited" }, review("b", external));
  server.requests.length = 0;
  const declined = await run(root, server);
  expect(declined).toMatchObject({ code: "IMPORT_FAILED" });
  expect(declined.message).toContain("VALIDATION_FAILED");
  expect(declined.message).toContain("reference_cycle");
  expect(declined.message).toContain("correct the blocking dependency");
  expect(declined.message).not.toContain(external);
  expect(writes(server)).toEqual([
    `PUT /api/v1/admin/entries/${a}/draft`,
    `PUT /api/v1/admin/entries/${b}/draft`,
  ]);
  expect((await read(server, a)).draft.title).toBe("Edited");
  expect((await read(server, b)).draft.fields).toEqual({});
  const saved = await read(server, external);
  expect(
    await server.session(`/api/v1/admin/entries/${external}/draft`, {
      method: "PUT",
      json: { title: "external", expectedRevision: saved.draft.revision, fields: {}, blocks: [] },
    }),
  ).toMatchObject({ status: 200 });

  server.requests.length = 0;
  const resumed = await run(root, server);
  expect(resumed, resumed.message).toMatchObject({ code: "IMPORT_COMPLETED" });
  expect(writes(server)).toEqual([`PUT /api/v1/admin/entries/${b}/draft`]);
  expect((await read(server, b)).draft.fields).toEqual({ peer: external });
});
