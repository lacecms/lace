import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const composeFile = join(root, "docker-compose.dev.yml");
const localEnvironment = join(root, ".env");
const localProject = "lace-dev";
const acceptanceDirectory = join(root, ".lace-acceptance");
const acceptanceEnvironment = join(acceptanceDirectory, ".env");
const acceptanceState = join(acceptanceDirectory, "state.json");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result.status ?? 1;
}

function compose(project, environment, args) {
  return [
    "compose",
    "--project-name",
    project,
    "--env-file",
    environment,
    "--file",
    composeFile,
    ...args,
  ];
}

async function requireLocalEnvironment() {
  try {
    await access(localEnvironment);
  } catch {
    throw new Error("Missing .env. Run `pnpm dev:env` to create a local development environment.");
  }
}

function secret() {
  return randomBytes(32).toString("base64url");
}

async function createEnvironment(
  destination,
  apiPort,
  volumePrefix = localProject,
  mailpitPort = 8025,
) {
  const minioAccessKey = `lace-${randomBytes(8).toString("hex")}`;
  const minioSecretKey = secret();
  const values = {
    LACE_ADMIN_DEV_ORIGIN: "http://admin:5173",
    LACE_API_PORT: String(apiPort),
    LACE_AUTH_SECRET: secret(),
    LACE_DATABASE_DIRECTORY: "/workspace/dev-data",
    LACE_DATABASE_PATH: "/workspace/dev-data/lace.sqlite",
    LACE_DATA_VOLUME_PREFIX: volumePrefix,
    LACE_EMAIL_FROM: "Lace Dev <lace@localhost.test>",
    LACE_EMAIL_PROVIDER: "smtp",
    LACE_MAILPIT_PORT: String(mailpitPort),
    LACE_MINIO_ACCESS_KEY: minioAccessKey,
    LACE_MINIO_BUCKET: "lace-media",
    LACE_MINIO_ENDPOINT: "http://minio:9000",
    LACE_MINIO_REGION: "us-east-1",
    LACE_MINIO_ROOT_ACCESS_KEY: minioAccessKey,
    LACE_MINIO_ROOT_SECRET: minioSecretKey,
    LACE_MINIO_SECRET_KEY: minioSecretKey,
    LACE_MINIO_TIMEOUT_MS: "5000",
    LACE_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/`,
    LACE_SITE_DATA_MODE: "fixture",
    LACE_BUILD_TOKEN: "",
    LACE_SITE_DEV_ORIGIN: "http://site:4321",
    LACE_SMTP_HOST: "mailpit",
    LACE_SMTP_PORT: "1025",
    LACE_SMTP_SECURITY: "none",
  };
  await writeFile(
    destination,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Could not reserve a smoke-test port.");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function fetchOk(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
}

async function smoke() {
  const directory = await mkdtemp(join(tmpdir(), "lace-smoke-"));
  const environment = join(directory, ".env");
  const project = `lace-smoke-${randomBytes(5).toString("hex")}`;
  const port = await freePort();
  let cleanup;
  const cleanUp = async () => {
    cleanup ??= (async () => {
      run("docker", compose(project, environment, ["down", "--volumes", "--remove-orphans"]));
      await rm(directory, { force: true, recursive: true });
    })();
    await cleanup;
  };
  const interrupt = (exitCode) => {
    void cleanUp().finally(() => process.exit(exitCode));
  };
  const onInterrupt = () => interrupt(130);
  const onTerminate = () => interrupt(143);
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  try {
    await createEnvironment(environment, port, project, await freePort());
    if (
      run(
        "docker",
        compose(project, environment, ["up", "--build", "--wait", "--wait-timeout", "180"]),
      ) !== 0
    )
      throw new Error("The isolated Lace smoke stack did not become healthy.");
    const origin = `http://127.0.0.1:${port}`;
    await fetchOk(`${origin}/health/ready`);
    await fetchOk(`${origin}/admin/`);
    await fetchOk(`${origin}/`);
    const bootstrap = spawnSync(
      "docker",
      compose(project, environment, [
        "exec",
        "-T",
        "api",
        "node",
        "apps/api/src/dev-bootstrap.mjs",
      ]),
      { cwd: root, encoding: "utf8" },
    );
    if (bootstrap.status !== 0)
      throw new Error("The isolated first-admin bootstrap command failed.");
    if (
      run(
        "docker",
        compose(project, environment, [
          "exec",
          "-T",
          "minio",
          "sh",
          "-ec",
          "curl --fail http://127.0.0.1:9000/minio/health/live",
        ]),
      ) !== 0
    )
      throw new Error("The private MinIO health endpoint is unavailable.");
    console.info("Lace development smoke check passed.");
  } catch (error) {
    run("docker", compose(project, environment, ["logs", "--no-color"]));
    throw error;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    await cleanUp();
  }
}

async function readAcceptanceState() {
  let state;
  try {
    state = JSON.parse(await readFile(acceptanceState, "utf8"));
  } catch {
    throw new Error("No acceptance stack exists. Run `pnpm acceptance:start` first.");
  }
  if (
    typeof state.project !== "string" ||
    !/^lace-acceptance-[a-f0-9]{10}$/.test(state.project) ||
    !Number.isInteger(state.port)
  )
    throw new Error("Acceptance state is invalid; refusing to operate on an unknown stack.");
  return state;
}

