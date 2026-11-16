import type { OpaqueCursor } from "./brands.js";

export interface CursorPageInput {
  readonly after?: OpaqueCursor;
  readonly limit: number;
}

/** A transport-neutral cursor page. Cursors are intentionally opaque to callers. */
export interface CursorPage<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: OpaqueCursor;
}
