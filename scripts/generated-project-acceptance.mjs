import { buildSiteJourney } from "./build-site-acceptance.mjs";
import { publicationVisibilityJourney } from "./publication-visibility-acceptance.mjs";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  assertSecretFree,
  assertImageFileList,
  checkImageIdentity,
  loadConsumerArtifacts,
  scanFile,
  scanTree,
} from "./consumer-security.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const timeoutMs = 5 * 60_000;
const secretValues = new Set();
const temporaryPaths = [];
let composeProject;
let composeCwd;
const capturedDiagnostics = [];
if (process.env.LACE_ACCEPTANCE_SECRET_SENTINEL) {
  secretValues.add(process.env.LACE_ACCEPTANCE_SECRET_SENTINEL);
}

function sanitize(value) {
  let result = String(value);
  for (const secret of secretValues) {
    if (secret.length > 0) result = result.replaceAll(secret, "[REDACTED]");
  }
  return result;
}

async function run(stage, command, args, options = {}) {
  console.info(`Acceptance: ${stage}`);
  if (process.env.LACE_ACCEPTANCE_FAIL_STAGE === stage) {
    throw new Error(`${stage}: injected failure`);
  }
  const child = spawn(command, args, {
    cwd: options.cwd ?? workspace,
    detached: true,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errorOutput = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (errorOutput += chunk));
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, options.timeoutMs ?? timeoutMs);
  const outcome = await new Promise((done) => {
    child.once("error", (error) => done({ error }));
    child.once("exit", (code, signal) => done({ code, signal }));
  });
  clearTimeout(timer);
  if (outcome.error || outcome.code !== 0) {
    throw new Error(
      `${stage}: ${command} failed (${outcome.error?.message ?? outcome.signal ?? outcome.code})\n${sanitize(errorOutput || output).slice(-4000)}`,
    );
  }
  if (!options.intentionalReveal) capturedDiagnostics.push(output, errorOutput);
  return output;
}

async function packageMetadata(directory) {
  return JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
}

async function generatedFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await generatedFiles(root, path)));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`snapshot: unsupported generated entry ${path}`);
  }
  return files.sort();
}

