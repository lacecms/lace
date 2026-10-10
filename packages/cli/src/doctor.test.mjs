import { expect, test, afterEach } from "vitest";
import { mkdtemp, writeFile, readdir, readFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseDoctorArguments } from "../dist/doctor-report.js";
import { runDoctor } from "../dist/doctor.js";
import { doctorIO, boundedFile, boundedProcess, boundedJson } from "../dist/doctor-io.js";
import { invalidSettings } from "../dist/doctor-settings.js";
import { checkedInMigrations, parseNodeRuntimeSettings } from "@lacecms/platform-node";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "lace-doctor-"));
  roots.push(root);
  return root;
}
const sentinel = "private-doctor-sentinel";
const settings = {
  LACE_API_BASE_URL: "http://127.0.0.1:3000/",
  LACE_PUBLIC_BASE_URL: "http://127.0.0.1:3000/",
  LACE_DATABASE_PATH: ".lace/data/lace.sqlite",
  LACE_AUTH_SECRET: "a".repeat(64),
  LACE_MINIO_ACCESS_KEY: "minio-access-key",
  LACE_MINIO_SECRET_KEY: "s".repeat(64),
  LACE_MINIO_ENDPOINT: "http://127.0.0.1:9000/",
  LACE_MINIO_BUCKET: "lace-media",
  LACE_MINIO_REGION: "us-east-1",
  LACE_MINIO_TIMEOUT_MS: "5000",
};
const cloudflare = {
  ...settings,
  LACE_WRANGLER_CONFIG: "worker.jsonc",
  LACE_CLOUDFLARE_PERSIST_TO: "absent-state",
  LACE_D1_DATABASE_ID: "db-id",
  CLOUDFLARE_ACCOUNT_ID: "account",
  CLOUDFLARE_API_TOKEN: sentinel,
};
const baseOptions = parseDoctorArguments(["--target", "node", "--stage", "setup", "--json"]);
const getCheck = (result, id) => result.report.data.checks.find((check) => check.id === id);
const offline = () => {
  throw Object.assign(new TypeError(sentinel), { cause: { code: "ECONNREFUSED" } });
};
function io(overrides = {}) {
  return {
    ...doctorIO,
    nodeVersion: "24.12.0",
    process: async (command, args) =>
      command === "pnpm" ? "12.3.4" : args.includes("doctor-sqlite.js") ? "missing" : "missing",
    request: async () => offline(),
    ...overrides,
  };
}
async function project() {
  const root = await directory();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.12.0", pnpm: ">=12" } }),
  );
  return root;
}
async function execute(cwd, environment = settings, options = baseOptions, overrides = {}) {
  return runDoctor(options, { cwd, environment, io: io(overrides) });
}

test("initial setup distinguishes expected state from ready failures and probes no Docker", async () => {
  const root = await project();
  const calls = [];
  const process = async (command, args) => {
    calls.push([command, args]);
    return command === "pnpm" ? "12.3.4" : "missing";
  };
  const before = await readdir(root);
  const initial = await execute(root, settings, baseOptions, { process });
  expect(initial.exitCode).toBe(0);
  for (const id of ["migrations", "api-readiness", "build-token"])
    expect(getCheck(initial, id).status).toBe("expected");
  expect(calls.some(([command]) => command === "docker")).toBe(false);
  expect(await readdir(root)).toEqual(before);
  const ready = await execute(root, settings, { ...baseOptions, stage: "ready" }, { process });
  expect(ready.exitCode).toBe(5);
  for (const id of ["migrations", "api-readiness", "build-token"])
    expect(getCheck(ready, id).status).toBe("fail");
});

test("doctor uses project semver ranges and aggregates independent settings failures", async () => {
  const root = await project();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: "^25.0.0", pnpm: "^13.0.0" } }),
  );
  const result = await execute(root, { ...settings, LACE_AUTH_SECRET: "" });
  expect(result.exitCode).toBe(4);
  for (const id of ["node", "pnpm", "settings"]) expect(getCheck(result, id).status).toBe("fail");
  expect(getCheck(result, "migrations").status).toBe("skipped");
  for (const engines of [{ node: "invalid-sentinel", pnpm: "*" }, { node: "*" }, null]) {
    await writeFile(join(root, "package.json"), JSON.stringify({ engines }));
    expect(getCheck(await execute(root), "project").code).toBe("PROJECT_INVALID");
  }
});

