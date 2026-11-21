import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { exec, listen } from "./support/packed-preview-platforms.mjs";
import {
  cmsHost,
  loopbackRequest,
  previewCertificate,
  previewHost,
} from "./support/preview-deployment-http.mjs";
import { sharp } from "./support/preview-astro-fixture.mjs";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const adminRequire = createRequire(new URL("../apps/admin/package.json", import.meta.url));
const { chromium, expect: browserExpect } = adminRequire("@playwright/test");

async function isolatedCheckout(project) {
  await exec("git", ["clone", "--quiet", "--depth", "1", pathToFileURL(workspace).href, project]);
  const { stdout } = await exec("git", ["ls-files", "-z", "-m", "-o", "--exclude-standard"], {
    cwd: workspace,
  });
  for (const path of new Set(stdout.split("\0").filter(Boolean))) {
    const destination = join(project, path);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await copyFile(join(workspace, path), destination);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await rm(destination, { force: true });
    }
  }
  const git = (...args) => exec("git", args, { cwd: project });
  await git("add", "--all");
  await git(
    "-c",
    "user.name=Lace",
    "-c",
    "user.email=lace@example.test",
    "commit",
    "--allow-empty",
    "-qm",
    "Repository preview development acceptance",
  );
  return (await git("rev-parse", "HEAD")).stdout.trim();
}

