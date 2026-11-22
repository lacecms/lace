import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL("../../", import.meta.url));

/** Build the same site-owned route and block from a published or detached preview export. */
export async function buildReferenceSite(exported, previewClient) {
  const directory = await mkdtemp(join(tmpdir(), "lace-reference-site-"));
  try {
    const pages = join(directory, "src/pages");
    const blocks = join(directory, "src/blocks");
    await Promise.all([mkdir(pages, { recursive: true }), mkdir(blocks, { recursive: true })]);
    await symlink(join(workspace, "apps/site/node_modules"), join(directory, "node_modules"));
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
    const { stageAstroPreviewInput, packageAstroPreview } =
      await import("../../packages/astro/dist/preview.js");
    const input = previewClient
      ? await stageAstroPreviewInput(join(directory, "scratch"), previewClient)
      : undefined;
    await execute("pnpm", ["exec", "astro", "build"], {
      cwd: directory,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_PREVIEW_INPUT_FILE: input,
      },
    });
    if (!input) return { html: await readFile(join(directory, "dist", "index.html"), "utf8") };
    const packaged = await packageAstroPreview(input);
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