test("generated minimum-only engines accept newer majors and reject older versions", async () => {
  const template = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "../../create-lace/templates/package.json"),
      "utf8",
    ),
  );
  expect(template.engines).toEqual({ node: ">=24.12.0", pnpm: ">=12" });
  const root = await project();
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: template.engines }));
  const before = await readdir(root);
  const versions = (node, pnpm) => ({
    nodeVersion: node,
    process: async (command) => (command === "pnpm" ? pnpm : "missing"),
  });
  for (const [node, pnpm] of [
    ["v24.12.0", "12.0.0"],
    ["v25.2.1", "13.0.0"],
    ["v26.0.0", "14.1.0"],
  ]) {
    const result = await execute(root, settings, baseOptions, versions(node, pnpm));
    expect(getCheck(result, "node").status, node).toBe("pass");
    expect(getCheck(result, "pnpm").status, pnpm).toBe("pass");
    expect(getCheck(result, "node").reason).not.toMatch(/tested|verified/u);
    expect(result.exitCode).toBe(0);
  }
  const below = await execute(root, settings, baseOptions, versions("v24.11.9", "11.9.9"));
  for (const id of ["node", "pnpm"])
    expect(getCheck(below, id)).toMatchObject({ status: "fail", code: "VERSION_INCOMPATIBLE" });
  expect(below.exitCode).toBe(4);
  // A consumer that keeps its own upper bound is still held to it.
  const bounded = JSON.stringify({ engines: { node: ">=24.12.0 <25", pnpm: ">=12 <13" } });
  await writeFile(join(root, "package.json"), bounded);
  const newer = await execute(root, settings, baseOptions, versions("v26.0.0", "13.0.0"));
  for (const id of ["node", "pnpm"]) expect(getCheck(newer, id).status).toBe("fail");
  expect(newer.exitCode).toBe(4);
  expect(await readFile(join(root, "package.json"), "utf8")).toBe(bounded);
  expect(await readdir(root)).toEqual(before);
});

test("dotenv is read without executing bytes and process environment wins", async () => {
  const root = await project();
  await writeFile(
    join(root, ".env"),
    Object.entries(settings)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + `\nLACE_BUILD_TOKEN=${sentinel}\nCUSTOM=$(touch mutation-marker)\n`,
  );
  const result = await execute(root, { LACE_AUTH_SECRET: "" });
  expect(result.exitCode).toBe(4);
  expect(getCheck(result, "settings").reason).toContain("LACE_AUTH_SECRET");
  expect(getCheck(result, "build-token").code).toBe("TOKEN_PRESENT");
  expect(result.output).not.toContain(sentinel);
  expect(await readdir(root)).not.toContain("mutation-marker");
});

test("unsafe, unreadable, missing and oversized regular configuration is diagnosed safely", async () => {
  for (const kind of ["symlink", "directory", "oversized", "malformed"]) {
    const root = await project();
    const path = join(root, ".env");
    if (kind === "symlink") await symlink("missing", path);
    else if (kind === "directory") await mkdir(path);
    else if (kind === "oversized") await writeFile(path, "x".repeat(65537));
    else await writeFile(join(root, "package.json"), "{broken");
    expect((await execute(root)).exitCode).toBe(4);
  }
  const root = await project();
  const result = await execute(root, settings, baseOptions, {
    file: async (path, signal) => {
      if (path.endsWith(".env")) throw Object.assign(new Error(sentinel), { code: "EACCES" });
      return boundedFile(path, signal);
    },
  });
  expect(getCheck(result, "settings").code).toBe("ENVIRONMENT_UNREADABLE");
  expect(result.output).not.toContain(sentinel);
});

