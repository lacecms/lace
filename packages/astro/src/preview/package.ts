import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parsePreviewManifest } from "@lacecms/sdk/preview";
import type {
  PreviewPackageFile,
  PreviewPackageLimits,
  PreviewPackageManifest,
} from "@lacecms/sdk/preview";
import { readPreviewBuildInput } from "./build-input.js";
import { capturedOriginals, originalsDirectory } from "./originals.js";
import {
  expectedHtml,
  inspectPreviewOutput,
  previewPackageLimits,
  renderReport,
} from "./output-files.js";
import { renderOrigin } from "./urls.js";

export interface AstroPreviewPackageOptions {
  readonly limits?: Partial<PreviewPackageLimits>;
  /** Known credentials or private values to check for in the trusted runner. */
  readonly forbiddenValues?: readonly string[];
}

export interface AstroPreviewPackage {
  readonly directory: string;
  readonly manifest: PreviewPackageManifest;
  readonly mediaIds: readonly string[];
}

async function readReport(
  scratch: string,
  generationId: string,
  html: string,
  media: ReadonlySet<string>,
) {
  try {
    const file = join(scratch, renderReport);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 512 * 1024) throw new Error();
    const result = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    const ids = result.mediaIds as unknown;
    if (
      Object.keys(result).length !== 3 ||
      result.generationId !== generationId ||
      result.html !== html ||
      !Array.isArray(ids) ||
      ids.length > media.size ||
      !ids.every((id: unknown): id is string => typeof id === "string" && media.has(id)) ||
      new Set(ids).size !== ids.length
    )
      throw new Error();
    return ids as string[];
  } catch {
    throw new Error(
      "PREVIEW_CONFIGURATION_UNAVAILABLE: missing or invalid single-route Astro preview report. Check lacePreview() in the selected source.",
    );
  }
}

/** The trusted runner calls this after Astro exits and uploads only manifest-listed files. */
export async function packageAstroPreview(
  inputFile: string,
  options: AstroPreviewPackageOptions = {},
): Promise<AstroPreviewPackage> {
  const input = readPreviewBuildInput(inputFile);
  const scratch = dirname(inputFile);
  const directory = join(scratch, "render");
  const html = expectedHtml(input.target.path);
  const captured = capturedOriginals(input);
  const mediaIds = await readReport(
    scratch,
    input.generationId,
    html,
    new Set([...captured.values()].map(({ id }) => id)),
  );
  const reported = new Set(mediaIds);
  const limits = previewPackageLimits(options.limits);
  const candidates = await inspectPreviewOutput(directory, html, limits);
  const files: PreviewPackageFile[] = [];
  const forbidden = [
    scratch,
    inputFile,
    renderOrigin,
    "http://127.0.0.1:",
    ...(options.forbiddenValues ?? []),
  ].filter(Boolean);
  for (const [path, file] of [...candidates].sort(([a], [b]) => (a < b ? -1 : a === b ? 0 : 1))) {
    if (path.startsWith(originalsDirectory + "/") && !reported.has(captured.get(path)?.id ?? ""))
      throw new Error("PREVIEW_RENDER_FAILED: preview output contains undeclared original media.");
    const body = await readFile(join(directory, path));
    if (body.byteLength !== file.bytes || forbidden.some((text) => body.includes(text)))
      throw new Error(
        "PREVIEW_RENDER_FAILED: preview output contains private build information or changed during packaging.",
      );
    if (
      /\.(?:[cm]?js|css|html)$/iu.test(path) &&
      /[#@]\s*sourceMappingURL\s*=/u.test(body.toString("utf8"))
    )
      throw new Error("PREVIEW_RENDER_FAILED: source maps are unsupported in preview output.");
    if (file.type === "application/json" && looksLikeFrozenInput(body))
      throw new Error("PREVIEW_RENDER_FAILED: preview output contains frozen build input.");
    files.push({
      path,
      contentType: file.type,
      bytes: file.bytes,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
  }
  const manifest = parsePreviewManifest({ schemaVersion: 1, html, files }, limits);
  if (manifest === null || Buffer.byteLength(JSON.stringify(manifest)) > limits.manifestBytes)
    throw new Error("PREVIEW_RESOURCE_LIMIT: the preview manifest exceeds its validation budget.");
  return { directory, manifest, mediaIds: Object.freeze(mediaIds) };
}

function looksLikeFrozenInput(body: Buffer): boolean {
  try {
    const value: unknown = JSON.parse(body.toString("utf8"));
    return (
      typeof value === "object" &&
      value !== null &&
      "generationId" in value &&
      "target" in value &&
      "context" in value
    );
  } catch {
    return false;
  }
}