async function captureSnapshot(project) {
  const tree = await generatedFiles(project);
  const manifestText = await readFile(join(project, ".lace/manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  const classified = Object.keys(manifest.files).sort();
  if (
    JSON.stringify(
      tree.filter(
        (path) => ![".lace/manifest.json", ".lace/upgrade-instructions.json"].includes(path),
      ),
    ) !== JSON.stringify(classified)
  ) {
    throw new Error("snapshot: unclassified generated files");
  }
  const digests = {};
  const instructions = JSON.parse(
    await readFile(join(project, ".lace/upgrade-instructions.json"), "utf8"),
  );
  if (instructions.templateVersion !== manifest.templateVersion || instructions.schemaVersion !== 1)
    throw new Error("snapshot: invalid upgrade instruction metadata");
  digests[".lace/upgrade-instructions.json"] = createHash("sha256")
    .update(await readFile(join(project, ".lace/upgrade-instructions.json")))
    .digest("hex");
  for (const path of classified) {
    const bytes = await readFile(join(project, path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    digests[path] = digest;
    if (manifest.files[path].owner === "managed" && manifest.files[path].sha256 !== digest) {
      throw new Error(`snapshot: managed hash mismatch for ${path}`);
    }
    if (manifest.files[path].owner === "user" && "sha256" in manifest.files[path]) {
      throw new Error(`snapshot: user-owned hash recorded for ${path}`);
    }
    if (/^(apps|packages|admin|engine)\//u.test(path)) {
      throw new Error(`snapshot: editable engine/admin source at ${path}`);
    }
    if (/LACE_(?:AUTH_SECRET|BUILD_TOKEN|MINIO_ROOT_SECRET)=\S/u.test(bytes.toString("utf8"))) {
      throw new Error(`snapshot: credential in ${path}`);
    }
  }
  return { tree, manifest: manifestText, digests };
}

async function verifySnapshots(parent, update = false) {
  for (const [variant, flag] of [
    ["default", false],
    ["cloudflare", true],
  ]) {
    const roots = [join(parent, `${variant}-a`), join(parent, `${variant}-b`)];
    for (const root of roots) {
      await mkdir(root, { recursive: true });
      await run(`snapshot-${variant}`, "node", [
        "packages/create-lace/dist/bin.js",
        "create",
        join(root, "acceptance-site"),
        ...(flag ? ["--cloudflare"] : []),
      ]);
    }
    const first = await captureSnapshot(join(roots[0], "acceptance-site"));
    const second = await captureSnapshot(join(roots[1], "acceptance-site"));
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(`snapshot: ${variant} generation is not byte-stable`);
    }
    if (flag && !first.tree.includes("wrangler.jsonc")) {
      throw new Error("snapshot: Cloudflare variant is incomplete");
    }
    if (!flag && first.tree.includes("wrangler.jsonc")) {
      throw new Error("snapshot: default variant includes Cloudflare files");
    }
    const path = join(workspace, "tests", "fixtures", "generated-project", `${variant}.json`);
    const actual = `${JSON.stringify(first, null, 2)}\n`;
    if (update) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, actual);
    } else if ((await readFile(path, "utf8")) !== actual) {
      throw new Error(
        `snapshot: ${variant} fixture differs; inspect generated tree before updating`,
      );
    }
  }
  console.info("Generated default and Cloudflare snapshots match two byte-stable regenerations");
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("port: no TCP address");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function prepareCompose(project, parent, releaseArtifacts) {
  composeCwd = project;
  composeProject = `lace23c${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const apiPort = await freePort();
  const httpPort = await freePort();
  const apiImage =
    releaseArtifacts?.images.api.imageId ??
    process.env.LACE_ACCEPTANCE_API_IMAGE ??
    `${composeProject}-api:local`;
  const builderImage =
    releaseArtifacts?.images.builder.imageId ??
    process.env.LACE_ACCEPTANCE_BUILDER_IMAGE ??
    `${composeProject}-builder:local`;
  if (!releaseArtifacts && !process.env.LACE_ACCEPTANCE_API_IMAGE) {
    await run("image-api", "docker", ["build", "-f", "apps/api/Dockerfile", "-t", apiImage, "."], {
      timeoutMs: 20 * 60_000,
    });
  }
  if (!releaseArtifacts && !process.env.LACE_ACCEPTANCE_BUILDER_IMAGE) {
    await run(
      "image-builder",
      "docker",
      ["build", "-f", "apps/builder/Dockerfile", "-t", builderImage, "."],
      { timeoutMs: 20 * 60_000 },
    );
  }
  const values = {
    LACE_API_IMAGE: apiImage,
    LACE_BUILDER_IMAGE: builderImage,
    LACE_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/`,
    LACE_API_BASE_URL: `http://127.0.0.1:${apiPort}/`,
    LACE_DATABASE_PATH: "./.lace/data/lace.sqlite",
    LACE_API_PORT: String(apiPort),
    LACE_HTTP_PORT: String(httpPort),
    LACE_AUTH_SECRET: randomBytes(32).toString("hex"),
    LACE_MINIO_ROOT_ACCESS_KEY: `lace${randomBytes(8).toString("hex")}`,
    LACE_MINIO_ROOT_SECRET: randomBytes(24).toString("hex"),
    LACE_BUILDER_SECRET: randomBytes(32).toString("hex"),
    LACE_BUILD_TOKEN: randomBytes(32).toString("hex"),
  };
  for (const key of [
    "LACE_AUTH_SECRET",
    "LACE_MINIO_ROOT_ACCESS_KEY",
    "LACE_MINIO_ROOT_SECRET",
    "LACE_BUILDER_SECRET",
    "LACE_BUILD_TOKEN",
  ]) {
    secretValues.add(values[key]);
  }
  await writeFile(
    join(project, ".env"),
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
  await compose("image-minio", ["build", "minio"], {
    timeoutMs: 30 * 60_000,
  });
  return { apiPort, httpPort, parent, project, values, releaseArtifacts };
}

async function compose(stage, args, options = {}) {
  if (!composeProject || !composeCwd) throw new Error("Compose is not prepared");
  return run(stage, "docker", ["compose", "--project-name", composeProject, ...args], {
    cwd: composeCwd,
    ...options,
  });
}

async function request(base, path, options = {}) {
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
  if (!response.ok) {
    throw new Error(`HTTP ${path}: status ${response.status}; ${sanitize(JSON.stringify(body))}`);
  }
  return { body, response };
}

async function nodeJourney(context) {
  const { project, apiPort } = context;
  const databasePath = join(project, ".lace", "data", "lace.sqlite");
  const env = { LACE_DATABASE_PATH: databasePath };
  const dataDirectory = join(project, ".lace", "data");
  try {
    await stat(dataDirectory);
    throw new Error("cli-db-migrate: database parent was created before fresh migration");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const command of [
    ["db", "migrate"],
    ["content", "sync"],
  ]) {
    const output = await run(`cli-${command.join("-")}`, "pnpm", [command.join(":"), "--json"], {
      cwd: project,
      env,
    });
    if (!JSON.parse(output).ok) throw new Error(`cli-${command.join("-")}: unsuccessful result`);
    if (command[0] === "db" && !(await stat(dataDirectory)).isDirectory())
      throw new Error("cli-db-migrate: migration did not create the database parent");
  }
  const bootstrap = JSON.parse(
    await run("cli-bootstrap", "pnpm", ["auth:bootstrap", "--json"], {
      cwd: project,
      env,
      intentionalReveal: true,
    }),
  );
  const token = bootstrap.data?.token;
  if (!bootstrap.ok || typeof token !== "string") throw new Error("cli-bootstrap: missing token");
  secretValues.add(token);
  await compose("compose-config", ["config", "--quiet"]);
  await compose("compose-api", ["up", "--detach", "--wait", "api"], { timeoutMs: 10 * 60_000 });
  const base = `http://127.0.0.1:${apiPort}/`;
  const ready = await request(base, "/health/ready");
  if (ready.body?.status !== "ready") throw new Error("api: readiness payload mismatch");
  const email = "acceptance@lace.test";
  const password = randomBytes(24).toString("hex");
  secretValues.add(password);
  await request(base, "/api/v1/setup/admin", {
    method: "POST",
    json: { email, password, token },
  });
  const login = await request(base, "/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin: base.slice(0, -1) },
    json: { email, password },
  });
  const cookie = login.response.headers.getSetCookie()[0]?.split(";")[0];
  if (!cookie) throw new Error("login: no session cookie");
  secretValues.add(cookie);
  const models = await request(base, "/api/v1/admin/content-models", {
    headers: { cookie },
  });
  const modelNames = models.body?.items?.map((item) => item.key);
  if (JSON.stringify(modelNames) !== JSON.stringify(["home", "posts"])) {
    throw new Error(`api: generated config mismatch: ${JSON.stringify(modelNames)}`);
  }
  const homeEntries = await request(base, "/api/v1/admin/models/home/entries", {
    headers: { cookie },
  });
  const homeId = homeEntries.body?.items?.[0]?.id;
  if (typeof homeId !== "string") throw new Error("home: synchronized draft missing");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5mcAAAAASUVORK5CYII=",
    "base64",
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "onboarding.png");
  const uploaded = await request(base, "/api/v1/admin/media", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  const mediaId = uploaded.body?.id;
  if (typeof mediaId !== "string") throw new Error("media: uploaded ID missing");
  const richText = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Published rich text" }] }],
  };
  const blocks = [
    { type: "hero", data: { heading: "Published hero", image: mediaId } },
    { type: "richText", data: { content: richText } },
    {
      type: "image",
      data: { media: mediaId, alt: "Onboarding image", caption: "Published caption" },
    },
    { type: "quote", data: { quote: "Published quote", attribution: "Lace" } },
    {
      type: "cta",
      data: { heading: "Published call to action", actionLabel: "Home", actionUrl: "/" },
    },
  ].map((block, index) => ({
    ...block,
    key: `01J${String(index).padStart(23, "0")}`,
    schemaVersion: 1,
    position: (index + 1) * 1024,
  }));
  await request(base, `/api/v1/admin/entries/${homeId}/publish`, {
    method: "POST",
    headers: { cookie },
    json: { expectedRevision: 1 },
  });
  const created = await request(base, "/api/v1/admin/models/posts/entries", {
    method: "POST",
    headers: { cookie },
    json: {
      blocks: [],
      fields: { summary: "Acceptance summary" },
      slug: "acceptance",
      title: "Draft title",
    },
  });
  const entryId = created.body?.id;
  if (typeof entryId !== "string") throw new Error("edit: entry ID missing");
  const saved = await request(base, `/api/v1/admin/entries/${entryId}/draft`, {
    method: "PUT",
    headers: { cookie },
    json: {
      blocks,
      expectedRevision: 1,
      fields: { summary: "Acceptance summary" },
      slug: "acceptance",
      title: "Published acceptance title",
    },
  });
  const revision = saved.body?.draft?.revision;
  if (revision !== 2) throw new Error("edit: unexpected revision");
  await request(base, `/api/v1/admin/entries/${entryId}/publish`, {
    method: "POST",
    headers: { cookie },
    json: { expectedRevision: revision },
  });
  const createdToken = await request(base, "/api/v1/admin/api-tokens", {
    method: "POST",
    headers: { cookie },
    json: { name: "acceptance-builder" },
  });
  const buildToken = createdToken.body?.token;
  if (typeof buildToken !== "string") throw new Error("build: token missing");
  secretValues.add(buildToken);
  context.values.LACE_BUILD_TOKEN = buildToken;
  await run("astro-build", "pnpm", ["build"], {
    cwd: project,
    env: {
      LACE_API_BASE_URL: base,
      LACE_PUBLIC_BASE_URL: base,
      LACE_BUILD_TOKEN: buildToken,
      ASTRO_TELEMETRY_DISABLED: "1",
    },
  });
  await run("astro-typecheck", "pnpm", ["typecheck"], { cwd: project });
  const html = await readFile(
    join(project, "site", "dist", "blog", "acceptance", "index.html"),
    "utf8",
  );
  if (!html.includes("Published acceptance title")) {
    throw new Error("astro-build: published content missing from generated site");
  }
  await verifyRenderedMedia(html, base, png);
  for (const type of ["hero", "richText", "image", "quote", "cta"]) {
    if (!html.includes(`data-lace-block="${type}"`))
      throw new Error(`astro-build: missing ${type}`);
  }
  if (html.includes(buildToken)) throw new Error("astro-build: exposed build token");
  console.info(
    "Generated Node journey: migrate, sync, bootstrap, login, edit, publish, Astro build passed",
  );
  return { base, cookie, png, entryId, mediaId, blocks, buildToken, token, password, email };
}

