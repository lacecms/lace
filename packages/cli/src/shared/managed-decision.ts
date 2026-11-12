export type ManagedAction = "preserve" | "current" | "add" | "replace" | "remove" | "conflict";

export interface ManagedDecisionInput {
  /** Whether the baseline record (manifest or lock) lists this path. */
  readonly tracked: boolean;
  readonly baselineHash: string | null;
  readonly currentHash: string | null;
  readonly targetHash: string | null;
}

/**
 * Three-way hash decision shared by template upgrades and block installation.
 * Callers handle ownership rules before asking for a decision.
 */
export function decideManagedFile(input: ManagedDecisionInput): {
  readonly action: ManagedAction;
  readonly reason: string;
} {
  const { tracked, baselineHash, currentHash, targetHash } = input;
  if (!tracked)
    return currentHash === null
      ? { action: "add", reason: "new-managed-file" }
      : { action: "conflict", reason: "untracked-path-exists" };
  if (currentHash === targetHash) return { action: "current", reason: "matches-target" };
  if (baselineHash === targetHash)
    return { action: "preserve", reason: "template-unchanged-local-edit" };
  if (currentHash === baselineHash)
    return { action: targetHash === null ? "remove" : "replace", reason: "matches-baseline" };
  return {
    action: "conflict",
    reason: currentHash === null ? "managed-file-missing" : "managed-file-modified",
  };
}
