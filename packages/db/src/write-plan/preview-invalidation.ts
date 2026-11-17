import type { WritePlanGuard, WritePlanStatement } from "./plan.js";

/** Logical denial shares the caller's success guard. Cleanup and executor recovery are separate. */
export function invalidatePreviews(
  target: "entry" | "model" | "media",
  id: string,
  now: number,
  guard: WritePlanGuard,
): WritePlanStatement {
  const matching = {
    entry: "entry_id = ?",
    model: "model_key = ?",
    media: "id in (select generation_id from preview_media_dependencies where media_id = ?)",
  };
  return {
    checkpoint: "preview.invalidate",
    sql: `update preview_generations set state = 'invalidated', ended_at = ?
      where ${matching[target]} and state in ('preparing','dispatched','running','ready') and ${guard.sql}`,
    params: [now, id, ...guard.params],
  };
}
