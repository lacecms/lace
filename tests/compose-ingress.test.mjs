import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

const workspace = resolve(import.meta.dirname, "..");
let root;
const projects = [];
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("LACE_"))),
  LACE_AUTH_SECRET: "test-secret",
  LACE_PUBLIC_BASE_URL: "https://example.test/",
  LACE_MINIO_ROOT_ACCESS_KEY: "test-access",
  LACE_MINIO_ROOT_SECRET: "test-secret",
  LACE_BUILDER_SECRET: "test-secret",
  LACE_BUILD_TOKEN: "test-token",
  LACE_API_IMAGE: "test-api",
  LACE_BUILDER_IMAGE: "test-builder",
  LACE_ADMIN_DEV_ORIGIN: "http://admin:5173",
  LACE_SITE_DEV_ORIGIN: "http://site:4321",
  LACE_DATABASE_PATH: "/workspace/dev-data/lace.sqlite",
  LACE_MINIO_BUCKET: "lace-media",
  LACE_MINIO_ENDPOINT: "http://minio:9000",
  LACE_MINIO_REGION: "us-east-1",
  LACE_MINIO_TIMEOUT_MS: "5000",
};
function config(
  project,
  extra = {},
  dev = false,
  { envFile = "/dev/null", sourceDev = false } = {},
) {
  const files = ["-f", join(project, sourceDev ? "docker-compose.dev.yml" : "docker-compose.yml")];
  if (dev) files.push("-f", join(project, "docker-compose.dev.yml"));
  return JSON.parse(
    execFileSync(
      "docker",
      ["compose", "--env-file", envFile, ...files, "config", "--format", "json"],
      {
        cwd: project,
        env: { ...env, ...extra },
        encoding: "utf8",
      },
    ),
  );
}
function verify(model, host, port, dev = false) {
  const bindings = Object.entries(model.services).filter(([, service]) => service.ports?.length);
  expect(bindings.map(([name]) => name).sort()).toEqual(dev ? ["api", "web"] : ["web"]);
  expect(model.services.web.ports).toMatchObject([
    { host_ip: host, published: String(port), target: 8080 },
  ]);
  if (dev)
    expect(model.services.api.ports).toMatchObject([
      { host_ip: "127.0.0.1", published: "3333", target: 3000 },
    ]);
  expect(Object.keys(model.services.api.networks)).toEqual(
    expect.arrayContaining(["frontend", "backend"]),
  );
}
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "lace-compose-ingress-"));
  for (const mode of ["starter", "existing", "none"]) {
    for (const cloud of [false, true]) {
      const parent = join(root, `${mode}-${cloud}`);
      await mkdir(parent, { recursive: true });
      if (mode === "existing") {
        await writeFile(
          join(parent, "package.json"),
          JSON.stringify({ dependencies: { astro: "1" } }),
        );
        await writeFile(join(parent, "astro.config.mjs"), "export default {};\n");
      }
      const project = join(parent, "cms");
      const flags =
        mode === "existing"
          ? ["--existing-site", ".."]
          : mode === "none"
            ? ["--no-site"]
            : ["--starter"];
      execFileSync(process.execPath, [
        join(workspace, "packages/create-lace/dist/bin.js"),
        project,
        ...flags,
        ...(cloud ? ["--cloudflare"] : []),
      ]);
      projects.push({ project, mode, cloud });
    }
  }
});
afterAll(() => rm(root, { recursive: true, force: true }));
test("repository production Compose binds only Nginx", () => {
  verify(config(workspace), "127.0.0.1", 8080);
  verify(
    config(workspace, { LACE_HTTP_BIND_ADDRESS: "192.0.2.2", LACE_HTTP_PORT: "9090" }),
    "192.0.2.2",
    9090,
  );
});
test("all generated modes resolve production and explicit development bindings", () => {
  for (const { project, mode } of projects) {
    const prod = config(project);
    verify(prod, "127.0.0.1", 8080);
    verify(config(project, { LACE_HTTP_PORT: "9090" }), "127.0.0.1", 9090);
    verify(
      config(project, { LACE_HTTP_BIND_ADDRESS: "192.0.2.2", LACE_HTTP_PORT: "9090" }),
      "192.0.2.2",
      9090,
    );
    verify(config(project, { LACE_HTTP_BIND_ADDRESS: "" }), "127.0.0.1", 8080);
    verify(config(project, { LACE_API_PORT: "3333" }, true), "127.0.0.1", 8080, true);
    expect(Boolean(prod.services.builder)).toBe(mode !== "none");
  }
});
test("repository and generated Compose use the same private, prebuilt storage", async () => {
  const defaultImage = config(workspace).services.minio.image;
  expect(defaultImage).toMatch(/^docker\.io\/pgsty\/silo:RELEASE\.[^@]+@sha256:[a-f0-9]{64}$/u);
  const envFile = join(root, "storage.env");
  for (const override of [undefined, "", "registry.example.test/storage:compatible"]) {
    await writeFile(envFile, override === undefined ? "" : `LACE_MINIO_IMAGE=${override}\n`);
    for (const [project, sourceDev, dev] of [
      [workspace, true, false],
      [workspace, false, false],
      ...projects.flatMap(({ project }) => [
        [project, false, false],
        [project, false, true],
      ]),
    ]) {
      const model = config(project, {}, dev, { envFile, sourceDev });
      const { minio, "minio-init": init, api } = model.services;
      expect(minio.image).toBe(override || defaultImage);
      expect(minio.build).toBeUndefined();
      expect(minio.ports).toBeUndefined();
      expect(minio.command.slice(0, 2)).toEqual(["server", "/data"]);
      expect(minio.healthcheck.test[1]).toContain("/minio/health/live");
      expect(minio.volumes).toMatchObject([
        { type: "volume", source: "minio-data", target: "/data" },
      ]);
      expect(model.volumes["minio-data"].name).toBe(
        sourceDev ? "lace-dev-minio-data" : `${model.name}_minio-data`,
      );
      const network = sourceDev ? "default" : "backend";
      expect(Object.keys(minio.networks)).toEqual([network]);
      expect(Object.keys(init.networks)).toEqual([network]);
      if (!sourceDev) expect(model.networks[network].internal).toBe(true);
      expect(init.environment.LACE_MINIO_ENDPOINT).toBe("http://minio:9000");
      expect(init.depends_on.minio.condition).toBe("service_healthy");
      expect(api.depends_on["minio-init"].condition).toBe("service_completed_successfully");
    }
  }
});
