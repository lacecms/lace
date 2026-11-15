/// <reference types="node" />
// The Worker always runs with `nodejs_compat` (Better Auth needs it), which
// provides `AsyncLocalStorage` and propagates it through awaited D1 bindings.
import { AsyncLocalStorage } from "node:async_hooks";

interface PostCommitStore {
  readonly onFirstWork: () => void;
  registered: boolean;
}

const scope = new AsyncLocalStorage<PostCommitStore>();

/**
 * Runs one request in a fresh scope. Its first committed outbox work calls
 * `onFirstWork` at once: a streamed response may end its handler before the
 * work commits, so the scope never waits for the response.
 */
export function run<Result>(onFirstWork: () => void, fn: () => Result): Result {
  return scope.run({ onFirstWork, registered: false }, fn);
}

/** Records committed outbox work for the current request; outside a scope it does nothing. */
export function markOutboxWork(): void {
  const store = scope.getStore();
  if (store === undefined || store.registered) return;
  store.registered = true;
  store.onFirstWork();
}