test("native settings track runtime parser and Compose validates host mapping and mount", async () => {
  expect(() => parseNodeRuntimeSettings(settings)).not.toThrow();
  expect(await invalidSettings(baseOptions, settings, "/tmp")).toEqual([]);
  for (const name of [
    "LACE_MINIO_BUCKET",
    "LACE_MINIO_ENDPOINT",
    "LACE_PUBLIC_BASE_URL",
    "LACE_MINIO_TIMEOUT_MS",
  ])
    expect(
      await invalidSettings(baseOptions, { ...settings, [name]: "INVALID/value" }, "/tmp"),
    ).toContain(name);
  const root = await project();
  const compose = {
    ...settings,
    LACE_MINIO_ROOT_ACCESS_KEY: "root-access",
    LACE_MINIO_ROOT_SECRET: "s".repeat(64),
    LACE_BUILDER_SECRET: "b".repeat(64),
    LACE_API_IMAGE: "api:tag",
    LACE_BUILDER_IMAGE: "builder:tag",
  };
  for (const key of ["LACE_MINIO_ACCESS_KEY", "LACE_MINIO_SECRET_KEY", "LACE_MINIO_ENDPOINT"])
    delete compose[key];
  const options = { ...baseOptions, mode: "compose" };
  expect(await invalidSettings(options, compose, root)).toEqual([]);
  expect(
    await invalidSettings(
      options,
      { ...compose, LACE_DATABASE_PATH: "other.sqlite", LACE_HTTP_PORT: "bad" },
      root,
    ),
  ).toEqual(["LACE_DATABASE_PATH", "LACE_HTTP_PORT"]);
  const calls = [];
  const result = await execute(root, compose, options, {
    process: async (command, args) => {
      calls.push([command, args]);
      if (command === "docker" && args[0] === "info") throw new Error(sentinel);
      return command === "pnpm" ? "12.3.4" : command === "docker" ? "2.40.0" : "missing";
    },
  });
  expect(getCheck(result, "settings").status).toBe("pass");
  expect(getCheck(result, "docker-compose").status).toBe("pass");
  expect(getCheck(result, "docker-daemon").status).toBe("fail");
  expect(calls.filter(([command]) => command === "docker").map(([, args]) => args[0])).toEqual([
    "compose",
    "info",
  ]);
  expect(result.output).not.toContain(sentinel);
});

test("doctor validates email settings by name without contacting a mail server", async () => {
  const root = await project();
  const requests = [];
  const unconfigured = await execute(root, settings, baseOptions, {
    request: async (...args) => {
      requests.push(args);
      return offline();
    },
  });
  expect(getCheck(unconfigured, "email")).toMatchObject({
    code: "EMAIL_NOT_CONFIGURED",
    status: "pass",
  });
  expect(unconfigured.exitCode).toBe(0);
  const smtp = {
    ...settings,
    LACE_EMAIL_FROM: "Lace <cms@example.com>",
    LACE_EMAIL_PROVIDER: "smtp",
    LACE_SMTP_PASSWORD: sentinel,
    LACE_SMTP_USER: "lace",
  };
  const missingHost = await execute(root, smtp);
  expect(getCheck(missingHost, "settings")).toMatchObject({ status: "fail" });
  expect(getCheck(missingHost, "settings").reason).toContain("LACE_SMTP_HOST");
  expect(getCheck(missingHost, "email").status).toBe("skipped");
  expect(missingHost.output).not.toContain(sentinel);
  const configured = await execute(root, { ...smtp, LACE_SMTP_HOST: "smtp.example.com" });
  expect(getCheck(configured, "email")).toMatchObject({ status: "pass" });
  expect(getCheck(configured, "email").reason).toContain("smtp");
  expect(getCheck(configured, "email").reason).toContain("no message was sent");
  expect(
    await invalidSettings(
      baseOptions,
      { ...settings, LACE_EMAIL_FROM: "cms@example.com", LACE_EMAIL_PROVIDER: "cloudflare" },
      root,
    ),
  ).toEqual(["LACE_EMAIL_PROVIDER"]);
  // Compose validates against the production image: plaintext SMTP is refused.
  const compose = {
    ...settings,
    LACE_MINIO_ROOT_ACCESS_KEY: "root-access",
    LACE_MINIO_ROOT_SECRET: "s".repeat(64),
    LACE_BUILDER_SECRET: "b".repeat(64),
    LACE_API_IMAGE: "api:tag",
    LACE_BUILDER_IMAGE: "builder:tag",
    LACE_EMAIL_FROM: "cms@example.com",
    LACE_EMAIL_PROVIDER: "smtp",
    LACE_SMTP_HOST: "smtp.example.com",
    LACE_SMTP_SECURITY: "none",
  };
  expect(await invalidSettings({ ...baseOptions, mode: "compose" }, compose, root)).toEqual([
    "LACE_SMTP_SECURITY",
  ]);
  expect(requests).toEqual(
    requests.filter(([url]) => !String(url).includes("smtp") && !String(url).includes("resend")),
  );
});

