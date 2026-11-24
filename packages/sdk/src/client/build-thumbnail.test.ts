import { expect, test, vi } from "vitest";
import { createLaceClient, type LaceFetch } from "./client.js";
import {
  LaceContractError,
  LaceHttpError,
  LaceTimeoutError,
  LaceTransportError,
} from "./errors.js";

const token = "private-build-token";
const etag = '"thumbnail"';
const headers = { "content-type": "image/webp", etag };
const bytes = Uint8Array.of(1, 2, 3);
const maxBytes = 96 * 1024;

test("reads from the configured API prefix, rejects redirects, and distinguishes authorized 304", async () => {
  const fetch = vi
    .fn<LaceFetch>()
    .mockResolvedValueOnce(new Response(bytes, { headers }))
    .mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag } }))
    .mockResolvedValueOnce(Response.redirect("https://media.example/redirect"));
  const client = createLaceClient({ baseUrl: "https://cms.example/lace///", fetch, token });
  await expect(client.getBuildThumbnail("shared image")).resolves.toEqual({
    changed: true,
    etag,
    bytes,
  });
  await expect(client.getBuildThumbnail("shared image", { etag })).resolves.toEqual({
    changed: false,
    etag,
  });
  await expect(client.getBuildThumbnail("shared image")).rejects.toBeInstanceOf(LaceContractError);
  expect(fetch).toHaveBeenCalledTimes(3);
  for (const [url, init] of fetch.mock.calls) {
    expect(url.href).toBe(
      "https://cms.example/lace/api/v1/public/build-media/shared%20image/thumbnail",
    );
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${token}`);
  }
  expect(new Headers(fetch.mock.calls[1]?.[1].headers).get("if-none-match")).toBe(etag);
});

test.each([
  ["unsolicited 304", () => new Response(null, { status: 304, headers: { etag } })],
  [
    "HTML",
    () => new Response("<html></html>", { headers: { ...headers, "content-type": "text/html" } }),
  ],
  ["weak ETag", () => new Response(bytes, { headers: { ...headers, etag: `W/${etag}` } })],
  ["missing ETag", () => new Response(bytes, { headers: { "content-type": "image/webp" } })],
  ["empty body", () => new Response(null, { headers })],
  [
    "oversized content length",
    () => new Response(bytes, { headers: { ...headers, "content-length": String(maxBytes + 1) } }),
  ],
] as const)("rejects %s", async (_name, response) => {
  const client = createLaceClient({
    baseUrl: "https://cms.example",
    fetch: async () => response(),
    token,
  });
  await expect(client.getBuildThumbnail("media")).rejects.toBeInstanceOf(LaceContractError);
});

test("bounds a streamed body even with a misleading Content-Length and cancels it", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(maxBytes));
      controller.enqueue(bytes);
    },
    cancel,
  });
  const fetch = async () => new Response(body, { headers: { ...headers, "content-length": "1" } });
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch, token });
  await expect(client.getBuildThumbnail("media")).rejects.toThrow("96 KiB");
  expect(cancel).toHaveBeenCalledOnce();
});

test("the timeout covers a stalled body and cancellation redacts its reason", async () => {
  const cancel = vi.fn();
  const fetch = async () => new Response(new ReadableStream({ cancel }), { headers });
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch, token, timeoutMs: 30 });
  await expect(client.getBuildThumbnail("media")).rejects.toBeInstanceOf(LaceTimeoutError);
  const controller = new AbortController();
  const read = client.getBuildThumbnail("media", { signal: controller.signal });
  await Promise.resolve();
  controller.abort(new Error(token));
  const error = await read.catch((error: unknown) => error);
  expect(error).toBeInstanceOf(LaceTransportError);
  expect(error).not.toHaveProperty("cause");
  expect(String(error)).not.toContain(token);
  expect(cancel).toHaveBeenCalledTimes(2);
});

test("typed failures omit rejected response bodies and underlying transport messages", async () => {
  const fetch = vi
    .fn<LaceFetch>()
    .mockRejectedValueOnce(new Error(token))
    .mockResolvedValueOnce(Response.json({ error: { message: token } }, { status: 503 }));
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch, token });
  await expect(client.getBuildThumbnail("media")).rejects.toBeInstanceOf(LaceTransportError);
  const error = await client.getBuildThumbnail("media").catch((error: unknown) => error);
  expect(error).toBeInstanceOf(LaceHttpError);
  expect(error).toHaveProperty("status", 503);
  expect(error).toHaveProperty("message", "The build thumbnail is unavailable (HTTP 503).");
  expect(error).not.toHaveProperty("cause");
});
