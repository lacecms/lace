import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import type { FrozenPreviewInput } from "@lacecms/sdk/preview";

export const originalsDirectory = "_lace_preview_media";
const extensions: ReadonlyMap<string, string> = new Map([
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function originalPath(item: { readonly id: string; readonly mimeType: string }): string {
  const extension = extensions.get(item.mimeType);
  if (extension === undefined || !/^[a-z0-9_-]+$/iu.test(item.id))
    throw new Error("PREVIEW_CONTEXT_CHANGED: invalid captured media.");
  return `${originalsDirectory}/${item.id}.${extension}`;
}

export function capturedOriginals(input: FrozenPreviewInput) {
  const items = Object.values({ ...input.context.media, ...input.targetMedia });
  if (items.length > 2000) throw new Error("PREVIEW_RESOURCE_LIMIT: too many captured media.");
  return new Map(items.map((item) => [originalPath(item), item]));
}

export async function copyPreviewOriginals(
  source: string,
  output: string,
  usedPaths: ReadonlySet<string>,
) {
  if (usedPaths.size === 0) return;
  await mkdir(join(output, originalsDirectory));
  for (const path of usedPaths) {
    const file = join(source, path);
    if (!(await lstat(file)).isFile())
      throw new Error("PREVIEW_CONTEXT_CHANGED: a captured media original is missing.");
    await copyFile(file, join(output, path));
  }
}

/** Exposes detached files on loopback only, so Astro's ordinary image pipeline can optimize them. */
export async function servePreviewOriginals(file: string, input: FrozenPreviewInput) {
  const items = capturedOriginals(input);
  const used = new Set<string>();
  const server = createServer(async (request, response) => {
    const path = request.url?.slice(1) ?? "";
    const item = items.get(path);
    if (request.method !== "GET" || item === undefined) {
      response.writeHead(404).end();
      return;
    }
    const source = join(dirname(file), path);
    const stat = await lstat(source).catch(() => undefined);
    if (!stat?.isFile()) {
      response.writeHead(404).end();
      return;
    }
    used.add(item.id);
    response.writeHead(200, {
      "content-type": item.mimeType,
      "content-length": stat.size,
      "cache-control": "private, no-store",
    });
    const stream = createReadStream(source);
    stream.on("error", () => response.destroy());
    response.on("close", () => stream.destroy());
    stream.pipe(response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject).listen(0, "127.0.0.1", resolve);
  }).catch(() => {
    throw new Error("PREVIEW_DEPENDENCY_FAILED: cannot start the local Astro media source.");
  });
  server.unref();
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Local media source unavailable.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: String(address.port),
    used,
    close: () => server.close(),
  };
}
