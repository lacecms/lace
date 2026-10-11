const pending = new Set<string>();

/**
 * Asks the next screen that mounts with `target` to take focus once, for
 * navigations whose origin no longer exists (for example after a deletion).
 */
export function requestFocus(target: string): void {
  pending.add(target);
}

/** Returns whether `target` was requested and clears the request. */
export function consumeFocusRequest(target: string): boolean {
  return pending.delete(target);
}
