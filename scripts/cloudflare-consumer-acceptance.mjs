import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseEnv } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import { loadBrowser, visible } from "./acceptance-browser.mjs";
import { assertSecretFree, scanTree } from "./consumer-security.mjs";

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

/** The provider deployment ID returned by the recovered controlled hook. */
export const providerDeploymentId = "acceptance-deploy-1";

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

/** The controlled hook's answer for one mode: unavailable or accepted with an ID. */
export function hookResponse(mode) {
  return mode === "accepted"
    ? {
        status: 200,
        body: JSON.stringify({
          errors: [],
          messages: [],
          result: { id: providerDeploymentId },
          success: true,
        }),
      }
    : { status: 503, body: JSON.stringify({ success: false }) };
}

/** Relative project paths that hold local secrets or state by design and are scanned separately. */
export function excludedFromProjectScan(path) {
  return (
    path === ".env" ||
    path === "worker/.dev.vars" ||
    path === "node_modules" ||
    path.endsWith("/node_modules") ||
    path === ".lace/data" ||
    path === ".lace/acceptance-packages" ||
    path === "site/dist"
  );
}

/**
 * A local HTTPS deploy hook with a throwaway certificate. Only processes given
 * `certificate` through NODE_EXTRA_CA_CERTS trust it.
 */
async function startHook(directory, run) {
  const key = join(directory, "hook-key.pem");
  const certificate = join(directory, "hook-cert.pem");
  await run("cloudflare-hook-certificate", "openssl", [
    "req",
    "-x509",
    // RSA with a named digest: LibreSSL EC keys may carry explicit curve
    // parameters, which workerd's BoringSSL rejects during the handshake.
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-nodes",
    "-keyout",
    key,
    "-out",
    certificate,
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
  ]);
  const hook = { calls: [], mode: "unavailable", certificate };
  const path = `/deploy-hooks/${randomBytes(24).toString("hex")}`;
  hook.server = createHttpsServer(
    { cert: await readFile(certificate), key: await readFile(key) },
    (request, response) => {
      let body = "";
      request.setEncoding("utf8").on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        if (request.url !== path) {
          response.writeHead(404).end();
          return;
        }
        hook.calls.push({
          authorization: request.headers.authorization ?? null,
          body,
          cookie: request.headers.cookie ?? null,
          method: request.method,
        });
        const answer = hookResponse(hook.mode);
        response.writeHead(answer.status, { "content-type": "application/json" });
        response.end(answer.body);
      });
    },
  );
  await new Promise((resolve, reject) => {
    hook.server.once("error", reject);
    hook.server.listen(0, "127.0.0.1", resolve);
  });
  hook.url = `https://127.0.0.1:${hook.server.address().port}${path}`;
  return hook;
}

/**
 * Explicit fixture preparation, never while a Worker runs: expires every
 * operator-issued setup token in the stopped local D1 state.
 */
async function expireSetupTokens(persistTo) {
  const directory = join(persistTo, "v3", "d1", "miniflare-D1DatabaseObject");
  let expired = 0;
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".sqlite")) continue;
    const database = new DatabaseSync(join(directory, name));
    try {
      const table = database
        .prepare("select name from sqlite_master where type = 'table' and name = 'setup_tokens'")
        .get();
      if (table === undefined) continue;
      expired += Number(database.prepare("update setup_tokens set expires_at = 1").run().changes);
    } finally {
      database.close();
    }
  }
  if (expired === 0) throw new Error("cloudflare-expire: no setup token found in local D1 state");
}

/**
 * Generates a `--cloudflare` project from packed packages and runs the operator
 * journey against its own Worker through the generated scripts: account-free
 * bundle, local doctor, cloudflare-local migrate/sync/bootstrap, expired-token
 * recovery, browser setup, editing and publication, scheduled dispatch to a
 * controlled deploy hook, an Astro build from the published export, draft
 * isolation, restart persistence and secret exclusion.
 */