async function verifyRenderedMedia(html, base, bytes) {
  const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/gu)];
  if (images.length < 2) throw new Error("media: generated hero/image links missing");
  for (const [, url] of images) {
    if (!url.startsWith(`${base}api/v1/public/media/`))
      throw new Error("media: URL is not browser-facing");
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(bytes))
      throw new Error("media: browser URL did not return uploaded image");
  }
}

async function productionSmoke(context, session) {
  await writeFile(
    join(context.project, ".env"),
    `${Object.entries(context.values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
  await compose("compose-production", ["up", "--detach", "--wait"], {
    timeoutMs: 10 * 60_000,
  });
  const publicBase = `http://127.0.0.1:${context.httpPort}/`;
  const health = await request(publicBase, "/health/ready");
  if (health.body?.status !== "ready")
    throw new Error("compose-production: web proxy is not ready");
  const admin = await fetch(new URL("/admin/", publicBase), {
    signal: AbortSignal.timeout(20_000),
  });
  if (!admin.ok) {
    throw new Error(
      `compose-production: admin returned ${admin.status}: ${sanitize((await admin.text()).slice(0, 500))}`,
    );
  }
  let built = false;
  let lastBuildState = "no build recorded";
  for (let attempt = 0; attempt < 720; attempt += 1) {
    let html;
    try {
      const response = await fetch(new URL("/blog/acceptance/", publicBase), {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        html = await response.text();
      }
    } catch {
      /* Wait for the fixed-command builder to publish its release. */
    }
    if (html?.includes("Published acceptance title")) {
      await verifyRenderedMedia(html, session.base, session.png);
      built = true;
      break;
    }
    if (attempt % 30 === 0) {
      let failedState;
      try {
        const history = await request(session.base, "/api/v1/admin/site-builds", {
          headers: { cookie: session.cookie },
        });
        const latest = history.body?.items?.[0];
        if (latest) {
          const state = `${latest.status}${latest.error ? `: ${latest.error}` : ""}`;
          if (state !== lastBuildState) {
            lastBuildState = state;
            console.info(`Production build state: ${sanitize(state)}`);
          }
          if (latest.status === "failed") {
            failedState = state;
          }
        }
      } catch {
        /* A transient history read does not stop the release wait. */
      }
      if (failedState)
        throw new Error(`compose-production: builder failed (${sanitize(failedState)})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!built) {
    throw new Error(
      `compose-production: builder did not publish generated site (${lastBuildState})`,
    );
  }
  console.info("Generated Compose production services and web proxy passed");
}

async function cloudflareSmoke(context, tarballs) {
  const cloudProject = join(context.parent, "cloudflare-consumer", "acceptance-site");
  await mkdir(dirname(cloudProject), { recursive: true });
  await run("cloudflare-generate", "node", [
    "packages/create-lace/dist/bin.js",
    "create",
    cloudProject,
    "--cloudflare",
  ]);
  await installPackedConsumer(cloudProject, tarballs);
  await run("cloudflare-bundle", "pnpm", ["build"], {
    cwd: cloudProject,
    env: {
      ASTRO_TELEMETRY_DISABLED: "1",
      LACE_API_BASE_URL: `http://127.0.0.1:${context.apiPort}/`,
      LACE_PUBLIC_BASE_URL: `http://127.0.0.1:${context.apiPort}/`,
      LACE_BUILD_TOKEN: context.values.LACE_BUILD_TOKEN,
    },
  });
  const config = await readFile(join(cloudProject, "wrangler.jsonc"), "utf8");
  const workflow = await readFile(
    join(cloudProject, ".github", "workflows", "cloudflare.yml"),
    "utf8",
  );
  if (
    !config.includes('"pages_build_output_dir": "site/dist"') ||
    !workflow.includes("site/dist")
  ) {
    throw new Error("cloudflare-bundle: generated Pages paths differ");
  }
  const port = await freePort();
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "pages",
      "dev",
      "site/dist",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--show-interactive-dev-session",
      "false",
    ],
    {
      cwd: cloudProject,
      detached: true,
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  try {
    let served = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/blog/acceptance/`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok && (await response.text()).includes("Published acceptance title")) {
          served = true;
          break;
        }
      } catch {
        /* Wait for local Pages runtime. */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!served)
      throw new Error(`cloudflare-pages: local preview failed\n${sanitize(output).slice(-2500)}`);
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  await run(
    "cloudflare-worker-smoke",
    "pnpm",
    ["--dir", "apps/api", "exec", "vitest", "run", "src/worker-smoke.test.mjs"],
    { timeoutMs: 5 * 60_000 },
  );
  console.info("Generated Cloudflare Pages bundle and local Worker smoke passed");
}

async function packConsumerGraph(tarballDirectory) {
  const root = await packageMetadata(join(workspace, "packages/create-lace/templates"));
  const site = await packageMetadata(join(workspace, "packages/create-lace/templates/site"));
  const pending = Object.keys({ ...root.dependencies, ...site.dependencies }).filter((name) =>
    name.startsWith("@lacecms/"),
  );
  const packages = new Map();
  while (pending.length > 0) {
    const name = pending.pop();
    if (packages.has(name)) continue;
    const directory = join(workspace, "packages", name.slice("@lacecms/".length));
    const manifest = await packageMetadata(directory);
    if (manifest.name !== name) throw new Error(`pack: missing workspace package ${name}`);
    packages.set(name, directory);
    pending.push(
      ...Object.keys(manifest.dependencies ?? {}).filter((dependency) =>
        dependency.startsWith("@lacecms/"),
      ),
    );
  }
  const tarballs = new Map();
  for (const [name, directory] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const packed = JSON.parse(
      await run("pack", "pnpm", ["pack", "--pack-destination", tarballDirectory, "--json"], {
        cwd: directory,
      }),
    );
    const filename = packed.filename;
    if (!filename) throw new Error(`pack: no tarball reported for ${name}`);
    tarballs.set(name, filename);
  }
  return tarballs;
}

async function installPackedConsumer(project, tarballs) {
  const artifactDirectory = join(project, ".lace", "acceptance-packages");
  await mkdir(artifactDirectory, { recursive: true });
  const references = new Map();
  for (const [name, filename] of tarballs) {
    await copyFile(filename, join(artifactDirectory, basename(filename)));
    references.set(name, `file:.lace/acceptance-packages/${basename(filename)}`);
  }
  for (const directory of [project, join(project, "site")]) {
    const path = join(directory, "package.json");
    const packageJson = await packageMetadata(directory);
    for (const section of ["dependencies", "devDependencies"]) {
      for (const name of Object.keys(packageJson[section] ?? {})) {
        if (references.has(name)) {
          const reference = references.get(name);
          packageJson[section][name] =
            directory === project ? reference : reference.replace("file:", "file:../");
        }
      }
    }
    await writeFile(path, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  const workspaceFile = join(project, "pnpm-workspace.yaml");
  const workspaceYaml = await readFile(workspaceFile, "utf8");
  // A global file: override of a package the site importer also declares makes
  // pnpm's frozen check compare root- and site-relative paths, so those packages
  // are overridden only where another Lace package depends on them.
  const siteDirect = new Set(
    Object.keys((await packageMetadata(join(project, "site"))).dependencies ?? {}),
  );
  const scoped = [];
  for (const parent of references.keys()) {
    const manifest = await packageMetadata(
      join(workspace, "packages", parent.slice("@lacecms/".length)),
    );
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (siteDirect.has(dependency) && references.has(dependency))
        scoped.push([`${parent}>${dependency}`, references.get(dependency)]);
    }
  }
  const overrides = [
    ...[...references].filter(([name]) => !siteDirect.has(name)),
    ...scoped.sort(([left], [right]) => left.localeCompare(right)),
  ]
    .map(([name, file]) => `  '${name}': '${file}'`)
    .join("\n");
  await writeFile(workspaceFile, `${workspaceYaml}\noverrides:\n${overrides}\n`);
  await copyFile(join(workspace, "pnpm-lock.yaml"), join(project, "pnpm-lock.yaml"));
  await run("install", "pnpm", ["install", "--no-frozen-lockfile"], {
    cwd: project,
  });
  await run("frozen-install", "pnpm", ["install", "--frozen-lockfile", "--offline"], {
    cwd: project,
  });
  const lock = await readFile(join(project, "pnpm-lock.yaml"), "utf8");
  if (/workspace:|link:\.\.\//u.test(lock) || lock.includes(workspace)) {
    throw new Error("install: lockfile resolves to the Lace source workspace");
  }
  const projectReal = await realpath(project);
  for (const name of tarballs.keys()) {
    const installPath = join(project, "node_modules", ...name.split("/"));
    const resolved = await realpath(installPath).catch(() => undefined);
    if (resolved && !resolved.startsWith(`${projectReal}/`)) {
      throw new Error(`install: ${name} resolves outside generated project: ${resolved}`);
    }
  }
}

/** Builds the packed starter against a local export server, without Docker. */
async function starterJourney(project) {
  const exported = JSON.parse(
    await readFile(join(workspace, "apps/site/src/fixtures/published-export.json"), "utf8"),
  );
  exported.entries = exported.entries.slice(0, 2);
  const token = `lace_build_${randomBytes(16).toString("hex")}`;
  secretValues.add(token);
  let requests = 0;
  const server = createHttpServer((request, response) => {
    requests++;
    if (
      request.url !== "/api/v1/public/build-export" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "AUTHORIZATION_DENIED", message: "Denied" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: '"7"' });
    response.end(JSON.stringify(exported));
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  try {
    await run("starter-build", "pnpm", ["build"], {
      cwd: project,
      env: {
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_API_BASE_URL: `http://127.0.0.1:${server.address().port}/`,
        LACE_BUILD_TOKEN: token,
        LACE_PUBLIC_BASE_URL: "https://public.example/lace/",
      },
    });
  } finally {
    await new Promise((done) => server.close(done));
  }
  if (requests !== 1) throw new Error(`starter-build: expected one export read, saw ${requests}`);
  await run("starter-typecheck", "pnpm", ["typecheck"], { cwd: project });
  const html = [
    await readFile(join(project, "site/dist/index.html"), "utf8"),
    await readFile(join(project, "site/dist/blog/first-post/index.html"), "utf8"),
  ].join("\n");
  for (const type of ["hero", "richText", "image", "quote", "cta"]) {
    if (!html.includes(`data-lace-block="${type}"`))
      throw new Error(`starter-build: missing ${type}`);
  }
  if (!html.includes("https://public.example/lace/api/v1/public/media/post-media"))
    throw new Error("starter-build: public media origin missing");
  await scanTree(join(project, "site/dist"), secretValues, "starter static output");
  console.info("Packed starter installed, typechecked and built all five blocks");
}

