import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseFrozenPreviewInput } from "@lacecms/sdk/preview";
import type { FrozenPreviewInput } from "@lacecms/sdk/preview";
import { environment } from "../server/environment.js";

export const mediaOriginSetting = "LACE_PREVIEW_LOCAL_MEDIA_ORIGIN";

export const previewInputSetting = "LACE_PREVIEW_INPUT_FILE";

export function readPreviewBuildInput(file: string): FrozenPreviewInput {
  try {
    if (!isAbsolute(file)) throw new Error();
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error();
    return parseFrozenPreviewInput(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    throw new Error(
      `PREVIEW_CONTEXT_CHANGED: ${previewInputSetting} must point to a valid frozen input file.`,
    );
  }
}

export function previewInputFile(): string | undefined {
  return environment[previewInputSetting];
}
