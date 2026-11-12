import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

export const probeLimit = 5_000;
export const reportLimit = 30_000;
export const byteLimit = 65_536;
export class ProbeError extends Error {
  public constructor(readonly kind: "unavailable" | "timeout" | "response" | "access") {
    super("Diagnostic probe failed.");
  }
}

export async function boundedFile(path: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > byteLimit) throw new ProbeError("access");
    // A growing file must not bypass the stat-time bound.
    const buffer = Buffer.alloc(byteLimit + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    signal.throwIfAborted();
    if (bytesRead > byteLimit) throw new ProbeError("access");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}

/** Fixed argument arrays only. Terminate the whole process group on cancellation. */
export function boundedProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ProbeError("timeout"));
      return;
    }
    const child = spawn(command, args, {
      cwd,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "true",
        COREPACK_ENABLE_NETWORK: "0",
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        WRANGLER_SEND_METRICS: "false",
      },
    });
    let bytes = 0;
    let output = "";
    let failure: ProbeError | undefined;
    const stop = (kind: ProbeError["kind"]) => {
      failure ??= new ProbeError(kind);
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const abort = () => stop("timeout");
    signal.addEventListener("abort", abort, { once: true });
    const collect = (chunk: Buffer, stdout: boolean) => {
      bytes += chunk.length;
      if (bytes > byteLimit) stop("response");
      else if (stdout) output += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, false));
    child.once("error", () => {
      failure ??= new ProbeError("unavailable");
    });
    child.once("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (failure || code !== 0) reject(failure ?? new ProbeError("unavailable"));
      else resolve(output.trim());
    });
  });
}

export async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProbeError("response");
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      signal.throwIfAborted();
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > byteLimit) throw new ProbeError("response");
      chunks.push(item.value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ProbeError(signal.aborted ? "timeout" : "response");
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export interface DoctorIO {
  readonly file: typeof boundedFile;
  readonly process: typeof boundedProcess;
  readonly request: typeof fetch;
  readonly nodeVersion: string;
}
export const doctorIO: DoctorIO = {
  file: boundedFile,
  process: boundedProcess,
  request: fetch,
  nodeVersion: process.version,
};
