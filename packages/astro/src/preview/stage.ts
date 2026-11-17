import { open, mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { createPreviewInputClient } from "@lacecms/sdk/preview";
import { capturedOriginals, originalsDirectory } from "./originals.js";

const fileLimit = 10 * 1024 * 1024;
const totalLimit = 100 * 1024 * 1024;

async function stageOriginal(
  response: Response,
  destination: string,
  limit: number,
): Promise<number> {
  const reader = response.body?.getReader();
  if (reader === undefined)
    throw new Error("PREVIEW_CONTEXT_CHANGED: missing original media bytes.");
  const file = await open(destination, "wx", 0o600);
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit)
        throw new Error("PREVIEW_RESOURCE_LIMIT: staged originals exceed the media budget.");
      // writeFile on the handle uses the current offset and completes partial writes.
      await file.writeFile(chunk.value);
    }
    if (bytes === 0) throw new Error("PREVIEW_CONTEXT_CHANGED: empty original media.");
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    await file.close();
  }
}

/** Trusted-runner preparation. Pass only the returned input path to the Astro subprocess. */
export async function stageAstroPreviewInput(
  directory: string,
  client: ReturnType<typeof createPreviewInputClient>,
  signal?: AbortSignal,
): Promise<string> {
  if (!isAbsolute(directory))
    throw new TypeError("The preview scratch directory must be absolute.");
  const input = await client.input(signal);
  await mkdir(directory, { mode: 0o700 });
  try {
    await mkdir(join(directory, originalsDirectory), { mode: 0o700 });
    let bytes = 0;
    for (const [path, item] of capturedOriginals(input)) {
      const response = await client.original(item.id, signal);
      if (response.headers.get("content-type") !== item.mimeType) {
        await response.body?.cancel();
        throw new Error("PREVIEW_CONTEXT_CHANGED: captured media type differs from the original.");
      }
      bytes += await stageOriginal(
        response,
        join(directory, path),
        Math.min(fileLimit, totalLimit - bytes),
      );
    }
    const file = join(directory, "input.json");
    await writeFile(file, JSON.stringify(input), { mode: 0o600, flag: "wx" });
    return file;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
