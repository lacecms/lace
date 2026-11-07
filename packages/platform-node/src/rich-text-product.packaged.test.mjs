import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import * as platform from "../dist/index.js";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.ts";
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
  let server;
  try {
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
    const {
      directory,
      request: send,
      runtime,
    } = await openNodeTestRuntime(platform, {
      config,
      actor: { id: "ce8b-admin", role: "admin" },
      sync: true,
    });
    const request = async (path, body, method = "POST", headers = {}) => {
      const response = await send(path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
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
    await execute("pnpm", ["run", "build", "--outDir", join(directory, "site-output")], {
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
    const html = await readFile(join(directory, "site-output/blog/expanded/index.html"), "utf8");
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
  }
}, 60_000);