async function environmentPreparation(project) {
  const diagnosticStart = capturedDiagnostics.length;
  const example = await readFile(join(project, ".env.example"), "utf8");
  const output = await run("env-prepare", "pnpm", ["env:prepare", "--json"], {
    cwd: project,
    env: { LACE_DATABASE_PATH: "", LACE_AUTH_SECRET: "ignored-process-credential" },
  });
  const resultLine = output.trim().split("\n").at(-1);
  const result = JSON.parse(resultLine);
  if (result.ok !== true || result.code !== "ENV_PREPARED")
    throw new Error("env-prepare: unexpected success response");
  const bytes = await readFile(join(project, ".env"), "utf8");
  const values = parseEnv(bytes);
  const credentials = [
    "LACE_AUTH_SECRET",
    "LACE_MINIO_ROOT_ACCESS_KEY",
    "LACE_MINIO_ROOT_SECRET",
    "LACE_BUILDER_SECRET",
  ];
  for (const name of credentials) {
    const format = name === "LACE_MINIO_ROOT_ACCESS_KEY" ? /^[A-Za-z0-9]{20}$/u : /^[a-f0-9]{64}$/u;
    if (!format.test(values[name] ?? "")) throw new Error(`env-prepare: invalid ${name} format`);
    secretValues.add(values[name]);
  }
  if (new Set(credentials.map((name) => values[name])).size !== 4 || values.LACE_BUILD_TOKEN !== "")
    throw new Error("env-prepare: credentials are not independent or build token is populated");
  for (const [name, value] of Object.entries(parseEnv(example))) {
    if (!credentials.includes(name) && values[name] !== value)
      throw new Error(`env-prepare: changed template setting ${name}`);
  }
  const scrub = (text) =>
    text.replace(
      /^(LACE_(?:AUTH_SECRET|MINIO_ROOT_ACCESS_KEY|MINIO_ROOT_SECRET|BUILDER_SECRET))=.*$/gmu,
      "$1=",
    );
  if (scrub(bytes) !== scrub(example))
    throw new Error("env-prepare: unrelated template bytes changed");
  if (process.platform !== "win32" && ((await stat(join(project, ".env"))).mode & 0o777) !== 0o600)
    throw new Error("env-prepare: unsafe file permissions");
  // Capture expected nonzero CLI status without making the acceptance wrapper fail.
  const repeat = JSON.parse(
    await run(
      "env-prepare-repeat",
      "node",
      [
        "--input-type=module",
        "-e",
        `
    import { spawnSync } from 'node:child_process';
    const result = spawnSync(process.execPath, ['node_modules/@lacecms/cli/dist/bin.js', 'env', 'prepare', '--json'], { encoding: 'utf8' });
    console.info(JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr }));
  `,
      ],
      { cwd: project },
    ),
  );
  const failure = JSON.parse(repeat.stdout);
  if (
    repeat.status !== 6 ||
    repeat.stderr !== "" ||
    repeat.stdout.trim().split("\n").length !== 1 ||
    failure.code !== "OPERATION_FAILED" ||
    failure.operation !== "env prepare" ||
    !failure.reason ||
    !failure.nextAction
  )
    throw new Error("env-prepare: repeat did not return the sanitized refusal contract");
  if ((await readFile(join(project, ".env"), "utf8")) !== bytes)
    throw new Error("env-prepare: repeat changed configuration");
  if ((await readdir(project)).some((name) => name.startsWith(".lace-env-")))
    throw new Error("env-prepare: normal operation left staging files");
  for (const diagnostic of capturedDiagnostics.slice(diagnosticStart))
    assertSecretFree(diagnostic, secretValues, "environment preparation output");
  await packedDoctor(project, false);
  await run("prepared-db-migrate", "pnpm", ["db:migrate", "--json"], { cwd: project });
  await run("prepared-db-migrate-repeat", "pnpm", ["db:migrate", "--json"], { cwd: project });
  await packedDoctor(project, true);
  if ((await readFile(join(project, ".env"), "utf8")) !== bytes)
    throw new Error("env-prepare: migrations changed environment");
  console.info(
    "Packed consumer environment preparation, secrecy, preservation and migrations passed",
  );
}