async function installWrangler(root) {
  await mkdir(join(root, "node_modules/wrangler/bin"), { recursive: true });
  await writeFile(
    join(root, "node_modules/wrangler/package.json"),
    JSON.stringify({ name: "wrangler", version: "4.129.0", bin: { wrangler: "bin/wrangler.js" } }),
  );
  await writeFile(
    join(root, "node_modules/wrangler/bin/wrangler.js"),
    `throw new Error('${sentinel}')`,
  );
}
test("local Cloudflare validates binding without starting Wrangler or creating persistence", async () => {
  const root = await project();
  await installWrangler(root);
  await writeFile(
    join(root, "worker.jsonc"),
    JSON.stringify({ d1_databases: [{ binding: "DB", database_id: "db-id" }] }),
  );
  const options = { ...baseOptions, target: "cloudflare-local", mode: null };
  const before = await readdir(root);
  const result = await execute(root, cloudflare, options);
  expect(result.exitCode).toBe(0);
  expect(getCheck(result, "wrangler").status).toBe("pass");
  expect(getCheck(result, "migrations").status).toBe("skipped");
  expect(getCheck(result, "api-readiness").status).toBe("expected");
  expect(await readdir(root)).toEqual(before);
  const ready = await execute(
    root,
    { ...cloudflare, LACE_BUILD_TOKEN: sentinel },
    { ...options, stage: "ready" },
    { request: async () => Response.json({ status: "ready" }) },
  );
  expect(ready.exitCode).toBe(0);
  expect(getCheck(ready, "migrations").reason).toContain("API-derived");
  await writeFile(
    join(root, "worker.jsonc"),
    JSON.stringify({ pages_build_output_dir: "site/dist" }),
  );
  expect(getCheck(await execute(root, cloudflare, options), "cloudflare-binding").code).toBe(
    "BINDING_INVALID",
  );
  let requested = false;
  const invalid = await execute(
    root,
    { ...cloudflare, LACE_API_BASE_URL: "https://remote.example/" },
    options,
    {
      request: async () => {
        requested = true;
        throw new Error(sentinel);
      },
    },
  );
  expect(getCheck(invalid, "settings").status).toBe("fail");
  expect(requested).toBe(false);
});

test("remote D1 is bounded SELECT-only and preserves missing-ledger/auth distinction", async () => {
  const root = await project();
  await installWrangler(root);
  await writeFile(
    join(root, "worker.jsonc"),
    JSON.stringify({ d1_databases: [{ binding: "DB", database_id: "db-id" }] }),
  );
  const options = { ...baseOptions, target: "cloudflare-remote", mode: null };
  const cases = [
    [
      Response.json({
        success: true,
        result: [{ success: true, results: checkedInMigrations.map(({ name }) => ({ name })) }],
      }),
      "pass",
    ],
    [
      Response.json({
        success: false,
        errors: [{ message: `no such table: d1_migrations ${sentinel}` }],
      }),
      "expected",
    ],
    [new Response(sentinel, { status: 403 }), "fail"],
    [Response.json({ success: true, result: [{ success: true, results: [] }] }), "expected"],
    [new Response(sentinel, { status: 500 }), "fail"],
  ];
  for (const [response, status] of cases) {
    const calls = [];
    const result = await execute(root, cloudflare, options, {
      request: async (url, init) => {
        calls.push([String(url), init]);
        return String(url).includes("api.cloudflare.com")
          ? response
          : Response.json({ status: "ready" });
      },
    });
    expect(getCheck(result, "migrations").status).toBe(status);
    const [, init] = calls.find(([url]) => url.includes("api.cloudflare.com"));
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toEqual({
      batch: [{ sql: "select name from d1_migrations", params: [] }],
    });
    expect(calls.find(([url]) => url.includes("health/ready"))[1]).not.toHaveProperty("headers");
    expect(result.output).not.toContain(sentinel);
  }
  const calls = [];
  const missing = await execute(root, { ...cloudflare, CLOUDFLARE_API_TOKEN: "" }, options, {
    request: async (url) => {
      calls.push(String(url));
      return Response.json({ status: "ready" });
    },
  });
  expect(missing.exitCode).toBe(4);
  expect(calls.some((url) => url.includes("api.cloudflare.com"))).toBe(false);
});

