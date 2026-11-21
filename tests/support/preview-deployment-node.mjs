import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { bootstrapSecret, exec, listen } from "./packed-preview-platforms.mjs";
import {
  cmsHost,
  loopbackRequest,
  previewCertificate,
  previewHost,
  previewVpsTls,
} from "./preview-deployment-http.mjs";

async function freePort() {
  const cleanups = [];
  const port = await listen(createServer(), cleanups);
  await cleanups[0]();
  return port;
}

const localSecret = () => randomBytes(32).toString("hex");
const envText = (values) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");

export async function generatedNodePreview({ project, cleanups, vps, tlsDirectory }) {
  const name = `lace-preview-${randomBytes(5).toString("hex")}`;
  const command = (tool, args, extra = {}) =>
    exec(tool, args, {
      cwd: project,
      timeout: 180_000,
      env: { ...process.env, COMPOSE_PROJECT_NAME: name, ...extra },
    });
  const pnpm = (...args) => command("pnpm", args);
  const compose = (...args) => command("docker", ["compose", ...args]);
  const tls = await previewCertificate(tlsDirectory);
  const apiPort = await freePort();
  const webPort = await freePort();
  const tlsPort = vps ? await previewVpsTls(webPort, tls, cleanups) : await freePort();
  const adminOrigin = `https://${cmsHost}:${tlsPort}`;
  const plainOrigin = `http://127.0.0.1:${apiPort}`;
  const previewOrigin = `https://${previewHost}:${tlsPort}`;
  const { stdout } = await pnpm("env:prepare");
  expect(stdout).toContain(".env");
  const envFile = join(project, ".env");
  const base = await readFile(envFile, "utf8");
  cleanups.push(() => rm(envFile, { force: true }));
  const initialSettings = {
    LACE_API_IMAGE: process.env.LACE_TEST_PREVIEW_API_IMAGE,
    LACE_BUILDER_IMAGE: process.env.LACE_TEST_PREVIEW_BUILDER_IMAGE,
    LACE_API_PORT: apiPort,
    LACE_HTTP_PORT: webPort,
    LACE_DEV_HTTPS_PORT: tlsPort,
    LACE_DEV_TLS_CERT: join(tlsDirectory, "cert.pem"),
    LACE_DEV_TLS_KEY: join(tlsDirectory, "key.pem"),
    LACE_BUILD_SITE_URL: adminOrigin + "/",
    LACE_PREVIEW_ORIGIN: previewOrigin + "/",
    LACE_PREVIEW_BUILDER_SECRET: localSecret(),
    LACE_DEV_PREVIEW_BUILDER_SECRET: localSecret(),
    LACE_DEV_PREVIEW_SITE_URL: adminOrigin + "/",
  };
  let buildToken = "";
  let started = false;
  cleanups.push(() => compose("down", "--volumes", "--remove-orphans"));
  const configure = async (mode) => {
    const localTls = mode !== undefined;
    const origin = vps || localTls ? adminOrigin : plainOrigin;
    const values = {
      ...initialSettings,
      LACE_PUBLIC_BASE_URL: origin + "/",
      LACE_API_BASE_URL: origin + "/",
      LACE_BUILD_TOKEN: buildToken,
      LACE_PREVIEW_RUNNER_SECRET: mode === "incomplete" ? "" : bootstrapSecret,
      LACE_DEV_PREVIEW_RUNNER_SECRET: mode === "incomplete" ? "" : bootstrapSecret,
      ...(mode !== undefined && { LACE_PREVIEW_ENABLED: String(mode !== "off") }),
    };
    // Retain all preview settings while testing default-off and withdrawal.
    const managed = new Set([...Object.keys(values), "LACE_PREVIEW_ENABLED"]);
    const ordinary = base
      .split("\n")
      .filter((line) => !managed.has(line.split("=")[0]))
      .join("\n");
    await writeFile(envFile, ordinary + "\n" + envText(values), { mode: 0o600 });
    if (vps) {
      await compose("config", "--quiet");
      if (started) {
        if (buildToken) await pnpm("prod:start");
        else await compose("up", "-d", "--wait", "web");
      }
    } else {
      const files = ["-f", "docker-compose.yml", "-f", "docker-compose.dev.yml"];
      if (localTls) files.push("-f", "docker-compose.dev.preview.yml");
      const resolved = JSON.parse((await compose(...files, "config", "--format", "json")).stdout);
      if (localTls) {
        expect(resolved.services.api.ports).toBeUndefined();
        expect(resolved.services["preview-builder"].ports).toBeUndefined();
        expect(resolved.services["preview-builder"].volumes.map(({ target }) => target)).toEqual([
          "/source",
        ]);
        expect(resolved.services["preview-web"].ports[0].host_ip).toBe("127.0.0.1");
      } else {
        expect(resolved.services["preview-builder"]).toBeUndefined();
        expect(resolved.services["preview-web"]).toBeUndefined();
      }
      if (started) await pnpm(localTls ? "dev:api:preview" : "dev:api");
    }
    return origin;
  };
  await configure(undefined);
  await pnpm("db:migrate", "--json");
  await pnpm("content:sync", "--json");
  const setup = JSON.parse((await pnpm("auth:bootstrap", "--json")).stdout).data.token;
  started = true;
  const initialOrigin = await configure(undefined);
  const fetch = loopbackRequest(tls.cert);
  await expect
    .poll(
      async () => {
        const response = await fetch(new Request(initialOrigin + "/health/ready"));
        return response.status;
      },
      { timeout: 60_000 },
    )
    .toBe(200);
  return {
    adminOrigin,
    initialOrigin,
    previewOrigin,
    configure,
    fetch,
    tls,
    setupToken: async () => setup,
    buildToken: (token) => {
      buildToken = token;
    },
    async waitRelease() {
      if (!vps) return null;
      await expect
        .poll(async () => (await fetch(new Request(adminOrigin + "/"))).status, {
          timeout: 150_000,
          interval: 500,
        })
        .toBe(200);
      return (await fetch(new Request(adminOrigin + "/"))).text();
    },
    async privateRequest(path, service = "api:3000", init) {
      const result = await compose(
        "exec",
        "-T",
        "api",
        "node",
        "-e",
        "const r=await fetch(process.argv[1],JSON.parse(process.argv[2])); console.log(r.status)",
        "http://" + service + path,
        JSON.stringify(init ?? {}),
      );
      return Number(result.stdout.trim());
    },
    async previewCommit(id) {
      const result = await compose(
        "exec",
        "-T",
        "api",
        "node",
        "--no-warnings",
        "-e",
        'const {DatabaseSync}=require("node:sqlite"); const db=new DatabaseSync(process.env.LACE_DATABASE_PATH,{readOnly:true}); console.log(db.prepare("select source_commit from preview_generations where id = ?").get(process.argv[1]).source_commit); db.close()',
        id,
      );
      return result.stdout.trim();
    },
    editorAccount: async (email) => {
      await compose(
        "exec",
        "-T",
        "api",
        "node",
        "--no-warnings",
        "-e",
        'const {DatabaseSync}=require("node:sqlite"); const db=new DatabaseSync(process.env.LACE_DATABASE_PATH); db.prepare("update user set role = ? where email = ?").run("editor", process.argv[1]); db.close()',
        email,
      );
    },
    diagnostics: async () => {
      const result = await compose("logs", "--no-color", "api", "builder");
      return result.stdout;
    },
  };
}
