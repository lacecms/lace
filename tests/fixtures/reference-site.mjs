import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL("../../", import.meta.url));

export function referenceSiteExport() {
  const content = {
    fields: {},
    blocks: [],
    internalLinks: [],
    publishedAt: "2026-09-20T00:00:00.000Z",
  };
  const home = { ...content, id: "home", modelKey: "home", path: "/", title: "Service" };
  return {
    formatVersion: 2,
    version: 1,
    records: ["Anna", "Boris", "Clara"].map((title) => ({
      ...content,
      title,
      id: title,
      modelKey: "testimonials",
    })),
    globals: [],
    media: {},
    seo: { defaults: null, models: {} },
    entries: [
      {
        ...home,
        blocks: [
          {
            key: "reviews",
            type: "selection",
            position: 0,
            schemaVersion: 1,
            data: { reviews: ["Clara", "Anna", "Boris"] },
          },
        ],
      },
    ],
  };
}

/** Build the same site-owned route and block from a published or detached preview export. */
export async function buildReferenceSite(
  exported,
  previewClient,
  modules = join(workspace, "apps/site/node_modules"),
) {
  const directory = await mkdtemp(join(tmpdir(), "lace-reference-site-"));
  try {
    const pages = join(directory, "src/pages");
    const blocks = join(directory, "src/blocks");
    await Promise.all([mkdir(pages, { recursive: true }), mkdir(blocks, { recursive: true })]);
    await symlink(modules, join(directory, "node_modules"));
    await Promise.all([
      copyFile(
        new URL("./reference-site/index.astro", import.meta.url),
        join(pages, "index.astro"),
      ),
      ...["SelectionBlock.astro", "definition.ts"].map((file) =>
        copyFile(new URL(`./reference-site/${file}`, import.meta.url), join(blocks, file)),
      ),
      writeFile(join(directory, "package.json"), JSON.stringify({ type: "module" })),
      writeFile(join(directory, "published.json"), JSON.stringify(exported)),
      writeFile(
        join(directory, "astro.config.mjs"),
        'import { lacePreview } from "@lacecms/astro/preview";\nexport default { integrations: [lacePreview()] };\n',
      ),
    ]);
    const preview = previewClient
      ? await import("../../packages/astro/dist/preview.js")
      : undefined;
    const input = await preview?.stageAstroPreviewInput(join(directory, "scratch"), previewClient);
    await execute("pnpm", ["exec", "astro", "build"], {
      cwd: directory,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_PREVIEW_INPUT_FILE: input,
      },
    });
    if (!input) return { html: await readFile(join(directory, "dist", "index.html"), "utf8") };
    const packaged = await preview.packageAstroPreview(input);
    const files = await Promise.all(
      packaged.manifest.files.map(async ({ path, contentType }) => ({
        path,
        contentType,
        body: await readFile(join(packaged.directory, path)),
      })),
    );
    const html = files.find((file) => file.path === packaged.manifest.html).body.toString("utf8");
    return { html, files, mediaIds: packaged.mediaIds };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
