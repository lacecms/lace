import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { crc32, deflateSync } from "node:zlib";

/** A structurally valid 3×2 RGB PNG, so upload exercises the Worker image inspector. */
function rgbPng() {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(3, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc(2 * (1 + 3 * 3), 7);
  rows[0] = 0;
  rows[10] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const png = rgbPng();

/** Wrangler never prompts or reports metrics during acceptance. */
const wranglerEnvironment = { CI: "true", WRANGLER_SEND_METRICS: "false" };

/** The generated `cf:dev` command with only its port replaced. */
export function workerCommand(script, port) {
  const words = script.split(/\s+/u);
  const index = words.indexOf("--port");
  if (words[0] !== "wrangler" || words[1] !== "dev" || index === -1)
    throw new Error("cloudflare-dev: generated cf:dev script has an unexpected shape");
  words[index + 1] = String(port);
  return words.slice(1);
}

/** Replaces one assignment in a dotenv file without touching other bytes. */
export function withVariable(text, name, value) {
  const pattern = new RegExp(`^${name}=.*$`, "mu");
  if (!pattern.test(text)) throw new Error(`cloudflare-env: ${name} is missing`);
  return text.replace(pattern, `${name}=${value}`);
}

/**
 * Generates a `--cloudflare` project from packed packages and runs its own
 * Worker through the generated scripts: account-free bundle, local variables,
 * cloudflare-local migration/sync/bootstrap, `wrangler dev` with persistent
 * state, packaged admin, setup, login, models and media, then a restart.
 */
export async function cloudflareConsumerJourney(parent, operations) {
  const { freePort, installPackedConsumer, run, sanitize, secretValues, workspace } = operations;
  const project = join(parent, "cloudflare-consumer", "acceptance-site");
  await mkdir(dirname(project), { recursive: true });
  await run("cloudflare-generate", "node", [
    join(workspace, "packages/create-lace/dist/bin.js"),
    "create",
    project,
    "--starter",
    "--cloudflare",
  ]);
  await installPackedConsumer(project);
  const admin = join(project, "node_modules/@lacecms/platform-cloudflare/admin/index.html");
  if (!(await stat(admin).catch(() => undefined))?.isFile())
    throw new Error("cloudflare-admin: packed platform package lacks admin/index.html");

  await run("cloudflare-bundle", "pnpm", ["cf:build"], { cwd: project, env: wranglerEnvironment });
  const bundle = await readFile(join(project, ".lace/data/cloudflare-bundle/index.js"), "utf8");
  if (bundle.includes(workspace))
    throw new Error("cloudflare-bundle: Worker bundle references the Lace source workspace");
  if (!bundle.includes("/blog/:slug") || !bundle.includes("posts"))
    throw new Error("cloudflare-bundle: Worker bundle lacks the project configuration");

  await run("cloudflare-env-prepare", "pnpm", ["env:prepare"], { cwd: project });
  await run("cloudflare-worker-env-prepare", "pnpm", ["cf:env:prepare"], { cwd: project });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}/`;
  const variablesPath = join(project, "worker/.dev.vars");
  const variables = await readFile(variablesPath, "utf8");
  const authSecret = parseEnv(variables).LACE_AUTH_SECRET;
  if (!/^[a-f0-9]{64}$/u.test(authSecret ?? ""))
    throw new Error("cloudflare-env: worker/.dev.vars lacks a generated auth secret");
  secretValues.add(authSecret);
  // Acceptance runs on a free port; the local origin follows it.
  await writeFile(variablesPath, withVariable(variables, "LACE_PUBLIC_BASE_URL", base));

  for (const script of ["cf:db:migrate", "cf:content:sync"]) {
    const result = JSON.parse(
      await run(`cloudflare-${script}`, "pnpm", [script, "--json"], {
        cwd: project,
        env: wranglerEnvironment,
      }),
    );
    if (!result.ok) throw new Error(`cloudflare-${script}: unsuccessful result`);
  }
  const bootstrap = JSON.parse(
    await run("cloudflare-bootstrap", "pnpm", ["cf:auth:bootstrap", "--json"], {
      cwd: project,
      intentionalReveal: true,
    }),
  );
  const token = bootstrap.data?.token;
  if (!bootstrap.ok || typeof token !== "string") throw new Error("cloudflare-bootstrap: no token");
  secretValues.add(token);

  const scripts = JSON.parse(await readFile(join(project, "package.json"), "utf8")).scripts;
  const args = workerCommand(scripts["cf:dev"], port);
  let worker;
  const start = async (stage) => {
    worker = startWorker(project, args);
    await waitReady(worker, base, stage, sanitize);
  };
  const stop = () => stopWorker(worker);
  try {
    await start("cloudflare-dev");
    const page = await fetch(new URL("admin/", base), { signal: AbortSignal.timeout(20_000) });
    const html = await page.text();
    const asset = /src="(\/admin\/assets\/[^"]+\.js)"/u.exec(html)?.[1];
    if (!page.ok || asset === undefined)
      throw new Error("cloudflare-admin: /admin/ did not serve the packaged admin document");
    const script = await fetch(new URL(asset, base), { signal: AbortSignal.timeout(20_000) });
    if (!script.ok || script.headers.get("x-content-type-options") !== "nosniff")
      throw new Error("cloudflare-admin: packaged admin asset was not served");

    const email = "cloudflare@lace.test";
    const password = randomBytes(24).toString("hex");
    secretValues.add(password);
    await json(base, "api/v1/setup/admin", { method: "POST", json: { email, password, token } });
    const cookie = await login(base, email, password, secretValues);
    await expectModels(base, cookie);
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "cloudflare.png");
    const uploaded = await json(base, "api/v1/admin/media", {
      method: "POST",
      headers: { cookie, origin: base.slice(0, -1) },
      body: form,
    });
    const mediaId = uploaded.id;
    if (typeof mediaId !== "string") throw new Error("cloudflare-media: uploaded ID missing");

    await stop();
    await start("cloudflare-restart");
    const state = await json(base, "api/v1/setup/state");
    if (state.setupComplete !== true) throw new Error("cloudflare-restart: setup reopened");
    const restarted = await login(base, email, password, secretValues);
    await expectModels(base, restarted);
    const preview = await fetch(new URL(`api/v1/admin/media/${mediaId}/preview`, base), {
      headers: { cookie: restarted },
      signal: AbortSignal.timeout(20_000),
    });
    if (!preview.ok || !Buffer.from(await preview.arrayBuffer()).equals(png))
      throw new Error("cloudflare-restart: R2 media bytes did not persist");
  } finally {
    await stop();
  }
  console.info(
    "Generated Cloudflare Worker journey: bundle, local migrate/sync/bootstrap, admin, setup, login, media and restart persistence passed",
  );
  return { project };
}

function startWorker(project, args) {
  const child = spawn("pnpm", ["exec", "wrangler", ...args], {
    cwd: project,
    detached: true,
    env: { ...process.env, ...wranglerEnvironment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (child.output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (child.output += chunk));
  child.exited = new Promise((resolve) => child.once("exit", resolve));
  return child;
}

async function stopWorker(child) {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* Already stopped. */
    }
  }, 10_000);
  await child.exited;
  clearTimeout(timer);
}

async function waitReady(child, base, stage, sanitize) {
  console.info(`Acceptance: ${stage}`);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(new URL("health/ready", base), {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok && (await response.json()).status === "ready") return;
    } catch {
      /* Not ready yet. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stopWorker(child);
  throw new Error(
    `${stage}: local Worker did not become ready\n${sanitize(child.output).slice(-3000)}`,
  );
}

async function json(base, path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    headers: {
      ...(options.json === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`cloudflare-http: ${path} returned ${response.status}`);
  return body;
}

async function login(base, email, password, secretValues) {
  const response = await fetch(new URL("api/auth/sign-in/email", base), {
    method: "POST",
    headers: { "content-type": "application/json", origin: base.slice(0, -1) },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20_000),
  });
  const cookie = response.headers.getSetCookie()[0]?.split(";")[0];
  if (!response.ok || !cookie) throw new Error(`cloudflare-login: status ${response.status}`);
  secretValues.add(cookie);
  return cookie;
}

async function expectModels(base, cookie) {
  const models = await json(base, "api/v1/admin/content-models", { headers: { cookie } });
  const keys = models?.items?.map((item) => item.key);
  if (JSON.stringify(keys) !== JSON.stringify(["home", "posts"]))
    throw new Error(`cloudflare-config: unexpected models ${JSON.stringify(keys)}`);
}