test("API accepts only the readiness contract and never follows redirects or sends tokens", async () => {
  const root = await project();
  for (const [response, status] of [
    [Response.json({ status: "ready" }), "pass"],
    [Response.json({ status: "not_ready" }, { status: 503 }), "fail"],
    [Response.json({ status: "ready", password: sentinel }), "fail"],
    [new Response(sentinel, { status: 200 }), "fail"],
    [new Response(null, { status: 302, headers: { location: "http://private.example/" } }), "fail"],
    [new Response("x".repeat(65537)), "fail"],
  ]) {
    let request;
    const result = await execute(
      root,
      {
        ...settings,
        LACE_API_BASE_URL: "http://127.0.0.1:3000/prefix/",
        LACE_BUILD_TOKEN: sentinel,
      },
      baseOptions,
      {
        request: async (url, init) => {
          request = [url, init];
          return response;
        },
      },
    );
    expect(getCheck(result, "api-readiness").status).toBe(status);
    expect(String(request[0])).toBe("http://127.0.0.1:3000/prefix/health/ready");
    expect(request[1].redirect).toBe("error");
    expect(request[1]).not.toHaveProperty("headers");
    expect(result.output).not.toContain(sentinel);
  }
  const tls = await execute(root, settings, baseOptions, {
    request: async () => {
      throw Object.assign(new Error(sentinel), { cause: { code: "CERT_HAS_EXPIRED" } });
    },
  });
  expect(getCheck(tls, "api-readiness").status).toBe("fail");
});

test("hung probes and overall budget terminate, including response streams and subprocesses", async () => {
  const root = await project();
  const start = Date.now();
  const result = await runDoctor(baseOptions, {
    cwd: root,
    environment: settings,
    io: io({ request: async () => new Promise(() => undefined) }),
    probeMs: 40,
    reportMs: 120,
  });
  expect(Date.now() - start).toBeLessThan(1000);
  expect(getCheck(result, "api-readiness").status).toBe("fail");
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 30);
  await expect(
    boundedProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], root, controller.signal),
  ).rejects.toThrow();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const bodyController = new AbortController();
  setTimeout(() => bodyController.abort(), 30);
  await expect(boundedJson(new Response(stream), bodyController.signal)).rejects.toThrow();
  expect(cancelled).toBe(true);
  const budgetStart = Date.now();
  const budget = await runDoctor(baseOptions, {
    cwd: root,
    environment: settings,
    io: io({ file: async () => new Promise(() => undefined) }),
    probeMs: 50,
    reportMs: 60,
  });
  expect(Date.now() - budgetStart).toBeLessThan(300);
  expect(budget.exitCode).toBe(4);
});

test("bounded process rejects oversized stdout/stderr and raw errors", async () => {
  const root = await project();
  for (const script of [
    "process.stdout.write('x'.repeat(70000))",
    "process.stderr.write('x'.repeat(70000))",
    `throw new Error('${sentinel}')`,
  ])
    await expect(
      boundedProcess(process.execPath, ["-e", script], root, AbortSignal.timeout(1000)),
    ).rejects.toThrow("Diagnostic probe failed.");
});

test("packaged command emits one safe JSON or readable human report without configuration evaluation", async () => {
  const root = await project();
  await writeFile(join(root, "lace.config.ts"), `throw new Error('${sentinel}')`);
  for (const json of [true, false]) {
    const result = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, "../dist/bin.js"),
        "doctor",
        "--target",
        "node",
        "--stage",
        "setup",
        ...(json ? ["--json"] : []),
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...settings, LACE_AUTH_SECRET: "", LACE_BUILD_TOKEN: sentinel },
      },
    );
    expect(result.status).toBe(4);
    expect(result.stderr).toBe("");
    if (json) {
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        operation: "doctor",
        code: "DOCTOR_FAILED",
      });
    } else expect(result.stdout).toContain("[fail] settings:");
    expect(result.stdout).not.toContain(sentinel);
  }
});

