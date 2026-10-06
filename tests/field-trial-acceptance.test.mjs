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
