import { MAX_MEDIA_USAGE_ENTRIES } from "@lacecms/contracts";
import * as v from "valibot";

const schema = v.strictObject({
  version: v.literal(1),
  token: v.string(),
  drafts: v.pipe(
    v.array(
      v.strictObject({
        entryId: v.pipe(v.string(), v.nonEmpty()),
        expectedRevision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
        modelKey: v.string(),
      }),
    ),
    v.minLength(1),
    v.maxLength(MAX_MEDIA_USAGE_ENTRIES),
  ),
  next: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type Checkpoint = v.InferOutput<typeof schema>;

// localStorage is scoped to this installation's origin.
export const checkpointKey = (actor: string, media: string) =>
  "lace.media.detach." + JSON.stringify([actor, media]);
export function readCheckpoint(key: string): Checkpoint | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const result = v.safeParse(schema, JSON.parse(raw));
    if (
      result.success &&
      result.output.next <= result.output.drafts.length &&
      new Set(result.output.drafts.map((d) => d.entryId)).size === result.output.drafts.length
    )
      return result.output;
  } catch {
    /* Missing storage starts a fresh review. */
  }
  return null;
}
export function clearCheckpoint(key: string, token?: string) {
  try {
    if (token === undefined || readCheckpoint(key)?.token === token) localStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}
export function writeCheckpoint(key: string, plan: Checkpoint) {
  try {
    localStorage.setItem(key, JSON.stringify(plan));
  } catch {
    throw new Error(
      "Progress could not be saved in this browser. Enable site storage and review current usage.",
    );
  }
}

export function discardMediaDetachCheckpoint(actor: string, media: string) {
  clearCheckpoint(checkpointKey(actor, media));
}
