import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { generateProject } from "../../../packages/create-lace/dist/index.js";
const root = new URL("../../../", import.meta.url).pathname;
const apiRequire = createRequire(new URL("../../../apps/api/package.json", import.meta.url));
const { build } = createRequire(apiRequire.resolve("wrangler/package.json"))("esbuild");

test("generated project bundles production Worker and Node composition with MCP disabled by default", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-mcp-bundles-"));
  try {
    const project = await generateProject({ target: join(parent, "site"), cloudflare: true });
    expect(await readFile(join(project.path, ".env.example"), "utf8")).toContain(
      "LACE_MCP_ENABLED=false",
    );
    expect(await readFile(join(project.path, "worker/.dev.vars.example"), "utf8")).toContain(
      "LACE_MCP_ENABLED=false",
    );
    const alias = Object.fromEntries(
      ["config", "content", "platform-cloudflare"].map((name) => [
        `@lacecms/${name}`,
        join(root, "packages", name, "dist/index.js"),
      ]),
    );
    const worker = await build({
      entryPoints: [join(project.path, "worker/index.ts")],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      conditions: ["workerd", "worker", "browser"],
      external: ["node:*"],
      alias,
      metafile: true,
    });
    const imports = Object.values(worker.metafile.outputs).flatMap((item) =>
      item.imports.map((entry) => entry.path),
    );
    expect(imports.filter((path) => /^(?:node:)?(?:http|https|http2)(?:\/|$)/u.test(path))).toEqual(
      [],
    );
    expect(
      Object.keys(worker.metafile.inputs).some((path) => path.includes("mcp/dist/index.js")),
    ).toBe(true);
    const node = await build({
      entryPoints: [join(root, "apps/api/src/production.ts")],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      target: "node24",
      external: ["better-sqlite3", "sharp", "nodemailer"],
      metafile: true,
    });
    expect(
      Object.keys(node.metafile.inputs).some((path) => path.includes("mcp/dist/index.js")),
    ).toBe(true);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}, 30000);
