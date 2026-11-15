import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { BuildRequest } from "../runner/runner.js";
import { expect, test, vi } from "vitest";
import { createBuilderHandler } from "./handler.js";

const secret = "s".repeat(32);

async function invoke(
  handler: ReturnType<typeof createBuilderHandler>,
  body: unknown,
  token = secret,
) {
  const request = new IncomingMessage(new Socket());
  request.method = "POST";
  request.url = "/build";
  request.headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  request.push(typeof body === "string" ? body : JSON.stringify(body));
  request.push(null);
  const response = new ServerResponse(request);
  let status = 0;
  let result: unknown;
  vi.spyOn(response, "writeHead").mockImplementation(function (code) {
    status = code;
    return response;
  });
  vi.spyOn(response, "end").mockImplementation(function (chunk) {
    result = JSON.parse(String(chunk));
    return response;
  });
  await handler(request, response);
  if (typeof result !== "object" || result === null || Array.isArray(result))
    throw new Error("Invalid response body");
  return { status, body: result };
}

test("builder accepts only authorized closed-shape requests", async () => {
  const calls: BuildRequest[] = [];
  const handler = createBuilderHandler({
    secret,
    build: async (request) => {
      calls.push(request);
      return { status: "succeeded" };
    },
  });
  expect((await invoke(handler, { buildId: "a_1", targetVersion: 2 }, "wrong")).status).toBe(401);
  for (const body of [
    ...["sourceRoot", "siteDirectory", "outputDirectory", "args", "arguments", "executable"].map(
      (key) => ({ buildId: "a", targetVersion: 2, [key]: "override" }),
    ),
    { buildId: "a", targetVersion: 2, command: "whoami" },
    { buildId: "../escape", targetVersion: 2 },
    { buildId: "a", targetVersion: -1 },
    { buildId: "a", targetVersion: 2, env: {} },
    "{",
    "x".repeat(1025),
  ])
    expect((await invoke(handler, body)).status).toBe(400);
  expect((await invoke(handler, { buildId: "a_1", targetVersion: 2 })).status).toBe(200);
  expect(calls).toEqual([{ buildId: "a_1", targetVersion: 2 }]);
});

test("builder serializes concurrent requests", async () => {
  let active = 0;
  let maximum = 0;
  const handler = createBuilderHandler({
    secret,
    build: async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { status: "succeeded" };
    },
  });
  await Promise.all([
    invoke(handler, { buildId: "one", targetVersion: 1 }),
    invoke(handler, { buildId: "two", targetVersion: 1 }),
  ]);
  expect(maximum).toBe(1);
});

test("builder does not return thrown tool output or secrets", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = createBuilderHandler({
    secret,
    build: async () => {
      throw new Error(`secret=${secret} /source/private`);
    },
  });
  const response = await invoke(handler, { buildId: "failure", targetVersion: 1 });
  expect(response.status).toBe(503);
  expect(response.body).toEqual({
    status: "failed",
    reason: "build_failed",
    log: "Static build failed: build_failed.",
  });
  expect(JSON.stringify(response.body)).not.toContain(secret);
  expect(JSON.stringify(response.body)).not.toContain("/source/private");
  expect(log).toHaveBeenCalledWith(
    JSON.stringify({
      component: "builder",
      buildId: "failure",
      status: "failed",
      reason: "build_failed",
    }),
  );
  log.mockRestore();
});

test("authenticated source diagnostics carry only bounded safe relative paths", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const path of [
      "src/page.astro",
      "/source/private",
      "../outside",
      "a".repeat(513),
      ".env",
    ]) {
      const response = await invoke(
        createBuilderHandler({
          secret,
          build: async () => ({ status: "failed", reason: "source_symlink", path }),
        }),
        { buildId: "diagnostic", targetVersion: 1 },
      );
      expect(Reflect.get(response.body, "reason")).toBe("source_symlink");
      expect(Reflect.get(response.body, "path")).toBe(path === "src/page.astro" ? path : undefined);
      expect(Buffer.byteLength(JSON.stringify(response.body))).toBeLessThanOrEqual(1024);
    }
  } finally {
    log.mockRestore();
  }
});