async function acceptance(command) {
  if (command === "acceptance:start") {
    try {
      await access(acceptanceDirectory);
      throw new Error("Acceptance stack already exists. Run `pnpm acceptance:stop` first.");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const project = `lace-acceptance-${randomBytes(5).toString("hex")}`;
    const port = await freePort();
    await mkdir(acceptanceDirectory, { mode: 0o700 });
    await createEnvironment(acceptanceEnvironment, port, project, await freePort());
    await writeFile(acceptanceState, JSON.stringify({ project, port }), { mode: 0o600 });
    if (
      run(
        "docker",
        compose(project, acceptanceEnvironment, [
          "up",
          "--build",
          "--wait",
          "--wait-timeout",
          "180",
        ]),
      ) !== 0
    )
      throw new Error("Acceptance stack did not become healthy; inspect it before stopping.");
    if (
      run(
        "docker",
        compose(project, acceptanceEnvironment, [
          "exec",
          "-T",
          "api",
          "node",
          "apps/api/dist/content-sync-cli.js",
        ]),
      ) !== 0
    )
      throw new Error("Acceptance content synchronization failed; inspect it before stopping.");
    const origin = `http://127.0.0.1:${port}`;
    await fetchOk(`${origin}/health/ready`);
    await fetchOk(`${origin}/admin/`);
    await fetchOk(`${origin}/`);
    console.info(`Acceptance stack ready at ${origin}. Run pnpm acceptance:bootstrap next.`);
    return;
  }
  const { project, port } = await readAcceptanceState();
  if (command === "acceptance:stop") {
    if (
      run(
        "docker",
        compose(project, acceptanceEnvironment, ["down", "--volumes", "--remove-orphans"]),
      ) === 0
    ) {
      await rm(acceptanceDirectory, { recursive: true, force: true });
      console.info("Removed only the named acceptance stack and its data.");
    }
    return;
  }
  if (command === "acceptance:bootstrap") {
    run(
      "docker",
      compose(project, acceptanceEnvironment, [
        "exec",
        "-T",
        "api",
        "node",
        "apps/api/src/dev-bootstrap.mjs",
      ]),
    );
    return;
  }
  if (command === "acceptance:restart-site") {
    if (
      run(
        "docker",
        compose(project, acceptanceEnvironment, [
          "up",
          "--detach",
          "--force-recreate",
          "--wait",
          "site",
        ]),
      ) === 0
    )
      console.info(`Acceptance site refreshed at http://127.0.0.1:${port}/`);
    return;
  }
  throw new Error(`Unknown acceptance command: ${command}.`);
}

async function main() {
  const command = process.argv[2];
  if (command === "env") {
    try {
      await access(localEnvironment);
      throw new Error(".env already exists; refusing to replace local credentials.");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await createEnvironment(localEnvironment, 3000);
    console.info("Created .env with new local-only credentials. Keep this ignored file private.");
    return;
  }
  if (command === "smoke") {
    await smoke();
    return;
  }
  if (command?.startsWith("acceptance:")) {
    await acceptance(command);
    return;
  }
  const syncArgs = command === "sync" ? process.argv.slice(3) : [];
  if (syncArgs.length > 1 || (syncArgs.length === 1 && syncArgs[0] !== "--check")) {
    throw new Error("Usage: pnpm content:sync [--check]");
  }
  await requireLocalEnvironment();
  if (command === "start") {
    run(
      "docker",
      compose(localProject, localEnvironment, ["up", "--build", "--wait", "--wait-timeout", "180"]),
    );
    return;
  }
  if (command === "stop") {
    run("docker", compose(localProject, localEnvironment, ["stop"]));
    return;
  }
  if (command === "logs") {
    run("docker", compose(localProject, localEnvironment, ["logs", "--follow"]));
    return;
  }
  if (command === "bootstrap") {
    run(
      "docker",
      compose(localProject, localEnvironment, [
        "exec",
        "-T",
        "api",
        "node",
        "apps/api/src/dev-bootstrap.mjs",
      ]),
    );
    return;
  }
  if (command === "sync") {
    run(
      "docker",
      compose(localProject, localEnvironment, [
        "exec",
        "-T",
        "api",
        "node",
        "apps/api/dist/content-sync-cli.js",
        ...syncArgs,
      ]),
    );
    return;
  }
  if (command === "reset") {
    if (process.argv[3] !== "--confirm") {
      throw new Error(
        "Reset is destructive. Run `pnpm dev:reset -- --confirm` to delete only Lace development SQLite and MinIO data.",
      );
    }
    console.warn("Deleting Lace development SQLite and MinIO data. This cannot be recovered.");
    run(
      "docker",
      compose(localProject, localEnvironment, ["down", "--volumes", "--remove-orphans"]),
    );
    return;
  }
  throw new Error(
    `Unknown local development command: ${String(command ?? basename(process.argv[1]))}.`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local development command failed.");
  process.exitCode = 1;
});
