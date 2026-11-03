import type { DispatcherRetryPolicy } from "../ports/infrastructure.js";

export const defaultDispatcherRetryPolicy: DispatcherRetryPolicy = Object.freeze({
  baseDelayMs: 1_000,
  maxAttempts: 8,
  maxDelayMs: 15 * 60_000,
});

export const siteBuildRetryPolicy: DispatcherRetryPolicy = Object.freeze({
  baseDelayMs: 5_000,
  maxAttempts: 8,
  maxDelayMs: 15 * 60_000,
});

/** Calculates full-jitter exponential retry delay without choosing the random sample. */
export function dispatcherRetryDelay(
  policy: DispatcherRetryPolicy,
  failedAttempt: number,
  random: number,
): number {
  if (
    !Number.isSafeInteger(policy.baseDelayMs) ||
    !Number.isSafeInteger(policy.maxDelayMs) ||
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.baseDelayMs < 1 ||
    policy.maxDelayMs < policy.baseDelayMs ||
    policy.maxAttempts < 1 ||
    !Number.isSafeInteger(failedAttempt) ||
    failedAttempt < 1 ||
    !Number.isFinite(random) ||
    random < 0 ||
    random >= 1
  ) {
    throw new TypeError("Dispatcher retry inputs are invalid.");
  }
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  return Math.floor(random * (ceiling + 1));
}
