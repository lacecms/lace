const maxExecutionMs = 10 * 60_000;

/** Use one watchdog across source staging, install, build and upload. */
export function previewExecutionSignal(startedAt: number, deadline: number, stop: AbortSignal) {
  const remaining = Math.min(startedAt + maxExecutionMs, deadline) - Date.now();
  return AbortSignal.any([
    stop,
    remaining <= 0 ? AbortSignal.abort() : AbortSignal.timeout(remaining),
  ]);
}
