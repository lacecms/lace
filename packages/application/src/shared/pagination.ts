import type { OpaqueCursor } from "./brands.js";

/** A transport-neutral cursor page. Cursors are intentionally opaque to callers. */
export interface CursorPage<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: OpaqueCursor;
}
