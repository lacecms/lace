import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { tlsEdgeProxy } from "../scripts/journeys/list-settings-mcp-proxy.mjs";
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { renderedBlockKeys, savedPositions } from "../scripts/block-order-acceptance.mjs";
import { compressingExportProxy } from "../scripts/weak-etag-acceptance.mjs";

test("block-order evidence reads the saved positions and rendered key order", () => {
  expect(savedPositions(3)).toEqual([1000, 2000, 3000]);
  expect(
    renderedBlockKeys(
      '<section data-lace-block="hero" data-lace-block-key="b"></section><p data-lace-block-key="a">',
    ),
  ).toEqual(["b", "a"]);
});

test("served entry order excludes global navigation while retaining all entry blocks", () => {
  const html =
    '<header><nav data-lace-block-key="b1"></nav></header>' +
    '<main data-lace-model="posts" data-lace-entry="post">' +
    '<section data-lace-block-key="first"><h1>First</h1></section>' +
    '<section data-lace-block-key="second"><h1>Second</h1></section></main>' +
    '<footer data-lace-block-key="unscoped"></footer>';
  expect(renderedBlockKeys(html, "post")).toEqual(["first", "second"]);
  expect(renderedBlockKeys(html)).toEqual(["b1", "first", "second", "unscoped"]);
  expect(renderedBlockKeys(html, "absent")).toEqual([]);
});

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}/`;
}

test("the compressing proxy weakens a gzip 200 validator and passes 304 through", async () => {
  const origin = createServer((request, response) => {
    if (request.headers["if-none-match"]?.replace(/^W\//u, "") === '"4"') {
      response.writeHead(304, { etag: '"4"' }).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: '"4"' });
    response.end(JSON.stringify({ version: 4 }));
  });
  const { requests, server } = compressingExportProxy(await listen(origin));
  const proxy = await listen(server);
  try {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      import("node:http").then(({ get }) =>
        get(
          `${proxy}api/v1/public/build-export`,
          { headers: { "accept-encoding": "gzip" } },
          (response) => {
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve({ response, body: Buffer.concat(chunks) }));
          },
        ).on("error", reject),
      );
    });
    expect(raw.response.headers.etag).toBe('W/"4"');
    expect(raw.response.headers["content-encoding"]).toBe("gzip");
    expect(JSON.parse(gunzipSync(raw.body).toString("utf8"))).toEqual({ version: 4 });
    const revalidated = await fetch(`${proxy}api/v1/public/build-export`, {
      headers: { "if-none-match": 'W/"4"' },
    });
    expect(revalidated.status).toBe(304);
    expect(requests.map(({ condition, status }) => [condition, status])).toEqual([
      [undefined, 200],
      ['W/"4"', 304],
    ]);
  } finally {
    server.closeAllConnections();
    origin.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => origin.close(resolve));
  }
});

test("TLS acceptance transport preserves native multipart form data and file bytes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-tls-multipart-"));
  const execute = promisify(execFile);
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        contentType: request.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  });
  let tls;
  try {
    tls = await tlsEdgeProxy({
      parent,
      upstream: await listen(upstream),
      workspace: new URL("..", import.meta.url).pathname,
      secretValues: new Set(),
      run: async (_stage, tool, args) => {
        await execute(tool, args);
      },
    });
    const form = new FormData();
    form.append("file", new Blob(["exact-fixture-bytes"], { type: "image/png" }), "fixture.png");
    form.append("tags", "rc1-picker");
    const response = await tls.fetch(new URL("upload", tls.base), { method: "POST", body: form });
    expect(response.status).toBe(200);
    const echoed = await response.json();
    expect(echoed.contentType).toMatch(/^multipart\/form-data; boundary=/u);
    expect(echoed.body).toContain('name="file"; filename="fixture.png"');
    expect(echoed.body).toContain("exact-fixture-bytes");
    expect(echoed.body).toContain('name="tags"');
    expect(echoed.body).toContain("rc1-picker");
  } finally {
    await tls?.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(parent, { recursive: true, force: true });
  }
});