async function doctorSnapshot(project, prefix = "") {
  const snapshot = {};
  for (const entry of await readdir(join(project, prefix), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "acceptance-packages") continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(snapshot, await doctorSnapshot(project, name));
    else if (entry.isFile())
      snapshot[name] = createHash("sha256")
        .update(await readFile(join(project, name)))
        .digest("hex");
  }
  return snapshot;
}

async function packedDoctor(project, migrated) {
  // Controlled daemon/version fixtures are external to the installation. They
  // never start services, and prove installed CLI behavior without Docker.
  const fixture = await mkdtemp(join(tmpdir(), "lace-doctor-tools-"));
  temporaryPaths.push(fixture);
  await writeFile(
    join(fixture, "docker"),
    '#!/bin/sh\ncase "$1" in\ncompose) echo 2.40.0 ;;\ninfo) echo 28.0.0 ;;\n*) exit 17 ;;\nesac\n',
    { mode: 0o755 },
  );
  const invoke = async (label, stage, env = {}) => {
    const before = await doctorSnapshot(project);
    const output = JSON.parse(
      await run(
        `doctor-${label}`,
        "node",
        [
          "--input-type=module",
          "-e",
          `
      import {spawnSync} from 'node:child_process';
      const result = spawnSync(process.execPath, ['node_modules/@lacecms/cli/dist/bin.js', 'doctor', '--target', 'node', '--mode', 'compose', '--stage', process.argv[1], '--json'], {encoding:'utf8'});
      console.info(JSON.stringify({status:result.status,stdout:result.stdout,stderr:result.stderr}));
    `,
          stage,
        ],
        { cwd: project, env: { ...env, PATH: `${fixture}:${process.env.PATH}` } },
      ),
    );
    const report = JSON.parse(output.stdout);
    if (
      output.stderr !== "" ||
      output.stdout.trim().split("\n").length !== 1 ||
      report.operation !== "doctor"
    )
      throw new Error("doctor: invalid packaged JSON contract");
    if (JSON.stringify(await doctorSnapshot(project)) !== JSON.stringify(before))
      throw new Error("doctor: installation files changed");
    assertSecretFree(output.stdout, secretValues, "doctor output");
    return { status: output.status, report };
  };
  const offlineUrl = `http://127.0.0.1:${await freePort()}/`;
  if (!migrated) {
    const initial = await invoke("initial", "setup", {
      LACE_API_BASE_URL: offlineUrl,
      LACE_BUILD_TOKEN: "",
    });
    if (
      initial.status !== 0 ||
      !initial.report.data.checks.some(
        (check) => check.id === "migrations" && check.status === "expected",
      )
    )
      throw new Error("doctor: initial setup was not classified as expected");
    const missing = await invoke("missing-settings", "setup", {
      LACE_API_BASE_URL: offlineUrl,
      LACE_AUTH_SECRET: "",
    });
    if (missing.status !== 4) throw new Error("doctor: missing settings exit was not 4");
    return;
  }
  const wal = await invoke("offline-wal", "ready", { LACE_API_BASE_URL: offlineUrl });
  if (
    wal.status !== 6 ||
    !wal.report.data.checks.some(
      (check) => check.id === "migrations" && check.code === "DATABASE_UNAVAILABLE",
    )
  )
    throw new Error("doctor: WAL safety failure was not reported");
  // Explicit fixture preparation, outside doctor: inspect an offline rollback
  // journal ledger without modifying any published artifact or live service.
  await run(
    "doctor-fixture-checkpoint",
    "node",
    [
      "--disable-warning=ExperimentalWarning",
      "--env-file=.env",
      "--input-type=module",
      "-e",
      `
    import {DatabaseSync} from 'node:sqlite';
    const database = new DatabaseSync(process.env.LACE_DATABASE_PATH);
    database.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
    database.close();
  `,
    ],
    { cwd: project },
  );
  const server = createHttpServer((request, response) => {
    response.writeHead(request.url === "/health/ready" ? 200 : 404, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify({ status: "ready" }));
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const token = randomBytes(32).toString("hex");
  secretValues.add(token);
  try {
    const ready = await invoke("ready", "ready", {
      LACE_API_BASE_URL: `http://127.0.0.1:${server.address().port}/`,
      LACE_BUILD_TOKEN: token,
    });
    if (ready.status !== 0 || ready.report.data.checks.some((check) => check.status === "fail"))
      throw new Error("doctor: ready packed installation failed");
    const packagePath = join(project, "package.json");
    const original = await readFile(packagePath, "utf8");
    try {
      const metadata = JSON.parse(original);
      metadata.engines.node = ">=99";
      await writeFile(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);
      if (
        (await invoke("consumer-engines", "setup", { LACE_API_BASE_URL: offlineUrl })).status !== 4
      )
        throw new Error("doctor: packed CLI ignored consumer engines");
    } finally {
      await writeFile(packagePath, original);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  console.info(
    "Packed consumer doctor verified setup/ready, offline WAL, missing settings, consumer engines, secrecy and unchanged installation bytes",
  );
}

async function expectDenied(base, path, options = {}, statuses = [401, 403]) {
  const response = await fetch(new URL(path, base), {
    ...options,
    headers: {
      ...(options.json ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    ...(options.json ? { body: JSON.stringify(options.json) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!statuses.includes(response.status))
    throw new Error(`Authorization boundary failed: ${path}: ${response.status}`);
}

async function securityJourney(context, session) {
  const { base, cookie, entryId, buildToken, token, email, password } = session;
  const exportPath = "/api/v1/public/build-export";
  const auth = { authorization: `Bearer ${buildToken}` };
  const before = (await request(base, exportPath, { headers: auth })).body;
  for (const headers of [{}, auth]) {
    for (const path of [
      "/api/v1/admin/content-models",
      `/api/v1/admin/entries/${entryId}`,
      "/api/v1/admin/users",
      "/api/v1/admin/site-builds",
    ])
      await expectDenied(base, path, { headers });
    await expectDenied(base, `/api/v1/admin/entries/${entryId}/publish`, {
      method: "POST",
      headers,
      json: { expectedRevision: 2 },
    });
  }
  await expectDenied(base, exportPath);
  await expectDenied(base, exportPath, { headers: { cookie } });
  await expectDenied(
    base,
    "/api/v1/setup/admin",
    {
      method: "POST",
      json: { token, email, password },
    },
    [404],
  );
  for (const role of ["editor", "viewer"]) {
    const roleEmail = `${role}@lace.test`;
    const rolePassword = randomBytes(24).toString("hex");
    secretValues.add(rolePassword);
    await request(base, "/api/v1/admin/users", {
      method: "POST",
      headers: { cookie },
      json: { email: roleEmail, password: rolePassword, role },
    });
    const login = await request(base, "/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: base.slice(0, -1) },
      json: { email: roleEmail, password: rolePassword },
    });
    const roleCookie = login.response.headers.getSetCookie()[0]?.split(";")[0];
    if (!roleCookie) throw new Error(`${role} login: session missing`);
    secretValues.add(roleCookie);
    await expectDenied(
      base,
      `/api/v1/admin/entries/${entryId}/publish`,
      {
        method: "POST",
        headers: { cookie: roleCookie },
        json: { expectedRevision: 2 },
      },
      [403],
    );
    await expectDenied(base, "/api/v1/admin/users", { headers: { cookie: roleCookie } }, [403]);
    await expectDenied(
      base,
      "/api/v1/admin/builds",
      {
        method: "POST",
        headers: { cookie: roleCookie },
        json: {},
      },
      [403],
    );
  }
  const listing = await request(base, "/api/v1/admin/api-tokens", { headers: { cookie } });
  assertSecretFree(JSON.stringify(listing.body), [buildToken], "token listing");
  await request(base, `/api/v1/admin/entries/${entryId}/draft`, {
    method: "PUT",
    headers: { cookie },
    json: {
      expectedRevision: 2,
      blocks: session.blocks.map((block) =>
        block.type === "hero"
          ? { ...block, data: { ...block.data, heading: "Unpublished draft hero" } }
          : block,
      ),
      fields: { summary: "Private draft" },
      slug: "acceptance",
      title: "Unpublished consumer draft",
    },
  });
  const after = (await request(base, exportPath, { headers: auth })).body;
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Denied publication or later draft changed published export");
  await run("draft-isolation-build", "pnpm", ["build"], {
    cwd: context.project,
    env: {
      LACE_API_BASE_URL: base,
      LACE_PUBLIC_BASE_URL: base,
      LACE_BUILD_TOKEN: buildToken,
      ASTRO_TELEMETRY_DISABLED: "1",
    },
  });
  const html = await readFile(
    join(context.project, "site/dist/blog/acceptance/index.html"),
    "utf8",
  );
  if (!html.includes("Published acceptance title") || html.includes("Unpublished consumer draft"))
    throw new Error("Unpublished draft altered generated HTML");
  console.info(
    "Roles, anonymous access, scoped build credentials and later-draft isolation passed",
  );
}

async function writeEnvironment(context) {
  await writeFile(
    join(context.project, ".env"),
    `${Object.entries(context.values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
}

async function waitBuild(session, predicate, accelerate = false) {
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    if (accelerate) {
      // Only this disposable project's retry schedule changes; content and attempt policy do not.
      await compose("advance-test-retry", [
        "exec",
        "-T",
        "api",
        "node",
        "--input-type=module",
        "-e",
        "const {openNodeDatabase}=await import('@lacecms/platform-node');const db=openNodeDatabase('/data/lace.sqlite');db.connection.prepare(\"update outbox_events set available_at=0 where type='site.build.requested' and processed_at is null and attempts > 0\").run();db.connection.close();",
      ]);
    }
    const history = await request(session.base, "/api/v1/admin/site-builds", {
      headers: { cookie: session.cookie },
    });
    const match = history.body.items.find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, accelerate ? 2000 : 1000));
  }
  throw new Error("Timed out waiting for durable consumer build state");
}

async function recoveryJourney(context, session) {
  const first = await waitBuild(session, (build) => build.status === "succeeded");
  const url = `http://127.0.0.1:${context.httpPort}/blog/acceptance/`;
  const previous = await (await fetch(url)).text();
  await compose("pause-dispatcher", ["stop", "dispatcher"]);
  const invalidToken = randomBytes(32).toString("hex");
  secretValues.add(invalidToken);
  context.values.LACE_BUILD_TOKEN = invalidToken;
  await writeEnvironment(context);
  await compose("invalid-builder-credential", [
    "up",
    "--detach",
    "--wait",
    "--force-recreate",
    "builder",
  ]);
  // Publish the already verified later draft as a new state for the failed/retried release.
  await request(session.base, `/api/v1/admin/entries/${session.entryId}/publish`, {
    method: "POST",
    headers: { cookie: session.cookie },
    json: { expectedRevision: 3 },
  });
  await compose("resume-dispatcher", ["start", "dispatcher"]);
  const failed = await waitBuild(
    session,
    (build) => build.id !== first.id && build.status === "failed",
    true,
  );
  const oldResponse = await fetch(url);
  if (!oldResponse.ok || (await oldResponse.text()) !== previous)
    throw new Error("Failed build replaced previous served release");
  context.values.LACE_BUILD_TOKEN = session.buildToken;
  await writeEnvironment(context);
  await compose("restore-builder-credential", [
    "up",
    "--detach",
    "--wait",
    "--force-recreate",
    "builder",
  ]);
  await request(session.base, `/api/v1/admin/builds/${failed.id}/retry`, {
    method: "POST",
    headers: { cookie: session.cookie },
    json: {},
  });
  const retried = await waitBuild(
    session,
    (build) => build.id !== first.id && build.status === "succeeded",
  );
  const recovered = await fetch(url);
  if (!recovered.ok || !(await recovered.text()).includes("Unpublished consumer draft"))
    throw new Error("Retried release is not served");
  context.buildEvidence = {
    first: first.id,
    failed: failed.id,
    retried: retried.id,
    firstVersion: first.targetVersion,
    recoveredVersion: retried.targetVersion,
  };
  console.info(
    "Compose successful release, terminal failure, old-release preservation and explicit retry passed",
  );
}

async function persistenceJourney(context, session) {
  const headers = { cookie: session.cookie };
  const draftPath = `/api/v1/admin/entries/${session.entryId}`;
  const draft = (await request(session.base, draftPath, { headers })).body;
  const exported = (
    await request(session.base, "/api/v1/public/build-export", {
      headers: { authorization: `Bearer ${session.buildToken}` },
    })
  ).body;
  await compose("persist-stop", ["down", "--remove-orphans"]);
  await compose("persist-recreate", ["up", "--detach", "--wait"], { timeoutMs: 10 * 60_000 });
  if (
    JSON.stringify(draft) !==
    JSON.stringify((await request(session.base, draftPath, { headers })).body)
  )
    throw new Error("Database draft did not persist across recreation");
  const next = (
    await request(session.base, "/api/v1/public/build-export", {
      headers: { authorization: `Bearer ${session.buildToken}` },
    })
  ).body;
  if (JSON.stringify(next) !== JSON.stringify(exported))
    throw new Error("Published database state did not persist");
  const media = await fetch(new URL(`/api/v1/public/media/${session.mediaId}`, session.base));
  if (!media.ok || !Buffer.from(await media.arrayBuffer()).equals(session.png))
    throw new Error("Uploaded object bytes did not persist");
  const served = await fetch(`http://127.0.0.1:${context.httpPort}/blog/acceptance/`);
  if (!served.ok || !(await served.text()).includes("Unpublished consumer draft"))
    throw new Error("Static release did not persist");
  console.info(
    "Recreated services retained drafts, published export, object bytes and static release",
  );
}

async function inspectShipping(context) {
  const { project, parent, releaseArtifacts, shipping } = context;
  const substituted = new Set(["package.json", "site/package.json", "pnpm-workspace.yaml"]);
  for (const file of shipping.tree) {
    await scanFile(join(project, file), secretValues, `generated ${file}`);
    if (!substituted.has(file)) {
      const bytes = await readFile(join(project, file));
      if (file === ".lace/manifest.json") {
        if (bytes.toString("utf8") !== shipping.manifest)
          throw new Error("Consumer installation changed ownership metadata");
      } else if (createHash("sha256").update(bytes).digest("hex") !== shipping.digests[file]) {
        throw new Error(`Undocumented consumer patch: ${file}`);
      }
    }
  }
  for (const root of releaseArtifacts.extracted)
    await scanTree(root, secretValues, "packed package");
  await scanTree(join(project, "site/dist"), secretValues, "static output");
  const output = join(parent, "served-output");
  await mkdir(output);
  await compose("inspect-served-static", ["cp", "builder:/output/.", output]);
  await scanTree(output, secretValues, "served static releases");
  for (const record of Object.values(releaseArtifacts.images)) {
    const metadata = await run("scan-image-config", "docker", ["image", "inspect", record.imageId]);
    assertSecretFree(metadata, secretValues, `${record.kind} image configuration`);
    await run("scan-image-private-keys", "docker", [
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "0:0",
      "--entrypoint",
      "node",
      record.imageId,
      "--input-type=module",
      "-e",
      String.raw`
      import { readdir, readFile } from 'node:fs/promises';
      async function inspect(path) {
        for (const entry of await readdir(path, {withFileTypes:true})) {
          const child = path + '/' + entry.name;
          if (entry.isDirectory()) await inspect(child);
          else if (entry.isFile()) {
            const bytes = await readFile(child);
            if (['.npmrc','npmrc'].includes(entry.name) && /(?:_auth(?:Token)?|_password|username|password)\s*=/iu.test(bytes.toString('utf8')))
              throw new Error('Registry authentication directive found in image');
            if (!bytes.includes(0) && /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(bytes.toString('utf8')))
              throw new Error('Private key material found in image text file');
          }
        }
      }
      for (const root of ['/opt','/usr','/etc','/root']) await inspect(root);
    `,
    ]);
    const id = (await run("image-scan-create", "docker", ["create", record.imageId])).trim();
    try {
      const archive = join(parent, `${record.kind}-filesystem.tar`);
      await run("image-scan-export", "docker", ["export", "--output", archive, id]);
      await scanFile(archive, secretValues, `${record.kind} image filesystem`);
      const listing = await run("image-scan-files", "tar", ["-tf", archive]);
      assertImageFileList(listing, record.kind);
    } finally {
      await run("image-scan-remove", "docker", ["rm", id]);
    }
  }
  const logs = await compose("scan-service-diagnostics", ["logs", "--no-color"]);
  assertSecretFree(logs, secretValues, "service diagnostics");
  for (const output of capturedDiagnostics)
    assertSecretFree(output, secretValues, "captured diagnostics");
  console.info(
    "Generated files, packages, images, static releases and diagnostics passed secret exclusion",
  );
}

async function main() {
  const phase = process.argv[2] ?? "all";
  if (
    ![
      "release",
      "packages",
      "node",
      "all",
      "build-site",
      "publication-visibility",
      "snapshots",
      "starter",
      "self-test",
    ].includes(phase)
  ) {
    throw new Error(`Unknown acceptance phase: ${phase}`);
  }
  const parent = await mkdtemp(join(tmpdir(), "lace-generated-acceptance-"));
  temporaryPaths.push(parent);
  if (phase === "self-test") {
    await run("forced-failure", process.execPath, [
      "-e",
      "console.error(process.env.LACE_ACCEPTANCE_SECRET_SENTINEL); process.exit(17)",
    ]);
    return;
  }
  if (phase === "snapshots") {
    await run("build-generator", "pnpm", ["--filter", "create-lace", "build"]);
    await verifySnapshots(parent, process.argv.includes("--update"));
    return;
  }
  if (phase === "release") {
    const args = process.argv.slice(3);
    if (args.length !== 2 || args[0] !== "--artifacts")
      throw new Error("release acceptance requires --artifacts <prepared-directory>");
    const platform = `linux/${process.arch === "arm64" ? "arm64" : "amd64"}`;
    const artifacts = await loadConsumerArtifacts(
      resolve(args[1]),
      join(parent, "extracted"),
      platform,
    );
    for (const record of Object.values(artifacts.images)) {
      await run("load-release-image", "docker", [
        "image",
        "load",
        "--input",
        join(resolve(args[1]), record.file),
      ]);
      const metadata = JSON.parse(
        await run("inspect-release-image", "docker", ["image", "inspect", record.imageId]),
      )[0];
      checkImageIdentity(metadata, record, artifacts.inventory);
    }
    const project = join(parent, "consumer", "acceptance-site");
    await mkdir(dirname(project), { recursive: true });
    await run("packed-generate", "node", [artifacts.generator, "create", project]);
    const shipping = await captureSnapshot(project);
    if (
      JSON.parse(shipping.manifest).templateVersion !== artifacts.inventory.release.templateVersion
    )
      throw new Error("Consumer template version mismatch");
    await installPackedConsumer(project, artifacts.tarballs);
    const context = await prepareCompose(project, parent, artifacts);
    context.shipping = shipping;
    const session = await nodeJourney(context);
    await securityJourney(context, session);
    await productionSmoke(context, session);
    await recoveryJourney(context, session);
    await persistenceJourney(context, session);
    await inspectShipping(context);
    console.info(
      JSON.stringify(
        {
          result: "passed",
          version: artifacts.inventory.release.version,
          templateVersion: artifacts.inventory.release.templateVersion,
          platform,
          source: artifacts.inventory.source,
          builds: context.buildEvidence,
          packages: artifacts.inventory.packages,
          images: Object.values(artifacts.images),
        },
        null,
        2,
      ),
    );
    return;
  }
  const tarballDirectory = join(parent, "tarballs");
  await run("build", "pnpm", ["build"]);
  await verifySnapshots(parent);
  await run("mkdir-tarballs", "mkdir", ["-p", tarballDirectory]);
  const tarballs = await packConsumerGraph(tarballDirectory);
  const project = join(parent, "consumer", "acceptance-site");
  await run("mkdir-consumer", "mkdir", ["-p", dirname(project)]);
  await run("generate", "node", ["packages/create-lace/dist/bin.js", "create", project]);
  await installPackedConsumer(project, tarballs);
  console.info(`Packed consumer installed: ${tarballs.size} Lace tarballs; ${basename(project)}`);
  if (phase === "packages") {
    await environmentPreparation(project);
    return;
  }
  if (phase === "starter") {
    await starterJourney(project);
    return;
  }
  const context = await prepareCompose(project, parent);
  const session = await nodeJourney(context);
  if (phase === "node") return;
  await productionSmoke(context, session);
  if (phase === "build-site") {
    await buildSiteJourney(context, session, {
      compose,
      request,
      run,
      waitBuild,
      writeEnvironment,
      secretValues,
      referenceRoot: workspace,
    });
    return;
  }
  if (phase === "publication-visibility") {
    await publicationVisibilityJourney(context, session, { request, run, secretValues });
    return;
  }
  await cloudflareSmoke(context, tarballs);
}

try {
  await main();
} catch (error) {
  console.error(sanitize(error instanceof Error ? error.message : error));
  if (composeProject && composeCwd) {
    try {
      const logs = await compose("builder-logs", [
        "logs",
        "--no-color",
        "--tail",
        "100",
        "builder",
      ]);
      console.error(`Builder diagnostics:\n${sanitize(logs).slice(-6000)}`);
    } catch {
      /* Keep the original acceptance failure. */
    }
  }
  process.exitCode = 1;
} finally {
  if (composeProject && composeCwd) {
    try {
      await compose("compose-down", ["down", "--volumes", "--remove-orphans"], {
        timeoutMs: 3 * 60_000,
      });
    } catch (error) {
      console.error(sanitize(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    }
  }
  if (process.env.LACE_ACCEPTANCE_KEEP_TEMP !== "1") {
    for (const path of temporaryPaths) await rm(path, { recursive: true, force: true });
  } else {
    for (const path of temporaryPaths)
      console.info(`Acceptance files: ${relative(workspace, path)}`);
  }
}
