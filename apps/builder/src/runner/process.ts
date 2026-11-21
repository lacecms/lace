import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

function groupSignal(pid: number, signal: 0 | "SIGKILL"): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

export function builderNamespaceIsSupervised(): boolean {
  try {
    return process.ppid === 1 && readFileSync("/proc/1/comm", "utf8").trim() === "tini";
  } catch {
    return false;
  }
}

/** The container PID 1 reaps descendants and closes the namespace if the builder exits. */
export async function runBuildProcess(input: {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly signal: AbortSignal;
  readonly phase: string;
  readonly stdin?: string;
  readonly processGroup?: boolean;
}): Promise<{ readonly success: boolean; readonly output: string }> {
  if (input.signal.aborted) return { success: false, output: "" };
  const child = spawn(input.executable, input.args, {
    cwd: input.cwd,
    env: input.env,
    detached: input.processGroup ?? true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let diagnostics = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output = (output + chunk).slice(-2 * 1024 * 1024);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk).slice(-16_384);
  });
  child.stdin.on("error", () => {});
  child.stdin.end(input.stdin);
  const pid = input.processGroup === false ? undefined : child.pid;
  const stop = () => {
    if (pid !== undefined) groupSignal(pid, "SIGKILL");
    else child.kill("SIGKILL");
  };
  input.signal.addEventListener("abort", stop, { once: true });
  try {
    const result = await new Promise<{
      readonly code: number | null;
      readonly signal: string | null;
    }>((resolve) => {
      child.once("error", () => resolve({ code: null, signal: null }));
      child.once("exit", (code, signal) => {
        // Descendants may still hold a pipe after their direct parent exits.
        stop();
        child.once("close", () => resolve({ code, signal }));
      });
    });
    if (pid !== undefined) {
      // Briefly allow tini to reap processes killed by the group signal.
      for (let attempt = 0; attempt < 100 && groupSignal(pid, 0); attempt++) await delay(10);
      if (groupSignal(pid, 0)) {
        console.error(
          JSON.stringify({
            component: "builder-tool",
            phase: input.phase,
            failure: "group_not_stopped",
          }),
        );
        process.exit(1);
      }
    }
    const success = result.code === 0 && !input.signal.aborted;
    if (!success) {
      const logs = output.slice(-16_384) + diagnostics;
      const failure = input.signal.aborted
        ? "timeout"
        : result.code === null && result.signal === null
          ? "spawn_failed"
          : /ENOSPC|no space left on device/iu.test(logs)
            ? "disk_full"
            : /ENOMEM|out of memory|heap out of memory/iu.test(logs)
              ? "memory_exhausted"
              : /EACCES|permission denied/iu.test(logs)
                ? "permission_denied"
                : /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)/iu.test(logs)
                  ? "missing_dependency"
                  : /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/iu.test(logs)
                    ? "network_unavailable"
                    : result.signal !== null
                      ? "signal"
                      : "command_failed";
      console.error(JSON.stringify({ component: "builder-tool", phase: input.phase, failure }));
    }
    return { success, output };
  } finally {
    input.signal.removeEventListener("abort", stop);
  }
}
