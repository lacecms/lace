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
};
function config(project, extra = {}, dev = false) {
  const files = ["-f", join(project, "docker-compose.yml")];
  if (dev) files.push("-f", join(project, "docker-compose.dev.yml"));
  return JSON.parse(
    execFileSync(
      "docker",
      ["compose", "--env-file", "/dev/null", ...files, "config", "--format", "json"],
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
