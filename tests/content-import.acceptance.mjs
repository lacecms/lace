// SM4C: `lace import` run as a real process against Node (SQLite + MinIO) and
// the local Worker composition (D1 + R2) with the starter configuration and
// the documented sample package.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vitest";
import { openProductRuntime } from "./support/cross-runtime-fixture.mjs";
import { readCompleteBuildExport } from "../packages/test-utils/dist/index.js";

const exec = promisify(execFile);
const workspace = fileURLToPath(new URL("..", import.meta.url));
const sample = join(workspace, "apps/docs/public/examples/content-import");
const bin = join(workspace, "packages/cli/dist/bin.js");
const MODELS = ["settings", "navigation", "home", "posts"];
const ENTRY_KEYS = ["settings", "navigation", "home", "hello-lace", "first-project"];
let project;
let config;
let manifest;

beforeAll(async () => {
  // Inside the workspace so the starter configuration resolves @lacecms packages.
  project = await mkdtemp(join(workspace, "tests/.import-journey-"));
  await cp(
    join(workspace, "packages/create-lace/templates/lace.config.ts"),
    join(project, "lace.config.ts"),
  );
  config = (await import(pathToFileURL(join(project, "lace.config.ts")).href)).default;
  manifest = JSON.parse(await readFile(join(sample, "lace-import.json"), "utf8"));
});
afterAll(async () => rm(project, { recursive: true, force: true }));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Runs the built CLI with only PATH and the token in its environment. */
async function lace(directory, origin, token, args) {
  const env = { PATH: process.env.PATH, ...(token ? { LACE_IMPORT_TOKEN: token } : {}) };
  const argv = [bin, "import", directory, ...(origin ? ["--url", origin] : []), ...args, "--json"];
  let outcome;
  try {
    const { stdout, stderr } = await exec(process.execPath, argv, { cwd: project, env });
    outcome = { exitCode: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    outcome = { exitCode: error.code, stdout: error.stdout, stderr: error.stderr };
  }
  return { ...outcome, result: JSON.parse(outcome.stdout) };
}

async function runtimeJourney(kind) {
  const f = await openProductRuntime(kind, { config });
  try {
    const admin = { cookie: f.cookies.admin };
    const json = async (path, options = {}, status = 200) => {
      const response = await f.call(path, { ...admin, ...options });
      expect(response.status, `${kind} ${path}: ${await response.clone().text()}`).toBe(status);
      return response.json();
    };
    const issue = (allowPublish) =>
      json(
        "/api/v1/admin/import-tokens",
        {
          method: "POST",
          json: {
            name: `Journey ${allowPublish ? "publish" : "drafts"}`,
            expiresInDays: 1,
            allowPublish,
          },
        },
        201,
      );
    const publishToken = await issue(true);
    const draftToken = await issue(false);
    const tokens = [publishToken.token, draftToken.token];
    const outputs = [];
    const directory = await mkdtemp(join(project, `${kind}-`));
    await cp(sample, directory, { recursive: true });
    const run = async (args, token = publishToken.token) => {
      const outcome = await lace(directory, f.origin, token, args);
      outputs.push(outcome.stdout, outcome.stderr);
      await f.settle();
      return outcome;
    };

    const entriesByKey = async () => {
      const found = {};
      for (const model of MODELS) {
        const list = await json(`/api/v1/admin/models/${model}/entries`);
        for (const item of list.items) {
          const entry = await json(`/api/v1/admin/entries/${item.id}`);
          const key = model === "posts" ? entry.draft.slug : model;
          found[key] = entry;
        }
      }
      return found;
    };
    /** Media, draft and published revisions and build history: what a write would change. */
    const observe = async () => {
      const media = await json("/api/v1/admin/media?limit=100");
      const entries = await entriesByKey();
      const builds = await json("/api/v1/admin/site-builds");
      return {
        media: media.items.map((item) => [item.id, item.updatedAt, item.tags, item.alt]),
        entries: Object.fromEntries(
          Object.entries(entries).map(([key, entry]) => [
            key,
            [entry.draft.revision, entry.published?.id, entry.published?.revision],
          ]),
        ),
        builds: builds.items.map((build) => build.id),
      };
    };
    const unchangedPlan = {
      upload: 0,
      mediaUpdate: 0,
      mediaUnchanged: 2,
      create: 0,
      update: 0,
      unchanged: 5,
      conflict: 0,
      publish: 0,
      published: 5,
    };
    const plans = [];

    // Offline validation needs neither a token nor a server.
    const valid = await lace(directory, undefined, undefined, ["--validate-only", "--publish"]);
    expect(valid.exitCode, valid.stdout).toBe(0);
    expect(valid.result).toMatchObject({ ok: true, code: "IMPORT_VALID" });

    const initial = await observe();
    const dry = await run(["--dry-run", "--publish"]);
    expect(dry.exitCode, dry.stdout).toBe(0);
    expect(dry.result).toMatchObject({ ok: true, code: "IMPORT_PLANNED" });
    expect(dry.result.data.plan.summary).toMatchObject({
      upload: 2,
      create: 2,
      update: 3,
      publish: 5,
    });
    plans.push(dry.result.data.plan);
    expect(await observe()).toEqual(initial);

    const refused = await run(["--publish"], draftToken.token);
    expect(refused.exitCode, refused.stdout).toBe(6);
    expect(refused.result.ok).toBe(false);
    expect(await observe()).toEqual(initial);

    const first = await run(["--publish"]);
    expect(first.exitCode, first.stdout).toBe(0);
    expect(first.result).toMatchObject({ ok: true, code: "IMPORT_COMPLETED" });
    expect(first.result.data.result).toMatchObject({ uploaded: 2, created: 2, published: 5 });
    const order = first.result.data.plan.publishOrder;
    expect(order.indexOf("first-project")).toBeLessThan(order.indexOf("hello-lace"));
    expect(order.indexOf("hello-lace")).toBeLessThan(order.indexOf("home"));
    expect(order.indexOf("hello-lace")).toBeLessThan(order.indexOf("navigation"));
    plans.push(first.result.data.plan);

    // Media: stored bytes, hash, tags and metadata.
    const media = (await json("/api/v1/admin/media?limit=100")).items;
    expect(media).toHaveLength(2);
    const mediaIds = {};
    for (const item of manifest.media) {
      const bytes = await readFile(join(sample, item.file));
      const stored = media.find((candidate) => candidate.sha256 === sha256(bytes));
      expect(stored, `${kind} media ${item.key}`).toBeDefined();
      mediaIds[item.key] = stored.id;
      expect(stored).toMatchObject({
        tags: [...new Set(item.tags)].sort(),
        width: 1200,
        height: 800,
        mimeType: "image/jpeg",
        ...(item.alt ? { alt: item.alt } : {}),
        ...(item.caption ? { caption: item.caption } : {}),
        ...(item.focalPoint ? { focalPoint: item.focalPoint } : {}),
      });
    }

    // Entries: links resolved, everything published at the saved revision.
    const entries = await entriesByKey();
    const entryIds = Object.fromEntries(ENTRY_KEYS.map((key) => [key, entries[key].id]));
    const link = (key) => `entry:${encodeURIComponent(entryIds[key])}`;
    expect(entries["hello-lace"].draft.fields.relatedUrl).toBe(link("first-project"));
    expect(entries.home.draft.blocks[0].data).toMatchObject({
      image: mediaIds.studio,
      primaryActionUrl: link("hello-lace"),
    });
    expect(entries.home.draft.seo.image).toBe(mediaIds.studio);
    expect(entries.navigation.draft.blocks[0].data.links.map((item) => item.url)).toEqual([
      link("hello-lace"),
      link("first-project"),
    ]);
    expect(entries.settings.draft.fields.image).toBe(mediaIds.studio);
    for (const key of ENTRY_KEYS)
      expect(entries[key].published?.revision, `${kind} ${key} published`).toBe(
        entries[key].draft.revision,
      );

    // Published export and public media bytes.
    const build = await json(
      "/api/v1/admin/api-tokens",
      { method: "POST", json: { name: "import-journey-build" } },
      201,
    );
    const exported = (
      await readCompleteBuildExport(
        (url, init) => {
          const target = new URL(url);
          return f.call(`${target.pathname}${target.search}`, init);
        },
        "https://lace.invalid",
        build.token,
      )
    ).export;
    const hello = exported.entries.find((entry) => entry.id === entryIds["hello-lace"]);
    expect(hello).toMatchObject({
      fields: { summary: "Why this studio moved its site to Lace." },
      title: "Hello, Lace",
    });
    expect(exported.globals.find((global) => global.modelKey === "settings").fields).toMatchObject({
      siteName: "Sample Studio",
      image: mediaIds.studio,
    });
    for (const item of manifest.media) {
      expect(exported.media[mediaIds[item.key]], `${kind} export media ${item.key}`).toBeDefined();
      const served = await f.call(`/api/v1/public/media/${mediaIds[item.key]}`, { origin: null });
      expect(served.status).toBe(200);
      expect(sha256(Buffer.from(await served.arrayBuffer()))).toBe(
        sha256(await readFile(join(sample, item.file))),
      );
    }

    // Reruns with and without the state file write nothing.
    const afterFirst = await observe();
    const rerun = await run(["--publish"]);
    expect(rerun.exitCode, rerun.stdout).toBe(0);
    expect(rerun.result.data.plan.summary).toEqual(unchangedPlan);
    expect(rerun.result.data.result).toMatchObject({
      uploaded: 0,
      created: 0,
      saved: 0,
      published: 0,
    });
    plans.push(rerun.result.data.plan);
    expect(await observe()).toEqual(afterFirst);
    await rm(join(directory, "lace-import.state.json"));
    const stateless = await run(["--publish"]);
    expect(stateless.exitCode, stateless.stdout).toBe(0);
    expect(stateless.result.data.plan.summary).toEqual(unchangedPlan);
    expect(await observe()).toEqual(afterFirst);

    // An editor's change after the import is a conflict until --overwrite.
    const draft = entries["hello-lace"].draft;
    await json(`/api/v1/admin/entries/${entryIds["hello-lace"]}/draft`, {
      method: "PUT",
      json: {
        expectedRevision: draft.revision,
        title: "Edited in the admin",
        slug: draft.slug,
        fields: draft.fields,
        blocks: draft.blocks,
        ...(draft.seo === undefined ? {} : { seo: draft.seo }),
      },
    });
    const edited = await observe();
    const conflict = await run(["--publish"]);
    expect(conflict.exitCode, conflict.stdout).toBe(2);
    expect(conflict.result).toMatchObject({ ok: false, code: "IMPORT_CONFLICT" });
    expect(
      conflict.result.data.plan.entries.find((entry) => entry.key === "hello-lace").action,
    ).toBe("conflict");
    plans.push(conflict.result.data.plan);
    expect(await observe()).toEqual(edited);
    const overwrite = await run(["--publish", "--overwrite"]);
    expect(overwrite.exitCode, overwrite.stdout).toBe(0);
    expect(overwrite.result.data.result).toMatchObject({ saved: 1, published: 1 });
    const restored = await json(`/api/v1/admin/entries/${entryIds["hello-lace"]}`);
    expect(restored.draft.title).toBe("Hello, Lace");
    expect(restored.published.revision).toBe(restored.draft.revision);
    const settled = await run(["--publish"]);
    expect(settled.result.data.plan.summary).toEqual(unchangedPlan);

    // A revoked token is refused without being echoed.
    await json(`/api/v1/admin/import-tokens/${publishToken.id}`, { method: "DELETE" });
    const revoked = await run(["--publish"]);
    expect(revoked.exitCode, revoked.stdout).toBe(6);
    expect(revoked.result).toMatchObject({ ok: false, code: "IMPORT_UNAUTHORIZED" });
    for (const output of outputs) for (const token of tokens) expect(output).not.toContain(token);

    // Canonical form: identifiers become package keys, origins and times disappear.
    const final = await entriesByKey();
    const names = [
      ...Object.entries(mediaIds).map(([key, id]) => [id, `media:${key}`]),
      ...Object.entries(entryIds).flatMap(([key, id]) => [
        [encodeURIComponent(id), `id:${key}`],
        [id, `id:${key}`],
      ]),
      [f.origin, "<origin>"],
    ];
    const volatile = new Set(["createdAt", "updatedAt", "publishedAt", "updatedBy", "createdBy"]);
    const canonical = (value) => {
      if (typeof value === "string")
        return names.reduce((text, [from, to]) => text.replaceAll(from, to), value);
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => !volatile.has(key) && key !== "id" && key !== "entryId")
            .map(([key, item]) => [canonical(key), canonical(item)]),
        );
      return value;
    };
    const imported = new Set(Object.values(entryIds));
    return canonical({
      plans,
      drafts: Object.fromEntries(ENTRY_KEYS.map((key) => [key, final[key].draft])),
      exported: {
        entries: exported.entries.filter((entry) => imported.has(entry.id)),
        globals: exported.globals.filter((global) => imported.has(global.id)),
        media: Object.fromEntries(Object.values(mediaIds).map((id) => [id, exported.media[id]])),
      },
    });
  } finally {
    await f.close();
  }
}

test("lace import validates, publishes, reruns idempotently and protects edits on both runtimes", async () => {
  const results = {};
  for (const kind of ["node", "worker"]) results[kind] = await runtimeJourney(kind);
  expect(results.worker).toEqual(results.node);
}, 300_000);
