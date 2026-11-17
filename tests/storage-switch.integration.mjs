// Opt-in: an isolated generated Compose deployment and MinIO-to-SILO volume drill.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { generateProject } from "../packages/create-lace/dist/index.js";

const execute = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const secret = () => randomBytes(24).toString("hex");
const legacyVersion = "RELEASE.2025-02-07T23-21-09Z";
const legacyCommit = "703f51164d3d0c44af41b0d86075a1f61e4779e7";
const {
  LACE_VERIFY_LEGACY_MINIO_IMAGE: legacy,
  LACE_VERIFY_API_IMAGE: apiImage,
  LACE_VERIFY_BUILDER_IMAGE: builderImage,
} = process.env;
assert.ok(
  legacy && apiImage && builderImage,
  "Set LACE_VERIFY_LEGACY_MINIO_IMAGE, LACE_VERIFY_API_IMAGE and LACE_VERIFY_BUILDER_IMAGE",
);
const requireNode = createRequire(
  new URL("../packages/platform-node/package.json", import.meta.url),
);
const sharp = requireNode("sharp");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const project = `lace-storage-switch-${randomBytes(6).toString("hex")}`;
const directory = await realpath(await mkdtemp(join(tmpdir(), "lace-storage-switch-")));
const consumer = join(directory, "cms");
const data = join(consumer, ".lace/data");
const mediaVolume = `${project}_minio-data`;
const backupVolume = `${project}_backup`;
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !/^(?:LACE|COMPOSE)_/u.test(name)),
);
const settings = {
  LACE_API_IMAGE: apiImage,
  LACE_BUILDER_IMAGE: builderImage,
  LACE_HTTP_PORT: String(port),
  LACE_PUBLIC_BASE_URL: origin + "/",
  LACE_AUTH_SECRET: secret(),
  LACE_MINIO_ROOT_ACCESS_KEY: secret(),
  LACE_MINIO_ROOT_SECRET: secret(),
};
const dotenv = join(consumer, ".env");
const selectImage = (image) =>
  writeFile(
    dotenv,
    Object.entries({ ...settings, LACE_MINIO_IMAGE: image })
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
    { mode: 0o600 },
  );

const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
let cleaning = false;
const docker = (args) =>
  execute("docker", args, {
    env,
    timeout: 180_000,
    ...(cleaning ? {} : { signal: controller.signal }),
  });
const compose = (...args) =>
  docker([
    "compose",
    "-p",
    project,
    "--env-file",
    dotenv,
    "-f",
    join(consumer, "docker-compose.yml"),
    ...args,
  ]);
const start = () => compose("up", "-d", "--wait", "--wait-timeout", "90", "web");
const verifyVolume = async () => {
  const { stdout: id } = await compose("ps", "--quiet", "minio");
  const { stdout } = await docker(["inspect", "--format", "{{json .Mounts}}", id.trim()]);
  const mount = JSON.parse(stdout).find(({ Destination }) => Destination === "/data");
  assert.equal(
    mount?.Name,
    mediaVolume,
    "Storage switched away from the fixture's original volume",
  );
};
const copyState = (restore) =>
  docker([
    "run",
    "--rm",
    "--pull",
    "never",
    "--network",
    "none",
    "--user",
    "0:0",
    "--mount",
    `type=volume,source=${mediaVolume},target=/data${restore ? "" : ",readonly"}`,
    "--mount",
    `type=bind,source=${data},target=/database${restore ? "" : ",readonly"}`,
    "--mount",
    `type=volume,source=${backupVolume},target=/backup${restore ? ",readonly" : ""}`,
    "--entrypoint",
    "/bin/sh",
    apiImage,
    "-ec",
    [
      "set -e",
      "copy_state() {",
      restore
        ? 'test -s "$2" && find "$1" -mindepth 1 -delete && tar -xpf "$2" -C "$1"'
        : 'tar -cpf "$2" -C "$1" . && test -s "$2"',
      "}",
      "copy_state /data /backup/media.tar",
      "copy_state /database /backup/sqlite.tar",
    ].join("\n"),
  ]);

let cookie = "";
async function call(path, { method = "GET", body, authenticated = true, expected = 200 } = {}) {
  const json = body !== undefined && !(body instanceof FormData);
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(method !== "GET" ? { origin } : {}),
      ...(json ? { "content-type": "application/json" } : {}),
      ...(authenticated ? { cookie } : {}),
    },
    body: json ? JSON.stringify(body) : body,
    signal: AbortSignal.any([AbortSignal.timeout(15_000), controller.signal]),
  });
  assert.equal(response.status, expected, `${method} ${path}`);
  return response;
}

const identity = { email: "storage-switch@lace.test", password: secret() };
async function login() {
  const response = await call("/api/auth/sign-in/email", {
    method: "POST",
    body: identity,
    authenticated: false,
  });
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie);
}

