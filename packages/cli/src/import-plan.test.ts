// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { runImportCommand } from "./import-command.js";
import { openImportApi } from "./import-api.mjs";
import {
  configSource,
  fixtureConfig,
  removePackages,
  samplePackage,
  writePackage,
} from "./import-fixtures.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const { normalized: config } = await fixtureConfig();
let project;
const apis = [];
beforeAll(async () => {
  project = await mkdtemp(join(packageRoot, ".import-plan-"));
  await writeFile(join(project, "lace.config.ts"), configSource);
});
afterAll(async () => rm(project, { recursive: true, force: true }));
afterEach(async () => {
  for (const api of apis.splice(0)) await api.close();
  await removePackages();
});

async function api(options, serverConfig = config) {
  const opened = await openImportApi(serverConfig, options);
  apis.push(opened);
  return opened;
}

function run(directory, server, args = []) {
  return runImportCommand([directory, "--url", server.origin, ...args], {
    cwd: project,
    env: { LACE_IMPORT_TOKEN: server.token },
    fetch: server.fetch,
    sleep: async () => {},
  });
}

const writes = (server) => server.requests.filter((request) => !request.startsWith("GET "));

describe("import plan", () => {
  test("a first dry run plans uploads, updates and creates and only reads", async () => {
    const server = await api();
    const result = await run(await writePackage(), server, ["--dry-run", "--publish", "--json"]);
    expect(result).toMatchObject({ ok: true, code: "IMPORT_PLANNED", exitCode: 0 });
    expect(result.data.plan.media.map((item) => [item.key, item.action])).toEqual([
      ["hero", "upload"],
      ["cover", "upload"],
    ]);
    expect(
      result.data.plan.entries.map((entry) => [entry.key, entry.action, entry.publish]),
    ).toEqual([
      ["home", "update", "publish"],
      ["settings", "update", "publish"],
      ["launch", "create", "publish"],
      ["second", "create", "publish"],
    ]);
    expect(result.data.plan.publishOrder).toEqual(["settings", "second", "launch", "home"]);
    expect(writes(server)).toEqual([]);
  });

  test("publishing needs the publish capability before any write", async () => {
    const server = await api({ publish: false });
    const result = await run(await writePackage(), server, ["--publish"]);
    expect(result).toMatchObject({ code: "IMPORT_UNAUTHORIZED", exitCode: 6 });
    expect(result.message).toContain("content:publish");
    expect(writes(server)).toEqual([]);
    expect((await run(await writePackage(), server, ["--dry-run"])).ok).toBe(true);
  });

  test("a server with another model version is a configuration mismatch", async () => {
    const { normalized: changed } = await fixtureConfig(2);
    const server = await api({}, changed);
    const result = await run(await writePackage(), server, ["--dry-run"]);
    expect(result).toMatchObject({ code: "IMPORT_CONFIG_MISMATCH", exitCode: 4 });
    expect(result.message).toContain('Model "posts"');
    expect(result.message).toContain("lace content sync");
  });

  test("an ambiguous slug stops before any write", async () => {
    const server = await api();
    for (const title of ["One", "Two"])
      expect(
        (
          await server.session("/api/v1/admin/models/posts/entries", {
            method: "POST",
            json: { title, slug: "launch", fields: { summary: "x" }, blocks: [] },
          })
        ).status,
      ).toBe(201);
    const result = await run(await writePackage(), server, ["--json"]);
    expect(result).toMatchObject({ code: "IMPORT_CONFLICT", exitCode: 2 });
    expect(result.data.issues).toEqual([expect.objectContaining({ pointer: "/entries/2/slug" })]);
    expect(writes(server)).toEqual([]);
  });

  test("link cycles and unpublished targets fail before any write; hidden links add no order", async () => {
    const server = await api();
    const cycle = samplePackage();
    cycle.entries[3].fields.related = { $entry: "launch" };
    const cyclic = await run(await writePackage(cycle), server, ["--publish"]);
    expect(cyclic).toMatchObject({ code: "IMPORT_INVALID", exitCode: 4 });
    expect(cyclic.message).toContain('"launch", "second"');
    const withheld = samplePackage();
    withheld.entries[3].publish = false;
    const unpublished = await run(await writePackage(withheld), server, ["--publish", "--json"]);
    expect(unpublished.data.issues).toEqual([
      expect.objectContaining({ pointer: "/entries/2/fields/related" }),
    ]);
    const hidden = samplePackage();
    hidden.entries[3].publish = false;
    hidden.entries[2].fields.related = "https://example.com";
    hidden.entries[0].blocks[1].data.link = { $entry: "second" };
    const planned = await run(await writePackage(hidden), server, [
      "--publish",
      "--dry-run",
      "--json",
    ]);
    expect(planned.ok).toBe(true);
    expect(planned.data.plan.publishOrder).toEqual(["settings", "launch", "home"]);
    expect(writes(server)).toEqual([]);
  });

  test("a stale state mapping falls back to server lookups", async () => {
    const server = await api();
    const directory = await writePackage();
    await writeFile(
      join(directory, "lace-import.state.json"),
      JSON.stringify({
        formatVersion: 1,
        targets: {
          [server.origin]: {
            media: { hero: { id: "missing-media", sha256: "0".repeat(64) } },
            entries: { launch: { id: "missing-entry", model: "posts", revision: 1 } },
          },
        },
      }),
    );
    const result = await run(directory, server, ["--dry-run", "--json"]);
    expect(result.data.plan.entries.find((entry) => entry.key === "launch").action).toBe("create");
    expect(result.data.plan.media[0].action).toBe("upload");
  });
});