async function siteProject(site, parentAstro = false) {
  const parent = await directory();
  if (parentAstro) {
    await writeFile(join(parent, "astro.config.mjs"), "export default {};\n");
    await writeFile(join(parent, "package.json"), '{"dependencies":{"astro":"7.3.1"}}\n');
  }
  const root = join(parent, "cms");
  await mkdir(join(root, ".lace"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.12.0", pnpm: ">=12" } }),
  );
  const manifest = { schemaVersion: 1, templateVersion: "0.11.0", files: {} };
  if (site !== undefined) manifest.site = site;
  await writeFile(join(root, ".lace/manifest.json"), JSON.stringify(manifest));
  return { parent, root };
}

test("site check is not applicable without a manifest and fails on an invalid one", async () => {
  const root = await project();
  const result = await execute(root);
  expect(getCheck(result, "site")).toMatchObject({
    status: "skipped",
    code: "SITE_NOT_APPLICABLE",
  });
  expect(result.exitCode).toBe(0);
  await mkdir(join(root, ".lace"));
  await writeFile(join(root, ".lace/manifest.json"), '{"schemaVersion":1,"site":"none"}');
  const invalid = await execute(root);
  expect(getCheck(invalid, "site")).toMatchObject({ status: "fail", code: "MANIFEST_INVALID" });
  expect(invalid.exitCode).toBe(4);
});

test("site check passes for a headless project without probing site/", async () => {
  const { root } = await siteProject({ mode: "none", path: null });
  const paths = [];
  const result = await execute(root, settings, baseOptions, {
    file: async (path, signal) => {
      paths.push(path);
      return doctorIO.file(path, signal);
    },
  });
  expect(getCheck(result, "site")).toMatchObject({ status: "pass", code: "SITE_NONE" });
  expect(paths.some((path) => path.includes(`${join(root, "site")}`))).toBe(false);
});

test("an existing site without packages or blocks is expected at setup and fails at ready", async () => {
  const { root } = await siteProject({ mode: "existing", path: ".." }, true);
  const setup = await execute(root);
  const check = getCheck(setup, "site");
  expect(check).toMatchObject({ status: "expected", code: "SITE_PACKAGES_MISSING" });
  expect(check.nextAction).toContain("pnpm install in ..");
  expect(check.nextAction).toContain("pnpm exec lace add block --all --site ..");
  expect(setup.exitCode).toBe(0);
  const ready = await execute(root, settings, { ...baseOptions, stage: "ready" });
  expect(getCheck(ready, "site").status).toBe("fail");
  expect(ready.exitCode).not.toBe(0);
  for (const name of ["astro", "render"]) {
    await mkdir(join(root, "..", "node_modules/@lacecms", name), { recursive: true });
    await writeFile(join(root, "..", "node_modules/@lacecms", name, "package.json"), "{}");
  }
  const blocks = getCheck(await execute(root), "site");
  expect(blocks).toMatchObject({ status: "expected", code: "SITE_BLOCKS_MISSING" });
  expect(blocks.nextAction).toBe(
    "Run pnpm exec lace add block --all --site ..; see docs/lace-astro-site.md.",
  );
});

test("a missing or non-Astro recorded site fails as configuration", async () => {
  const missing = await siteProject({ mode: "existing", path: "../web" });
  const result = await execute(missing.root);
  expect(getCheck(result, "site")).toMatchObject({ status: "fail", code: "SITE_MISSING" });
  expect(result.exitCode).toBe(4);
  const starter = await siteProject({ mode: "starter", path: "site" });
  await mkdir(join(starter.root, "site"));
  await writeFile(join(starter.root, "site/package.json"), '{"dependencies":{}}');
  expect(getCheck(await execute(starter.root), "site")).toMatchObject({
    status: "fail",
    code: "SITE_NOT_ASTRO",
  });
});

test("a connected starter site is ready, including legacy manifests", async () => {
  for (const site of [{ mode: "starter", path: "site" }, undefined]) {
    const { root } = await siteProject(site);
    const starter = resolve(import.meta.dirname, "../../create-lace/templates/site");
    await mkdir(join(root, "site/src/lace"), { recursive: true });
    for (const file of ["astro.config.mjs", "package.json", "lace.site.json", "src/lace/blocks.ts"])
      await writeFile(join(root, "site", file), await readFile(join(starter, file)));
    for (const name of ["astro", "render"]) {
      await mkdir(join(root, "site/node_modules/@lacecms", name), { recursive: true });
      await writeFile(join(root, "site/node_modules/@lacecms", name, "package.json"), "{}");
    }
    const result = await execute(root, settings, { ...baseOptions, stage: "ready" });
    expect(getCheck(result, "site")).toMatchObject({ status: "pass", code: "SITE_READY" });
  }
});
