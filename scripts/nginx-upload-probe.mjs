import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const workspace = resolve(import.meta.dirname, "..");
const image = "nginx:1.27.5-alpine";
const MiB = 1024 * 1024;

const ASSET_CACHE = "public, max-age=2592000, immutable";

/**
 * Real-image check that the VPS proxy forwards media uploads, keeps JSON bodies
 * at 1 MiB, caches hashed site assets for 30 days and keeps pages revalidating.
 */
export async function nginxUploadProbe(configPath = join(workspace, "deploy/nginx.conf")) {
  const received = [];
  const upstream = createServer((incoming, response) => {
    let bytes = 0;
    incoming.on("data", (chunk) => (bytes += chunk.length));
    incoming.on("end", () => {
      received.push({ path: incoming.url, bytes });
      response.writeHead(201, { "content-type": "application/json" }).end("{}");
    });
  });
  // Host-gateway reaches the host's bridge address, not its loopback, on Linux.
  await new Promise((done) => upstream.listen(0, "0.0.0.0", done));
  const upstreamPort = upstream.address().port;

  const directory = await mkdtemp(join(tmpdir(), "lace-nginx-probe-"));
  const container = `lace-nginx-probe-${randomUUID().slice(0, 8)}`;
  try {
    const config = (await readFile(configPath, "utf8")).replaceAll(
      "http://api:3000",
      `http://api:${upstreamPort}`,
    );
    await writeFile(join(directory, "default.conf"), config);
    const release = join(directory, "release");
    await mkdir(join(release, "_astro"), { recursive: true });
    await writeFile(join(release, "index.html"), "<!doctype html><title>probe</title>");
    await writeFile(join(release, "_astro", "app.abc123.js"), "export {};");
    await writeFile(join(release, "_headers"), "/_astro/*\n  Cache-Control: no-store\n");
    await execute("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      container,
      "--add-host",
      "api:host-gateway",
      "--publish",
      "127.0.0.1::8080",
      "--volume",
      `${join(directory, "default.conf")}:/etc/nginx/conf.d/default.conf:ro`,
      "--volume",
      `${release}:/output/current:ro`,
      image,
    ]);
    const { stdout } = await execute("docker", ["port", container, "8080/tcp"]);
    const proxyPort = Number(stdout.trim().split("\n")[0].split(":").pop());
    await ready(proxyPort);

    const cases = [
      {
        name: "8 MiB media upload",
        path: "/api/v1/admin/media",
        type: "application/octet-stream",
        size: 8 * MiB,
        status: 201,
        upstreamBytes: 8 * MiB,
      },
      {
        name: "12 MiB media upload",
        path: "/api/v1/admin/media",
        type: "application/octet-stream",
        size: 12 * MiB,
        status: 413,
        upstreamBytes: 0,
      },
      {
        name: "2 MiB JSON entry save",
        path: "/api/v1/admin/models/posts/entries",
        type: "application/json",
        size: 2 * MiB,
        status: 413,
        upstreamBytes: 0,
      },
    ];
    const results = [];
    for (const probe of cases) {
      received.length = 0;
      const status = await send(proxyPort, probe);
      const upstreamBytes = received.reduce((sum, item) => sum + item.bytes, 0);
      const passed = status === probe.status && upstreamBytes === probe.upstreamBytes;
      results.push({ name: probe.name, status, upstreamBytes, passed });
      console.log(
        `${passed ? "ok  " : "FAIL"} ${probe.name}: ${status} (expected ${probe.status}), ` +
          `${upstreamBytes} bytes upstream (expected ${probe.upstreamBytes})`,
      );
    }

    const reads = [
      { name: "hashed asset", path: "/_astro/app.abc123.js", status: 200, cache: ASSET_CACHE },
      { name: "missing hashed asset", path: "/_astro/missing.def456.js", status: 404, cache: null },
      { name: "page", path: "/", status: 200, cache: "no-cache" },
      { name: "Pages header rules", path: "/_headers", status: 404, cache: null },
    ];
    for (const probe of reads) {
      const response = await fetch(`http://127.0.0.1:${proxyPort}${probe.path}`);
      await response.arrayBuffer();
      const cache = response.headers.get("cache-control");
      const passed = response.status === probe.status && cache === probe.cache;
      results.push({ name: probe.name, status: response.status, cache, passed });
      console.log(
        `${passed ? "ok  " : "FAIL"} ${probe.name}: ${response.status} (expected ${probe.status}), ` +
          `cache-control ${cache} (expected ${probe.cache})`,
      );
    }
    return results;
  } finally {
    await execute("docker", ["rm", "--force", container]).catch(() => {});
    await new Promise((done) => upstream.close(done));
    await rm(directory, { recursive: true, force: true });
  }
}

async function ready(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      await response.arrayBuffer();
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  throw new Error("nginx did not start");
}

/** Sends a sized body and returns the status, even when nginx answers 413 before reading it. */
function send(port, { path, type, size }) {
  return new Promise((done, fail) => {
    let status;
    const outgoing = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "content-type": type, "content-length": size },
      },
      (response) => {
        status = response.statusCode;
        response.resume();
        response.on("end", () => done(status));
      },
    );
    outgoing.on("error", (error) => (status ? done(status) : fail(error)));
    outgoing.end(Buffer.alloc(size, type === "application/json" ? 0x20 : 0x61));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await nginxUploadProbe(process.argv[2] && resolve(process.argv[2]));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}
