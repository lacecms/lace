import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runPreflight } from "../dist/preflight.js";
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const account = "a".repeat(32),
  sentinel = "private-token-sentinel";
const options = { wranglerAuth: "oauth", operatorEnv: "private", json: true };
const success = () =>
  Response.json({ success: true, result: [{ success: true, results: [{ 1: 1 }] }] });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lace-preflight-"));
  roots.push(root);
  await mkdir(join(root, "worker"));
  await writeFile(
    join(root, "worker/wrangler.jsonc"),
    '{"d1_databases":[{"binding":"DB","database_id":"real-db"}]}',
  );
  await writeFile(
    join(root, "private"),
    `CLOUDFLARE_ACCOUNT_ID=${account}\nCLOUDFLARE_API_TOKEN=${sentinel}\nLACE_D1_DATABASE_ID=real-db\nLACE_WRANGLER_CONFIG=worker/wrangler.jsonc\n`,
    { mode: 0o600 },
  );
  return root;
}
async function run(root, overrides = {}, opts = options) {
  return runPreflight(opts, { cwd: root, environment: {}, request: success, ...overrides });
}
test("clean private-file split preflight is concurrent read-only evidence, not OAuth/write proof", async () => {
  const root = await fixture(),
    request = vi.fn(success);
  const before = await Promise.all(
    ["private", "worker/wrangler.jsonc"].map((path) => readFile(join(root, path))),
  );
  const [a, b] = await Promise.all([run(root, { request }), run(root, { request })]);
  expect(a.report).toEqual(b.report);
  expect(a.exitCode).toBe(0);
  expect(a.report.data).toMatchObject({
    accountId: account,
    laceSource: "operator-file",
    wranglerSource: "oauth-candidate",
    sameToken: null,
  });
  expect(a.report.data.checks.at(-1).status).toBe("unverified");
  expect(a.output).not.toContain(sentinel);
  for (const [, input] of request.mock.calls) {
    expect(JSON.parse(input.body)).toEqual({ batch: [{ sql: "SELECT 1", params: [] }] });
    expect(input.redirect).toBe("error");
  }
  expect(
    await Promise.all(
      ["private", "worker/wrangler.jsonc"].map((path) => readFile(join(root, path))),
    ),
  ).toEqual(before);
  expect((await readdir(root)).sort()).toEqual(["private", "worker"]);
});
test.each(["process", ".env", ".env.local"])(
  "OAuth refuses contamination from %s until removed",
  async (source) => {
    const root = await fixture(),
      request = vi.fn(success);
    const environment = source === "process" ? { CLOUDFLARE_API_TOKEN: sentinel } : {};
    if (source !== "process")
      await writeFile(join(root, source), `CLOUDFLARE_API_TOKEN=${sentinel}\n`);
    const result = await run(root, { environment, request });
    expect(result.exitCode).toBe(4);
    expect(request).not.toHaveBeenCalled();
    expect(result.output).not.toContain(sentinel);
    expect(result.report.nextAction).toContain("both .env and .env.local");
    if (source !== "process") await rm(join(root, source));
    expect((await run(root)).exitCode).toBe(0);
  },
);
test("OAuth refuses shadowed dotenv tokens; token mode uses pinned precedence and reports distinct tokens", async () => {
  const root = await fixture();
  await writeFile(join(root, ".env"), "CLOUDFLARE_API_TOKEN=first\n");
  await writeFile(join(root, ".env.local"), "CLOUDFLARE_API_TOKEN=second\n");
  expect((await run(root, { environment: { CLOUDFLARE_API_TOKEN: "" } })).exitCode).toBe(4);
  const result = await run(root, {}, { ...options, wranglerAuth: "token" });
  expect(result.report.data).toMatchObject({ wranglerSource: "dotenv-local", sameToken: false });
  expect(
    (
      await run(
        root,
        { environment: { CLOUDFLARE_API_TOKEN: "third" } },
        { ...options, wranglerAuth: "token" },
      )
    ).report.data.wranglerSource,
  ).toBe("process");
});
test("single-token choice uses explicit process loading with no implicit operator-file assumption", async () => {
  const root = await fixture();
  expect((await run(root, {}, { ...options, wranglerAuth: "token" })).exitCode).toBe(4);
  const result = await run(
    root,
    { environment: { CLOUDFLARE_API_TOKEN: sentinel } },
    { ...options, wranglerAuth: "token" },
  );
  expect(result.report.data).toMatchObject({
    wranglerSource: "process",
    laceSource: "process",
    sameToken: true,
  });
});
test("account/config/unsupported selections fail before request and never reflect invalid values", async () => {
  const root = await fixture(),
    request = vi.fn(success);
  for (const environment of [
    { CLOUDFLARE_ACCOUNT_ID: "private-invalid-account" },
    { CLOUDFLARE_API_KEY: sentinel },
    { CLOUDFLARE_ENV: sentinel },
    { LACE_D1_DATABASE_ID: "00000000-0000-0000-0000-000000000000" },
  ]) {
    const result = await run(root, { environment, request });
    expect(result.exitCode).toBe(4);
    expect(result.output).not.toContain(sentinel);
    expect(result.output).not.toContain("private-invalid-account");
  }
  await writeFile(join(root, ".env.local"), `CLOUDFLARE_ACCOUNT_ID=${"b".repeat(32)}\n`);
  expect((await run(root, { request })).exitCode).toBe(4);
  expect(request).not.toHaveBeenCalled();
});
test.each([401, 403, 500, 302])("provider HTTP %s fails without body exposure", async (status) => {
  const root = await fixture();
  const result = await run(root, { request: async () => new Response(sentinel, { status }) });
  expect(result.exitCode).toBe(6);
  expect(result.output).not.toContain(sentinel);
});
test("malformed, oversized, thrown and hanging provider responses are bounded", async () => {
  const root = await fixture();
  for (const request of [
    async () => Response.json({ success: true }),
    async () => new Response("x".repeat(65537)),
    async () => {
      throw new Error(sentinel);
    },
    () => new Promise(() => {}),
  ]) {
    const result = await run(root, { request, probeMs: 10, reportMs: 100 });
    expect(result.exitCode).toBe(6);
    expect(result.output).not.toContain(sentinel);
  }
  const controller = new AbortController();
  const request = (_url, input) => {
    input.signal.addEventListener("abort", () => controller.abort());
    return new Promise(() => {});
  };
  await run(root, { request, probeMs: 10 });
  expect(controller.signal.aborted).toBe(true);
});
test("human and JSON share fixed conclusions and unreadable file failures are safe", async () => {
  const root = await fixture();
  const human = await run(root, {}, { ...options, json: false });
  expect(human.output).toContain(account);
  expect(human.output).not.toContain(sentinel);
  const result = await run(root, {
    file: async () => {
      throw new Error(sentinel + root);
    },
  });
  expect(result.exitCode).toBe(4);
  expect(result.output).not.toContain(root);
  expect(result.output).not.toContain(sentinel);
  expect(JSON.parse(result.output)).toEqual(result.report);
});
