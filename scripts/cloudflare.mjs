import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest, createServer } from "node:http";
import { join } from "node:path";
import {
  UsageError,
  apiDirectory,
  developmentDirectory,
  developmentOrigin,
  developmentPorts,
  developmentWranglerConfig,
  parseJsonc,
  root,
  routeFor,
  wranglerConfigPath,
} from "./cloudflare-lib.mjs";
import { parseDevArguments } from "./cloudflare-options.mjs";
import { migrate } from "./cloudflare-migration.mjs";

const wrangler = join(apiDirectory, "node_modules", ".bin", "wrangler");
const localHelper = join(apiDirectory, "dist", "cloudflare-local.js");
const developmentConfig = join(developmentDirectory, "wrangler.dev.json");
const developmentVariables = join(developmentDirectory, ".dev.vars");
const developmentState = join(developmentDirectory, "state");

/** Wrangler never prompts itself: Lace confirms remote work before calling it. */
const wranglerEnvironment = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

async function readWranglerConfig() {
  return parseJsonc(await readFile(wranglerConfigPath, "utf8"));
}

function applyLocalMigrations(persistTo) {
  return run(
    wrangler,
    [
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--persist-to",
      persistTo,
      "--config",
      wranglerConfigPath,
    ],
    { cwd: apiDirectory, env: wranglerEnvironment },
  );
}

/** The local auth secret is generated once and reused so sessions survive restarts. */
async function ensureDevelopmentVariables() {
  await mkdir(developmentDirectory, { mode: 0o700, recursive: true });
  try {
    await access(developmentVariables);
  } catch {
    await writeFile(
      developmentVariables,
      `LACE_AUTH_SECRET=${randomBytes(32).toString("base64url")}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
  await chmod(developmentVariables, 0o600);
}

function proxyHeaders(headers) {
  const result = { ...headers };
  result.host = `127.0.0.1:${developmentPorts.gateway}`;
  delete result.forwarded;
  for (const name of Object.keys(result)) if (name.startsWith("x-forwarded-")) delete result[name];
  return result;
}

function upstreamUnavailable(response) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(502, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Development upstream is unavailable." },
    }),
  );
}

/** One same-origin entry point: Worker for API/health, Vite for admin, Astro for the site. */
function startGateway() {
  const server = createServer((incoming, response) => {
    const pathname = new URL(incoming.url ?? "/", developmentOrigin).pathname;
    const upstream = httpRequest(
      {
        headers: proxyHeaders(incoming.headers),
        hostname: "127.0.0.1",
        method: incoming.method,
        path: incoming.url,
        port: developmentPorts[routeFor(pathname)],
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.statusMessage, answer.rawHeaders);
        answer.pipe(response);
      },
    );
    upstream.once("error", () => upstreamUnavailable(response));
    incoming.pipe(upstream);
  });
  server.on("upgrade", (incoming, socket, head) => {
    const pathname = new URL(incoming.url ?? "/", developmentOrigin).pathname;
    const target = routeFor(pathname);
    if (target === "worker") {
      socket.destroy();
      return;
    }
    const upstream = httpRequest({
      headers: proxyHeaders(incoming.headers),
      hostname: "127.0.0.1",
      method: incoming.method,
      path: incoming.url,
      port: developmentPorts[target],
    });
    upstream.once("error", () => socket.destroy());
    upstream.once("upgrade", (answer, upstreamSocket, upstreamHead) => {
      const lines = [`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}`];
      for (let index = 0; index < answer.rawHeaders.length; index += 2)
        lines.push(`${answer.rawHeaders[index]}: ${answer.rawHeaders[index + 1]}`);
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length > 0) socket.write(upstreamHead);
      if (head.length > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
      socket.once("error", () => upstreamSocket.destroy());
      upstreamSocket.once("error", () => socket.destroy());
    });
    upstream.end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(developmentPorts.gateway, "127.0.0.1", () => resolve(server));
  });
}

async function waitForReady(children) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (children.some((child) => child.exitCode !== null))
      throw new Error("A development process exited during startup.");
    try {
      const response = await fetch(`${developmentOrigin}/health/ready`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The local Worker did not become ready within 120 seconds.");
}

async function dev(argv) {
  const options = parseDevArguments(argv);
  if (run("pnpm", ["turbo", "run", "build", "--filter=@lacecms/app-api..."]) !== 0)
    throw new Error("Building the Worker's workspace packages failed.");
  await ensureDevelopmentVariables();
  await writeFile(
    developmentConfig,
    `${JSON.stringify(developmentWranglerConfig(await readWranglerConfig(), options), null, 2)}\n`,
    "utf8",
  );
  if (applyLocalMigrations(developmentState) !== 0)
    throw new Error("Applying local D1 migrations failed.");
  if (run(process.execPath, [localHelper, "prepare", "--persist-to", developmentState]) !== 0)
    throw new Error("Local configuration synchronization failed.");

  const children = [];
  const start = (command, args, extra = {}) => {
    const child = spawn(command, args, { stdio: "inherit", ...extra });
    children.push(child);
    return child;
  };
  start(
    wrangler,
    [
      "dev",
      "--config",
      developmentConfig,
      "--persist-to",
      developmentState,
      "--env-file",
      developmentVariables,
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(developmentPorts.worker),
      "--local-upstream",
      `127.0.0.1:${developmentPorts.gateway}`,
      "--test-scheduled",
      "--show-interactive-dev-session=false",
    ],
    { cwd: apiDirectory, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  start(
    join(root, "apps", "admin", "node_modules", ".bin", "vite"),
    ["--host", "127.0.0.1", "--port", String(developmentPorts.admin), "--strictPort"],
    { cwd: join(root, "apps", "admin") },
  );
  start(
    join(root, "apps", "site", "node_modules", ".bin", "astro"),
    ["dev", "--host", "127.0.0.1", "--port", String(developmentPorts.site)],
    {
      cwd: join(root, "apps", "site"),
      env: {
        ...process.env,
        // Keeps Astro in this foreground process instead of self-daemonizing under agents.
        ASTRO_DEV_BACKGROUND: "1",
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_API_BASE_URL: developmentOrigin,
        LACE_PUBLIC_BASE_URL: `${developmentOrigin}/`,
        LACE_SITE_DATA_MODE: process.env.LACE_SITE_DATA_MODE ?? "fixture",
      },
    },
  );

  let gateway;
  let stopping = false;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    gateway?.close();
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
    process.exitCode = code;
  };
  process.once("SIGINT", () => stop(130));
  process.once("SIGTERM", () => stop(143));
  for (const child of children)
    child.once("exit", (code) => {
      if (!stopping) {
        console.error("A development process exited; stopping the Cloudflare stack.");
        stop(code === 0 ? 1 : (code ?? 1));
      }
    });
  try {
    gateway = await startGateway();
    await waitForReady(children);
  } catch (error) {
    stop(1);
    throw error;
  }
  console.info(
    `Lace Cloudflare development ready at ${developmentOrigin}/ (admin at ${developmentOrigin}/admin/). Local state: dev-data/cloudflare/.`,
  );
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === "migrate") {
    process.exitCode = await migrate(argv, { readConfig: readWranglerConfig, run });
    return;
  }
  if (command === "dev") {
    await dev(argv);
    return;
  }
  throw new UsageError("Usage: node scripts/cloudflare.mjs <dev|migrate> [options]");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Cloudflare command failed.");
  process.exitCode = 1;
});
