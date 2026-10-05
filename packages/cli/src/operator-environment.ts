import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { CliError, EXIT } from "./index.js";
import { byteLimit } from "./doctor-io.js";
import type { Values } from "./doctor-settings.js";

export const operatorNames = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "LACE_D1_DATABASE_ID",
  "LACE_WRANGLER_CONFIG",
] as const;
export function operatorFileError(): CliError {
  return new CliError(
    "CONFIG",
    "The selected operator file is missing, unsafe or invalid; use a private regular non-symlink file with unique supported assignments and owner-only permissions.",
    EXIT.CONFIG,
    "operator-file",
  );
}
/** Small single-line dotenv grammar; reject ignored or executable-looking assignments. */
export function parseOperatorFile(text: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (
      !match ||
      !operatorNames.includes(match[1] as (typeof operatorNames)[number]) ||
      Object.hasOwn(output, match[1]!)
    )
      throw operatorFileError();
    const raw = match[2]!;
    if (
      (raw.startsWith('"') && !/^"[^"\r\n]*"(?:\s*#.*)?$/u.test(raw)) ||
      (raw.startsWith("'") && !/^'[^'\r\n]*'(?:\s*#.*)?$/u.test(raw)) ||
      (!raw.startsWith('"') && !raw.startsWith("'") && /["'`]/u.test(raw))
    )
      throw operatorFileError();
    const parsed = parseEnv(line);
    if (!Object.hasOwn(parsed, match[1]!)) throw operatorFileError();
    output[match[1]!] = parsed[match[1]!]!;
  }
  return output;
}
export async function readOperatorFile(path: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size > byteLimit ||
      (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    )
      throw operatorFileError();
    const buffer = Buffer.alloc(byteLimit + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    signal?.throwIfAborted();
    if (bytesRead > byteLimit) throw operatorFileError();
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}
export async function resolveOperatorEnvironment(
  path: string | undefined,
  values: Values = process.env,
  cwd = process.cwd(),
  signal?: AbortSignal,
) {
  let fileValues: Values = {};
  if (path !== undefined) {
    try {
      fileValues = parseOperatorFile(await readOperatorFile(resolve(cwd, path), signal));
    } catch {
      throw operatorFileError();
    }
  }
  const merged: Record<string, string | undefined> = {};
  for (const name of operatorNames)
    merged[name] = values[name] === undefined ? fileValues[name] : values[name];
  return {
    values: merged,
    tokenSource:
      values.CLOUDFLARE_API_TOKEN !== undefined
        ? "process"
        : fileValues.CLOUDFLARE_API_TOKEN !== undefined
          ? "operator-file"
          : "absent",
  } as const;
}
