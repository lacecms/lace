import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FrozenPreviewInput } from "@lacecms/sdk/preview";
import { expectedHtml, inspectPreviewOutput, renderReport } from "./output-files.js";
import { transformPreviewHtml } from "./html.js";
import { rewriteCssUrls } from "./resource-values.js";
import { previewUrls } from "./urls.js";
import { capturedOriginals, copyPreviewOriginals } from "./originals.js";

export async function finishPreviewRender(
  scratch: string,
  input: FrozenPreviewInput,
  optimizedMedia: ReadonlySet<string>,
) {
  const output = join(scratch, "render");
  const html = expectedHtml(input.target.path);
  const prefix = `/p/${input.generationId}/`;
  const media = capturedOriginals(input);
  const originals = new Set<string>();
  const candidates = new Set(media.keys());
  const assets = new Set((await inspectPreviewOutput(output, html)).keys());
  const entryFile = join(output, html);
  const content = await readFile(entryFile, "utf8");
  const pagePath = input.target.path === "/" ? "/" : input.target.path + "/";
  await writeFile(
    entryFile,
    transformPreviewHtml(
      content,
      previewUrls(prefix, input.siteUrl, pagePath, assets, candidates, originals),
    ),
  );
  for (const path of assets) {
    if (!path.endsWith(".css")) continue;
    const file = join(output, path);
    const css = await readFile(file, "utf8");
    const urls = previewUrls(prefix, input.siteUrl, "/" + path, assets, candidates, originals);
    const rewritten = rewriteCssUrls(css, urls.resource);
    if (rewritten !== css) await writeFile(file, rewritten);
  }
  const used = new Set(optimizedMedia);
  for (const path of originals) used.add(media.get(path)!.id);
  await copyPreviewOriginals(scratch, output, originals);
  await writeFile(
    join(scratch, renderReport),
    JSON.stringify({
      generationId: input.generationId,
      html,
      mediaIds: [...used].sort(),
    }),
    { flag: "wx", mode: 0o600 },
  );
}