test("repository Node preview pins committed reference source and keeps HTTPS frontend reload", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "lace-preview-repo-dev-"));
  const project = join(scratch, "repo");
  const cleanups = [() => rm(scratch, { force: true, recursive: true })];
  const name = `lace-preview-repo-${randomBytes(5).toString("hex")}`;
  const env = { ...process.env, COMPOSE_PROJECT_NAME: name };
  const cmd = (tool, args) => exec(tool, args, { cwd: project, env, timeout: 240_000 });
  const pnpm = (...args) => cmd("pnpm", args);
  const compose = (...args) => cmd("docker", ["compose", "-f", "docker-compose.dev.yml", ...args]);
  const composePreview = (...args) => compose("-f", "docker-compose.dev.preview.yml", ...args);
  const port = async () => {
    const cleanups = [];
    const value = await listen(createServer(), cleanups);
    await cleanups[0]();
    return value;
  };
  try {
    const commit = await isolatedCheckout(project);
    const [apiPort, httpsPort, mailPort] = await Promise.all([port(), port(), port()]);
    const local = `http://127.0.0.1:${apiPort}`;
    const cms = `https://${cmsHost}:${httpsPort}`;
    const preview = `https://${previewHost}:${httpsPort}`;
    const envFile = join(project, ".env");
    await pnpm("dev:env");
    const defaults = await readFile(envFile, "utf8");
    const base = defaults
      .replace(/^LACE_PUBLIC_BASE_URL=.*$/mu, `LACE_PUBLIC_BASE_URL=${local}/`)
      .replace(/^LACE_API_PORT=.*$/mu, `LACE_API_PORT=${apiPort}`)
      .replace(/^LACE_MAILPIT_PORT=.*$/mu, `LACE_MAILPIT_PORT=${mailPort}`);
    await writeFile(envFile, base);
    cleanups.push(() => composePreview("down", "--volumes", "--remove-orphans"));
    await pnpm("dev:node");
    expect((await fetch(local + "/health/ready")).status).toBe(200);
    expect((await fetch(local + "/")).status).toBe(200);
    expect((await compose("ps", "--services", "--status", "running")).stdout).not.toContain(
      "preview-",
    );
    await pnpm("dev:stop");

    const tls = await previewCertificate(join(project, ".lace/tls"));
    const secret = () => randomBytes(32).toString("hex");
    await writeFile(
      envFile,
      base +
        [
          "LACE_PREVIEW_ENABLED=true",
          `LACE_DEV_HTTPS_PORT=${httpsPort}`,
          `LACE_DEV_PREVIEW_BUILDER_SECRET=${secret()}`,
          `LACE_DEV_PREVIEW_RUNNER_SECRET=${secret()}`,
          "",
        ].join("\n"),
    );
    await pnpm("dev:node", "--", "--preview");
    const request = loopbackRequest(tls.cert);
    expect((await request(new Request(preview + "/admin/"))).status).toBe(404);
    expect((await request(new Request(preview + "/"))).status).toBe(404);
    expect((await request(new Request(cms + "/health/ready"))).status).toBe(200);
    await pnpm("content:sync");
    const token = (await pnpm("dev:bootstrap")).stdout.trim().split("\n").at(-1);
    let cookie;
    const email = "local-editor@lace.test";
    const password = secret();
    const call = async (path, status, { data, body } = {}) => {
      const headers = new Headers({ origin: cms });
      if (cookie) headers.set("cookie", cookie);
      if (data) headers.set("content-type", "application/json");
      const response = await request(
        new Request(cms + path, {
          headers,
          method: data || body ? "POST" : "GET",
          body: data ? JSON.stringify(data) : body,
        }),
      );
      const value = await response.text();
      expect(response.status, value.slice(0, 600)).toBe(status);
      if (path.endsWith("/sign-in/email"))
        cookie = response.headers
          .getSetCookie()
          .map((set) => set.split(";")[0])
          .join("; ");
      return JSON.parse(value);
    };
    await call("/api/v1/setup/admin", 201, { data: { email, password, token } });
    await call("/api/auth/sign-in/email", 200, { data: { email, password } });
    const image = await sharp({
      create: { width: 32, height: 24, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append("file", new Blob([image], { type: "image/png" }), "local-preview.png");
    const media = await call("/api/v1/admin/media", 201, { body: form });
    const title = "Reference checkout saved draft";
    const draft = await call("/api/v1/admin/models/posts/entries", 201, {
      data: {
        title,
        slug: "local-draft",
        fields: { publishedAt: "2026-11-21" },
        blocks: [
          {
            key: "image",
            type: "image",
            schemaVersion: 4,
            position: 1000,
            data: { media: media.id },
            settings: { lightbox: true },
          },
        ],
      },
    });
    const browser = await chromium.launch({
      args: [
        `--host-resolver-rules=MAP ${cmsHost} 127.0.0.1, MAP ${previewHost} 127.0.0.1`,
        `--ignore-certificate-errors-spki-list=${tls.spki}`,
        "--no-proxy-server",
      ],
    });
    cleanups.push(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${cms}/admin/content/posts/${draft.id}`);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/entries/${draft.id}/preview`),
    );
    await page.getByRole("button", { name: "Create preview", exact: true }).click();
    const receipt = await created;
    expect(receipt.status()).toBe(202);
    const { id } = await receipt.json();

    const open = page.getByRole("button", { name: "Open preview", exact: true });
    await browserExpect(open).toBeVisible({ timeout: 150_000 });
    const captured = await composePreview(
      "exec",
      "-T",
      "api",
      "node",
      "--no-warnings",
      "-e",
      'const {DatabaseSync}=require("node:sqlite"); const db=new DatabaseSync(process.env.LACE_DATABASE_PATH,{readOnly:true}); console.log(db.prepare("select source_commit from preview_generations where id = ?").get(process.argv[1]).source_commit); db.close()',
      id,
    );
    expect(captured.stdout.trim()).toBe(commit);
    await open.click();
    const opened = context.waitForEvent("page");
    await page.getByRole("dialog").getByRole("link", { name: "Open in new tab" }).click();
    const viewer = await opened;
    const site = viewer.frameLocator("iframe");
    await expect
      .poll(() => site.locator("body").evaluate(() => document.title), { timeout: 15_000 })
      .toBe(title);
    const imageUrl = preview + `/p/${id}/_lace_preview_media/${media.id}.png`;
    const privateAsset = await site.locator("body").evaluate(async (_, url) => {
      const result = await fetch(url);
      return {
        status: result.status,
        bytes: Array.from(new Uint8Array(await result.arrayBuffer())),
      };
    }, imageUrl);
    expect(privateAsset.status).toBe(200);
    expect(Buffer.from(privateAsset.bytes)).toEqual(image);
    expect((await request(new Request(imageUrl))).status).toBe(401);

    const route = join(project, "apps/site/src/pages/preview-dev-reload.astro");
    await writeFile(route, "<html><body><p>Initial Astro page</p></body></html>");
    const reloadUrl = cms + "/preview-dev-reload/";
    await expect
      .poll(async () => (await request(new Request(reloadUrl))).status, { timeout: 15_000 })
      .toBe(200);
    const frontend = await context.newPage();
    const connection = frontend.waitForEvent("websocket");
    await frontend.goto(reloadUrl);
    expect((await connection).url()).toMatch(/^wss:\/\/cms\.lace\.test:/u);
    await writeFile(route, "<html><body><p>Reloaded through the HTTPS gateway</p></body></html>");
    await browserExpect(frontend.getByText("Reloaded through the HTTPS gateway")).toBeVisible();
    await pnpm("dev:stop");
    expect((await composePreview("ps", "--services", "--status", "running")).stdout.trim()).toBe(
      "",
    );
    await pnpm("dev:node");
    expect((await fetch(local + "/health/ready")).status).toBe(200);
    expect((await compose("ps", "--services", "--status", "running")).stdout).not.toContain(
      "preview-",
    );
  } catch (error) {
    const results = await composePreview("logs", "--no-color", "--tail", "12").catch(
      () => undefined,
    );
    if (results?.stdout) console.info(results.stdout.slice(-7000));
    throw error;
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
});
