/// <reference types="node" />
import { expect } from "vitest";
import { draftPreviewOrigin, openPreviewSession } from "./preview.js";

export async function assertPreviewResourceGuards(input: {
  readonly generationId: string;
  readonly parentCookie: string;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly run: (sql: string, params: readonly unknown[]) => Promise<unknown>;
  readonly logout: () => Promise<void>;
}) {
  const { generationId, parentCookie, fetch, run, logout } = input;
  const cookie = await openPreviewSession(fetch, parentCookie, generationId);
  const call = (path: string, headers: Record<string, string> = {}, method = "GET") =>
    fetch(new Request(`${draftPreviewOrigin}/p/${generationId}/${path}`, { headers, method }));
  const original = "originals/photo.png";
  const head = await call(original, { cookie }, "HEAD");
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe("5");
  expect(head.headers.get("cache-control")).toBe("private, no-store");
  expect(await head.text()).toBe("");
  const tag = head.headers.get("etag")!;
  expect(tag).toMatch(/^"sha256-/u);
  const range = await call(original, { cookie, range: "bytes=1-2", "if-range": tag });
  expect(range.status).toBe(206);
  expect(range.headers.get("content-range")).toBe("bytes 1-2/5");
  expect(new Uint8Array(await range.arrayBuffer())).toEqual(new Uint8Array([20, 30]));
  const suffix = await call(original, { cookie, range: "bytes=-2" });
  expect(suffix.status).toBe(206);
  expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(new Uint8Array([40, 50]));
  const stale = await call(original, { cookie, range: "bytes=1-2", "if-range": `W/${tag}` });
  expect(stale.status).toBe(200);
  expect((await stale.arrayBuffer()).byteLength).toBe(5);
  const unsatisfiable = await call(original, { cookie, range: "bytes=5-" });
  expect(unsatisfiable.status).toBe(416);
  expect(unsatisfiable.headers.get("content-range")).toBe("bytes */5");
  const conditional = await call(original, { cookie, "if-none-match": `W/${tag}` });
  expect(conditional.status).toBe(304);
  expect(await conditional.text()).toBe("");

  const denied = async (credential: string, status: number) => {
    for (const path of ["", "_astro/page.css", original]) {
      for (const [method, headers] of [
        ["GET", { range: "bytes=1-2" }],
        ["GET", { "if-none-match": "*" }],
        ["HEAD", { "if-none-match": tag }],
      ] as const) {
        const response = await call(path, { ...headers, cookie: credential }, method);
        expect(response.status).toBe(status);
        expect(response.headers.get("etag")).toBeNull();
        expect(response.headers.get("content-range")).toBeNull();
        expect(response.headers.get("location")).toBeNull();
        expect(await response.text()).toBe("");
      }
    }
  };
  await denied("", 401);
  await denied(parentCookie, 401);
  await run("update user set role = 'viewer'", []);
  expect((await call(original, { cookie }, "HEAD")).status).toBe(200);
  await run("update user set disabled = 1", []);
  await denied(cookie, 401);
  await run("update user set disabled = 0, role = 'admin'", []);
  await run("update preview_generations set expires_at = 1 where id = ?", [generationId]);
  await denied(cookie, 404);
  await run("update preview_generations set expires_at = ?, state = 'invalidated' where id = ?", [
    Date.now() + 60_000,
    generationId,
  ]);
  await denied(cookie, 404);
  await run("update preview_generations set state = 'ready' where id = ?", [generationId]);
  await logout();
  await denied(cookie, 401);
}
