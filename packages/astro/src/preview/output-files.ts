import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";
import { defaultPreviewPackageLimits, previewArtifactContentType } from "@lacecms/sdk/preview";
import type { PreviewPackageLimits } from "@lacecms/sdk/preview";

export const renderReport = "render-report.json";

const hostingFiles = new Set(["robots.txt", "sitemap.xml", "_headers", "_redirects"]);

export function previewPackageLimits(
  overrides: Partial<PreviewPackageLimits> = {},
): PreviewPackageLimits {
  const limits = { ...defaultPreviewPackageLimits, ...overrides };
  for (const key of Object.keys(defaultPreviewPackageLimits) as (keyof PreviewPackageLimits)[]) {
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] < 1 ||
      limits[key] > defaultPreviewPackageLimits[key]
    )
      throw new Error(
        "PREVIEW_RESOURCE_LIMIT: preview package limits may only lower the default budgets.",
      );
  }
  return limits;
}

export function expectedHtml(path: string): string {
  return `${path === "/" ? "" : `${path.slice(1)}/`}index.html`;
}

export interface OutputFile {
  readonly bytes: number;
  readonly type: string;
}

export async function inspectPreviewOutput(
  directory: string,
  html: string,
  limits: PreviewPackageLimits = defaultPreviewPackageLimits,
): Promise<ReadonlyMap<string, OutputFile>> {
  const files = new Map<string, OutputFile>();
  let walked = 0;
  let total = 0;
  async function visit(relative: string): Promise<void> {
    const entries = await opendir(join(directory, relative));
    for await (const entry of entries) {
      const path = relative + entry.name;
      if (++walked > defaultPreviewPackageLimits.files * 2)
        throw new Error("PREVIEW_RESOURCE_LIMIT: preview output has too many filesystem entries.");
      if (
        path.length > 512 ||
        !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u.test(entry.name) ||
        entry.name.endsWith(".")
      )
        throw new Error("PREVIEW_RENDER_FAILED: preview output contains an unsupported path.");
      if (entry.isDirectory()) {
        await visit(path + "/");
        continue;
      }
      const stat = await lstat(join(directory, path));
      if (!stat.isFile() || stat.nlink !== 1)
        throw new Error(
          "PREVIEW_RENDER_FAILED: preview output must contain only regular, unlinked files.",
        );
      if (hostingFiles.has(path) || /^sitemap(?:-\d+|-index)\.xml$/u.test(path)) continue;
      const type = previewArtifactContentType(path);
      if (type === undefined)
        throw new Error(
          "PREVIEW_RENDER_FAILED: preview output contains an unsupported file type or reserved path.",
        );
      if (type.startsWith("text/html") && path !== html) continue;
      total += stat.size;
      if (
        stat.size > limits.perFileBytes ||
        total > limits.totalBytes ||
        files.size >= limits.files
      )
        throw new Error("PREVIEW_RESOURCE_LIMIT: preview output exceeds the file or byte budget.");
      files.set(path, { bytes: stat.size, type });
    }
  }
  const root = await lstat(directory).catch(() => undefined);
  if (!root?.isDirectory())
    throw new Error(
      "PREVIEW_CONFIGURATION_UNAVAILABLE: preview output is missing. Configure lacePreview() in Astro.",
    );
  await visit("");
  if (!files.get(html)?.bytes)
    throw new Error("PREVIEW_RENDER_FAILED: Astro did not write the selected preview HTML.");
  return files;
}
