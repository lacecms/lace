import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
  runLocalContentSync,
} from "../dist/index.js";
import { createTestActorResolver } from "./test-actors.ts";
import { readCompleteBuildExport } from "@lacecms/test-utils";

const execute = promisify(execFile);
const document = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Authored H4" }] },
    { type: "horizontalRule" },
    { type: "codeBlock", content: [{ type: "text", text: "\t  <code> &\n line two\n" }] },
    ...[{}, { target: "_blank" }, { rel: "nofollow" }, { target: "_blank", rel: "nofollow" }].map(
      (options, i) => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `Choice ${i}`,
            marks: [{ type: "link", attrs: { href: `/choice-${i}`, ...options } }],
          },
        ],
      }),
    ),
  ],
};

test("real Node draft API preserves expanded rich text through publication and an Astro build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-ce8b-"));
  let runtime, server;
  try {
    const databasePath = join(directory, "lace.sqlite");
    migrateNodeDatabase(databasePath);
    const config = await defineConfig({
      blocks: Object.values(builtInBlocks),
      content: [
        definePage({ key: "home", path: "/", version: 1 }),
        defineCollection({
          key: "posts",
          route: "/blog/:slug",
          version: 1,
          blocks: ["richText"],
          fields: {
            nested: field.group({ fields: { documents: field.list({ item: field.richText() }) } }),
          },
        }),
      ],
    });
    runtime = createNodeRuntime({
      config,
      actors: createTestActorResolver({ id: "ce8b-admin", role: "admin" }),
      logger: { log() {} },
      rateLimiter: { check: async () => true },
      settings: parseNodeRuntimeSettings({
        LACE_AUTH_SECRET: "ce8b-integration-secret-long-enough-for-auth",
        LACE_DATABASE_PATH: databasePath,
        LACE_PUBLIC_BASE_URL: "https://lace.test/",
        LACE_MINIO_TIMEOUT_MS: "1000",
        LACE_MINIO_ACCESS_KEY: "test",
        LACE_MINIO_SECRET_KEY: "test",
        LACE_MINIO_BUCKET: "test",
        LACE_MINIO_ENDPOINT: "http://localhost:9000",
        LACE_MINIO_REGION: "test",
      }),
    });
    let id = 0;
    expect(
      await runLocalContentSync({
        check: false,
        clock: { now: () => Date.now() },
        ids: { next: () => `sync-${++id}` },
        models: config.runtime.content,
        blocks: config.runtime.blocks,
        target: runtime.repository,
        write() {},
      }),
    ).toBe(0);
    const request = async (path, body, method = "POST", headers = {}) => {
      const response = await runtime.app.fetch(
        new Request(`https://lace.test${path}`, {
          method,
          headers: { origin: "https://lace.test", "content-type": "application/json", ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBeLessThan(300);
      return result;
    };
    const homeList = await request("/api/v1/admin/models/home/entries", undefined, "GET");
    const home = await request(`/api/v1/admin/entries/${homeList.items[0].id}`, undefined, "GET");
    await request(`/api/v1/admin/entries/${home.id}/publish`, {
      expectedRevision: home.draft.revision,
    });
    const created = await request("/api/v1/admin/models/posts/entries", {
      title: "Rich authoring",
      slug: "expanded",
      fields: {},
      blocks: [],
    });
    const payload = {
      title: "Rich authoring",
      slug: "expanded",
      fields: { nested: { documents: [document] } },
      blocks: [
        {
          key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          type: "richText",
          schemaVersion: 1,
          position: 1000,
          data: { content: document },
        },
      ],
      expectedRevision: created.draft.revision,
    };
    const saved = await request(`/api/v1/admin/entries/${created.id}/draft`, payload, "PUT");
    const loaded = await request(`/api/v1/admin/entries/${created.id}`, undefined, "GET");
    expect(loaded.draft.fields.nested.documents[0]).toEqual(document);
    expect(loaded.draft.blocks[0].data.content).toEqual(document);
    await request(`/api/v1/admin/entries/${created.id}/publish`, {
      expectedRevision: saved.draft.revision,
    });
    const token = await request("/api/v1/admin/api-tokens", { name: "CE8B build" });
    const readExport = async () =>
      (
        await readCompleteBuildExport(
          (url, init) => runtime.app.fetch(new Request(url, init)),
          "https://lace.test",
          token.token,
        )
      ).export;
    const exported = await readExport();
    expect(
      exported.entries.find((entry) => entry.modelKey === "posts").blocks[0].data.content,
    ).toEqual(document);
    await request(
      `/api/v1/admin/entries/${created.id}/draft`,
      { ...payload, title: "DRAFT ONLY", blocks: [], expectedRevision: saved.draft.revision },
      "PUT",
    );
    expect(await readExport()).toEqual(exported);
    // Astro fetches the actual runtime API, not a hand-authored export fixture.
    server = createServer(async (incoming, outgoing) => {
      const response = await runtime.app.fetch(
        new Request(`https://lace.test${incoming.url}`, { headers: incoming.headers }),
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    await execute("pnpm", ["run", "build"], {
      cwd: new URL("../../../apps/site", import.meta.url),
      env: {
        ...process.env,
        LACE_SITE_DATA_MODE: "live",
        LACE_API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
        LACE_BUILD_TOKEN: token.token,
        LACE_BUILD_SITE_URL: "https://site.test",
        ASTRO_TELEMETRY_DISABLED: "1",
      },
    });
    const html = await readFile(
      new URL("../../../apps/site/dist/blog/expanded/index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain(
      "<h4>Authored H4</h4><hr><pre><code>\t  &lt;code&gt; &amp;\n line two\n</code></pre>",
    );
    for (const [i, attributes] of [
      "",
      ' target="_blank" rel="noopener noreferrer"',
      ' rel="nofollow"',
      ' target="_blank" rel="noopener noreferrer nofollow"',
    ].entries())
      expect(html).toContain(`<a href="/choice-${i}"${attributes}>Choice ${i}</a>`);
    expect(html).not.toContain("DRAFT ONLY");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    runtime?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