async function objectKey(id) {
  const { stdout } = await compose(
    "exec",
    "-T",
    "api",
    "node",
    "--input-type=module",
    "-e",
    "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(process.env.LACE_DATABASE_PATH, { readOnly: true }); console.log(db.prepare('select storage_key from media where id = ?').get(process.argv[1])?.storage_key ?? ''); db.close();",
    id,
  );
  return stdout.trim();
}

async function upload(name, color) {
  const image = await sharp({
    create: { width: 1, height: 1, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  const body = new FormData();
  body.append("file", new Blob([image], { type: "image/png" }), `${name}.png`);
  const response = await call("/api/v1/admin/media", { method: "POST", body, expected: 201 });
  const { id } = await response.json();
  const key = await objectKey(id);
  assert.ok(key, "The uploaded media has no persisted key");
  return { id, key, sha256: sha256(image) };
}

async function verifyMedia(entry) {
  const response = await call(`/api/v1/admin/media/${entry.id}/preview`);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), entry.sha256);
  assert.equal(await objectKey(entry.id), entry.key);
}

let configured = false;
let saved = false;
try {
  const { stdout: version } = await docker(["run", "--rm", "--pull", "never", legacy, "--version"]);
  assert.ok(
    (version.includes(legacyVersion) ||
      version.includes(legacyVersion.replace("RELEASE.", "DEVELOPMENT."))) &&
      version.includes(`commit-id=${legacyCommit}`),
    "Wrong legacy MinIO build",
  );
  await generateProject({ target: consumer, site: { mode: "none" } });
  await selectImage(legacy);
  configured = true;
  await start();
  await verifyVolume();
  const { stdout: bootstrap } = await compose(
    "exec",
    "-T",
    "api",
    "node",
    "apps/api/src/dev-bootstrap.mjs",
  );
  await call("/api/v1/setup/admin", {
    method: "POST",
    body: { ...identity, token: bootstrap.trim().split("\n").at(-1) },
    authenticated: false,
    expected: 201,
  });
  await login();
  const original = await upload("legacy", "#123456");
  await verifyMedia(original);

  await compose("stop");
  await docker(["volume", "create", backupVolume]);
  saved = true;
  await copyState(false);

  await selectImage("");
  const { stdout: silo } = await compose("config", "--images", "minio");
  assert.match(silo.trim(), /^docker\.io\/pgsty\/silo:.*@sha256:[a-f0-9]{64}$/u);
  await start();
  await verifyVolume();
  await verifyMedia(original);
  const replacement = await upload("silo", "#fedcba");
  await verifyMedia(replacement);
  await compose("restart", "minio");
  await start();
  await verifyVolume();
  await verifyMedia(original);
  await verifyMedia(replacement);

  await compose("stop");
  const unavailable = `registry.invalid/${project}:unavailable`;
  await selectImage(unavailable);
  await assert.rejects(
    compose("up", "-d", "--pull", "never", "--wait", "--wait-timeout", "20", "web"),
    (error) =>
      error.stderr?.includes(unavailable) && /no such image|not found/iu.test(error.stderr),
  );
  assert.equal((await compose("ps", "--quiet", "api")).stdout.trim(), "");

  // The failed startup must leave both records and objects available to the selected server.
  await selectImage("");
  await start();
  await verifyVolume();
  await verifyMedia(original);
  await verifyMedia(replacement);

  // Recover the coordinated pre-switch state. The disposable SILO write must go away.
  await compose("down");
  await copyState(true);
  await selectImage(legacy);
  await start();
  await verifyVolume();
  await login();
  await verifyMedia(original);
  await call(`/api/v1/admin/media/${replacement.id}/preview`, { expected: 404 });
  console.log(
    JSON.stringify(
      {
        legacy: legacyVersion,
        image: silo.trim(),
        volume: mediaVolume,
        original,
        replacement,
        restarted: true,
        unavailableImagePreservedData: true,
        recovered: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (configured && !controller.signal.aborted) {
    const logs = await compose("logs", "--no-color", "--tail", "20", "api", "minio-init", "migrate")
      .then(({ stdout }) => stdout)
      .catch(() => "");
    const redacted = [
      settings.LACE_AUTH_SECRET,
      settings.LACE_MINIO_ROOT_ACCESS_KEY,
      settings.LACE_MINIO_ROOT_SECRET,
      identity.password,
    ].reduce((value, secretValue) => value.replaceAll(secretValue, "[redacted]"), logs);
    if (redacted) console.error(redacted);
  }
  throw error;
} finally {
  cleaning = true;
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  try {
    if (configured) await compose("down", "--volumes", "--remove-orphans");
  } finally {
    try {
      if (saved) await docker(["volume", "rm", backupVolume]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