export async function cloudflareConsumerJourney(parent, operations) {
  const {
    capturedDiagnostics,
    freePort,
    generator,
    installPackedConsumer,
    run,
    sanitize,
    secretValues,
    workspace,
  } = operations;
  const project = join(parent, "cloudflare-consumer", "acceptance-site");
  await mkdir(dirname(project), { recursive: true });
  const diagnostics = [];
  await run("cloudflare-generate", "node", [
    generator,
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
  const bundlePath = join(project, ".lace/data/cloudflare-bundle");
  const bundle = await readFile(join(bundlePath, "index.js"), "utf8");
  if (bundle.includes(workspace))
    throw new Error("cloudflare-bundle: Worker bundle references the Lace source workspace");
  if (!bundle.includes("/blog/:slug") || !bundle.includes("posts"))
    throw new Error("cloudflare-bundle: Worker bundle lacks the project configuration");

  await run("cloudflare-env-prepare", "pnpm", ["env:prepare"], { cwd: project });
  await run("cloudflare-worker-env-prepare", "pnpm", ["cf:env:prepare"], { cwd: project });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}/`;
  const origin = base.slice(0, -1);
  const hookDirectory = join(parent, "cloudflare-hook");
  await mkdir(hookDirectory);
  const hook = await startHook(hookDirectory, run);
  secretValues.add(hook.url);
  const variablesPath = join(project, "worker/.dev.vars");
  const variables = await readFile(variablesPath, "utf8");
  const authSecret = parseEnv(variables).LACE_AUTH_SECRET;
  if (!/^[a-f0-9]{64}$/u.test(authSecret ?? ""))
    throw new Error("cloudflare-env: worker/.dev.vars lacks a generated auth secret");
  secretValues.add(authSecret);
  // The guide's local journey: the Worker origin follows the free port, and the
  // operator's site-build and doctor origins point at the local Worker.
  await writeFile(
    variablesPath,
    `${withVariable(variables, "LACE_PUBLIC_BASE_URL", base)}LACE_DEPLOY_HOOK_URL=${hook.url}\n`,
  );
  const envPath = join(project, ".env");
  let environment = await readFile(envPath, "utf8");
  for (const name of ["LACE_API_BASE_URL", "LACE_PUBLIC_BASE_URL"])
    environment = withVariable(environment, name, base);
  await writeFile(envPath, environment);
  for (const name of ["LACE_AUTH_SECRET", "LACE_MINIO_ROOT_SECRET", "LACE_BUILDER_SECRET"])
    secretValues.add(parseEnv(environment)[name]);

  const persistTo = join(project, ".lace/data/cloudflare");
  const doctor = (label, stage, env = {}) => {
    console.info(`Acceptance: cloudflare-doctor-${label}`);
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/@lacecms/cli/dist/bin.js",
        "doctor",
        "--target",
        "cloudflare-local",
        "--stage",
        stage,
        "--json",
      ],
      { cwd: project, encoding: "utf8", env: { ...process.env, ...env } },
    );
    diagnostics.push(result.stdout, result.stderr);
    let report;
    try {
      report = JSON.parse(result.stdout);
    } catch {
      throw new Error(`cloudflare-doctor-${label}: invalid JSON\n${sanitize(result.stdout)}`);
    }
    const checks = Object.fromEntries(report.data.checks.map((check) => [check.id, check.status]));
    return { status: result.status, checks };
  };
  const offlineSetup = doctor("offline-setup", "setup");
  if (
    offlineSetup.status !== 0 ||
    offlineSetup.checks.wrangler !== "pass" ||
    offlineSetup.checks["cloudflare-binding"] !== "pass" ||
    offlineSetup.checks.settings !== "pass" ||
    offlineSetup.checks["api-readiness"] !== "expected" ||
    offlineSetup.checks.migrations !== "skipped"
  )
    throw new Error(
      `cloudflare-doctor-offline-setup: unexpected report ${JSON.stringify(offlineSetup)}`,
    );
  if (doctor("offline-ready", "ready").status === 0)
    throw new Error("cloudflare-doctor-offline-ready: offline Worker reported ready");
  if (await stat(persistTo).catch(() => undefined))
    throw new Error("cloudflare-doctor: diagnosis created local Worker state");

  for (const script of ["cf:db:migrate", "cf:content:sync"]) {
    const result = JSON.parse(
      await run(`cloudflare-${script}`, "pnpm", [script, "--json"], {
        cwd: project,
        env: wranglerEnvironment,
      }),
    );
    if (!result.ok) throw new Error(`cloudflare-${script}: unsuccessful result`);
  }
  const bootstrap = async (stage) => {
    const issued = JSON.parse(
      await run(stage, "pnpm", ["cf:auth:bootstrap", "--json"], {
        cwd: project,
        intentionalReveal: true,
      }),
    );
    const value = issued.data?.token;
    if (!issued.ok || typeof value !== "string") throw new Error(`${stage}: no token`);
    secretValues.add(value);
    return value;
  };
  const expiredToken = await bootstrap("cloudflare-bootstrap");
  await expireSetupTokens(persistTo);

  const scripts = JSON.parse(await readFile(join(project, "package.json"), "utf8")).scripts;
  const args = workerCommand(scripts["cf:dev"], port);
  let worker;
  let browser;
  const workerOutput = [];
  const start = async (stage) => {
    worker = startWorker(project, args, hook.certificate);
    await waitReady(worker, base, stage, sanitize);
  };
  const stop = async () => {
    await stopWorker(worker);
    if (worker) workerOutput.push(worker.output);
  };
  const email = "cloudflare@lace.test";
  const password = randomBytes(24).toString("hex");
  secretValues.add(password);
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

    browser = await loadBrowser(workspace);
    const context = await browser.newContext({ baseURL: origin });
    const tab = await context.newPage();
    tab.on("console", (message) => diagnostics.push(message.text()));
    const setup = async (token) => {
      await tab.goto("/admin/setup");
      await visible(
        tab.getByRole("heading", { name: "Create your administrator" }),
        "cloudflare-setup",
      );
      await tab.getByLabel("Email", { exact: true }).fill(email);
      await tab.getByLabel("Password", { exact: true }).fill(password);
      await tab.getByLabel("Bootstrap token", { exact: true }).fill(token);
      await tab.getByRole("button", { name: "Create administrator" }).click();
    };

    console.info("Acceptance: cloudflare-browser-expired-setup");
    await setup(expiredToken);
    await visible(
      tab.getByRole("alert").filter({ hasText: "issue a new one if it expired" }),
      "cloudflare-browser-expired-setup",
    );
    if ((await json(base, "api/v1/setup/state")).setupComplete !== false)
      throw new Error("cloudflare-browser-expired-setup: expired token completed setup");
    // Documented recovery: re-issue the token with the Worker stopped.
    await stop();
    const token = await bootstrap("cloudflare-bootstrap-reissue");
    await start("cloudflare-dev-reissued");

    console.info("Acceptance: cloudflare-browser-setup");
    await setup(token);
    await visible(tab.getByRole("heading", { name: "Sign in" }), "cloudflare-browser-setup");
    await visible(
      tab.getByRole("status").filter({ hasText: "Setup is complete" }),
      "cloudflare-browser-setup",
    );
    if (tab.url().includes(token)) throw new Error("cloudflare-browser-setup: token in URL");
    await tab.getByRole("textbox", { name: "Email" }).fill(email);
    await tab.getByLabel("Password", { exact: true }).fill(password);
    await tab.getByRole("button", { name: "Sign in" }).click();
    await visible(
      tab.getByRole("heading", { name: "Content", exact: true }),
      "cloudflare-browser-login",
    );
    for (const cookie of await context.cookies()) secretValues.add(cookie.value);

    console.info("Acceptance: cloudflare-browser-media");
    const main = tab.getByRole("main");
    const sidebar = tab.getByRole("complementary", { name: "Admin navigation" });
    await sidebar.getByRole("link", { name: "Media", exact: true }).click();
    await tab.getByLabel("Upload images").setInputFiles({
      name: "cloudflare.png",
      mimeType: "image/png",
      buffer: png,
    });
    await visible(
      tab
        .getByRole("list", { name: "Media library" })
        .getByRole("button", { name: "cloudflare.png" }),
      "cloudflare-browser-media",
    );

    console.info("Acceptance: cloudflare-browser-edit");
    await sidebar.getByRole("link", { name: "Content", exact: true }).click();
    await main.getByRole("link", { name: "posts" }).click();
    await tab.getByRole("button", { name: "Create entry" }).click();
    const create = tab.getByRole("dialog", { name: "Create entry" });
    await create.getByRole("textbox", { name: "Title" }).fill("Cloudflare published title");
    await create.getByRole("button", { name: "Create entry" }).click();
    await main.getByRole("link", { name: "Cloudflare published title" }).click();
    await tab.getByRole("textbox", { name: "Slug" }).fill("cloudflare");
    await tab.getByRole("textbox", { name: "Summary" }).fill("Cloudflare summary");
    await tab.getByRole("button", { name: "Add block" }).click();
    await tab
      .getByRole("dialog", { name: "Add block" })
      .getByRole("button", { name: "Image" })
      .click();
    await tab.getByRole("textbox", { name: "Alt" }).fill("Cloudflare image");
    await tab.getByRole("button", { name: "Choose media for Media" }).click();
    await tab
      .getByRole("dialog", { name: "Choose media for Media" })
      .getByRole("button", { name: "cloudflare.png", exact: true })
      .click();
    await tab.getByRole("button", { name: "Save draft" }).click();
    await visible(tab.getByText(/Saved revision 2/u), "cloudflare-browser-save");
    await tab.getByRole("button", { name: "Publish", exact: true }).click();
    await tab.getByRole("button", { name: "Confirm publication" }).click();
    await visible(
      tab.getByRole("region", { name: "Publication status" }).filter({ hasText: "Published" }),
      "cloudflare-browser-publish",
    );
    const cookie = await login(base, email, password, secretValues);
    // The starter needs the synchronized home page published as well.
    const homes = await json(base, "api/v1/admin/models/home/entries", { headers: { cookie } });
    const homeId = homes?.items?.[0]?.id;
    if (typeof homeId !== "string") throw new Error("cloudflare-home: synchronized draft missing");
    await json(base, `api/v1/admin/entries/${homeId}/publish`, {
      method: "POST",
      headers: { cookie, origin },
      json: { expectedRevision: 1 },
    });

    console.info("Acceptance: cloudflare-hook-unavailable");
    await new Promise((resolve) => setTimeout(resolve, 5_600));
    await scheduled(base);
    const pending = await waitBuild(base, cookie, (build) => build.error !== undefined, 30_000);
    if (pending.status !== "pending" || !/trigger_unavailable/u.test(pending.error ?? ""))
      throw new Error(`cloudflare-hook-unavailable: unexpected build ${JSON.stringify(pending)}`);
    if (hook.calls.length !== 1)
      throw new Error(
        `cloudflare-hook-unavailable: expected one hook call, saw ${hook.calls.length}`,
      );

    const ready = doctor("ready", "ready", { LACE_BUILD_TOKEN: "present-but-unverified" });
    if (
      ready.status !== 0 ||
      ready.checks["api-readiness"] !== "pass" ||
      ready.checks.migrations !== "pass"
    )
      throw new Error(`cloudflare-doctor-ready: unexpected report ${JSON.stringify(ready)}`);

    console.info("Acceptance: cloudflare-hook-recovered");
    hook.mode = "accepted";
    const accepted = await waitBuild(
      base,
      cookie,
      (build) => build.status !== "pending",
      60_000,
      () => scheduled(base),
    );
    if (accepted.status !== "running" || accepted.providerBuildId !== providerDeploymentId)
      throw new Error(
        `cloudflare-hook-recovered: accepted hook must be running, not ${accepted.status}`,
      );
    if (
      hook.calls.length !== 2 ||
      hook.calls.some(
        (call) =>
          call.method !== "POST" ||
          call.body !== "" ||
          call.cookie !== null ||
          call.authorization !== null,
      )
    )
      throw new Error(`cloudflare-hook-recovered: unexpected calls ${JSON.stringify(hook.calls)}`);
    const history = JSON.stringify(
      await json(base, "api/v1/admin/site-builds", { headers: { cookie } }),
    );
    assertSecretFree(history, [hook.url], "build history");

    console.info("Acceptance: cloudflare-astro-build");
    const issued = await json(base, "api/v1/admin/api-tokens", {
      method: "POST",
      headers: { cookie, origin },
      json: { name: "cloudflare-site" },
    });
    const buildToken = issued?.token;
    if (typeof buildToken !== "string") throw new Error("cloudflare-build-token: token missing");
    secretValues.add(buildToken);
    const exportHeaders = { authorization: `Bearer ${buildToken}` };
    const published = await json(base, "api/v1/public/build-export", { headers: exportHeaders });
    const build = async (stage) => {
      await run(stage, "pnpm", ["build"], {
        cwd: project,
        env: { ASTRO_TELEMETRY_DISABLED: "1", LACE_BUILD_TOKEN: buildToken },
      });
      return readFile(join(project, "site/dist/blog/cloudflare/index.html"), "utf8");
    };
    const page1 = await build("cloudflare-astro-build");
    if (!page1.includes("Cloudflare published title") || !page1.includes('data-lace-block="image"'))
      throw new Error("cloudflare-astro-build: published entry missing from the generated site");
    const images = [...page1.matchAll(/<img\b[^>]*src="([^"]+)"/gu)].map(([, url]) => url);
    if (images.length === 0) throw new Error("cloudflare-astro-build: rendered media missing");
    for (const url of images) {
      if (!url.startsWith(`${base}api/v1/public/media/`))
        throw new Error("cloudflare-astro-build: media URL is not the Worker origin");
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(png))
        throw new Error("cloudflare-astro-build: Worker media URL did not return the upload");
    }

    console.info("Acceptance: cloudflare-draft-isolation");
    const posts = await json(base, "api/v1/admin/models/posts/entries", { headers: { cookie } });
    const entryId = posts?.items?.find((item) => item.slug === "cloudflare")?.id;
    if (typeof entryId !== "string") throw new Error("cloudflare-draft: entry missing");
    const entry = await json(base, `api/v1/admin/entries/${entryId}`, { headers: { cookie } });
    await json(base, `api/v1/admin/entries/${entryId}/draft`, {
      method: "PUT",
      headers: { cookie, origin },
      json: {
        blocks: entry.draft.blocks,
        expectedRevision: entry.draft.revision,
        fields: entry.draft.fields,
        slug: entry.draft.slug,
        title: "Unpublished Cloudflare draft",
      },
    });
    const later = await json(base, "api/v1/public/build-export", { headers: exportHeaders });
    if (JSON.stringify(later) !== JSON.stringify(published))
      throw new Error("cloudflare-draft-isolation: a draft changed the published export");
    const page2 = await build("cloudflare-draft-build");
    if (!page2.includes("Cloudflare published title") || page2.includes("Unpublished Cloudflare"))
      throw new Error("cloudflare-draft-isolation: a draft reached the generated site");
    const draft = await json(base, `api/v1/admin/entries/${entryId}`, { headers: { cookie } });
    const media = await json(base, "api/v1/admin/media", { headers: { cookie } });
    const mediaId = media?.items?.[0]?.id;
    if (typeof mediaId !== "string") throw new Error("cloudflare-media: uploaded media missing");

    await browser.close();
    browser = undefined;
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
    const afterExport = await json(base, "api/v1/public/build-export", { headers: exportHeaders });
    if (JSON.stringify(afterExport) !== JSON.stringify(published))
      throw new Error("cloudflare-restart: published export did not persist");
    const afterDraft = await json(base, `api/v1/admin/entries/${entryId}`, {
      headers: { cookie: restarted },
    });
    if (JSON.stringify(afterDraft.draft) !== JSON.stringify(draft.draft))
      throw new Error("cloudflare-restart: saved draft did not persist");
  } catch (error) {
    // Network failures carry no stage context; keep the local Worker's own output.
    const output = sanitize(worker?.output ?? "").slice(-4000);
    throw new Error(
      `${error instanceof Error ? error.message : error}\nLocal Worker output:\n${output}`,
    );
  } finally {
    await browser?.close();
    await stop();
    await new Promise((resolve) => hook.server.close(resolve));
  }

  console.info("Acceptance: cloudflare-secret-scan");
  await scanProject(project, project, secretValues);
  await scanTree(bundlePath, secretValues, "Cloudflare Worker bundle");
  await scanTree(join(project, "site/dist"), secretValues, "Cloudflare static output");
  for (const output of workerOutput) assertSecretFree(output, secretValues, "Worker output");
  for (const output of [...diagnostics, ...capturedDiagnostics])
    assertSecretFree(output, secretValues, "captured diagnostics");
  console.info(
    "Generated Cloudflare journey: bundle, local doctor, migrate/sync/bootstrap, expired-token recovery, browser setup/edit/publish, scheduled hook dispatch (unavailable, then accepted), Astro build, draft isolation, restart persistence and secret exclusion passed",
  );
  return { project };
}

async function scanProject(project, directory, secrets, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (excludedFromProjectScan(path)) continue;
    if (entry.isDirectory()) await scanProject(project, join(directory, entry.name), secrets, path);
    else if (entry.isFile())
      assertSecretFree(await readFile(join(directory, entry.name)), secrets, `generated ${path}`);
  }
}

function startWorker(project, args, certificate) {
  const child = spawn("pnpm", ["exec", "wrangler", ...args], {
    cwd: project,
    detached: true,
    // Miniflare adds this bundle to the local Worker's outbound trust store, so
    // only this Worker trusts the throwaway hook certificate.
    env: { ...process.env, ...wranglerEnvironment, NODE_EXTRA_CA_CERTS: certificate },
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

/** Invokes the scheduled handler through the endpoint `wrangler dev --test-scheduled` exposes. */
async function scheduled(base) {
  const response = await fetch(new URL("__scheduled?cron=*+*+*+*+*", base), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`cloudflare-scheduled: status ${response.status}`);
}

async function waitBuild(base, cookie, predicate, timeout, beforeEach = async () => {}) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    await beforeEach();
    latest = (await json(base, "api/v1/admin/site-builds", { headers: { cookie } }))?.items?.[0];
    if (latest !== undefined && predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`cloudflare-build: timed out; latest ${JSON.stringify(latest ?? null)}`);
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
  secretValues.add(cookie.slice(cookie.indexOf("=") + 1));
  return cookie;
}

async function expectModels(base, cookie) {
  const models = await json(base, "api/v1/admin/content-models", { headers: { cookie } });
  const keys = models?.items?.map((item) => item.key);
  if (JSON.stringify(keys) !== JSON.stringify(["home", "posts"]))
    throw new Error(`cloudflare-config: unexpected models ${JSON.stringify(keys)}`);
}
