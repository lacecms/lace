import { AdminClientError, type AdminClient } from "../../shared/api/index.js";
import {
  readCheckpoint,
  writeCheckpoint,
  clearCheckpoint,
  type Checkpoint,
} from "./detach-checkpoint.js";

export interface ConfirmedEntry {
  readonly entryId: string;
  readonly modelKey: string;
}
export async function runDetach(input: {
  client: Pick<AdminClient, "getMedia" | "detachMedia">;
  key: string;
  id: string;
  confirmed: readonly ConfirmedEntry[];
  resume: Checkpoint | null;
  active: () => boolean;
  progress: (plan: Checkpoint) => void;
  attempt: () => void;
}) {
  const { id, key, client } = input;
  let plan = input.resume;
  const live = () => {
    if (!input.active()) throw new Error("Deletion paused. Continue to resume.");
  };
  if (plan) {
    try {
      const current = await client.getMedia(id);
      if (current.status !== "active") {
        clearCheckpoint(key, plan.token);
        throw new Error(
          current.status === "deleting"
            ? "The media is pending deletion."
            : "The previous deletion failed. Refresh the library to retry.",
        );
      }
    } catch (error) {
      if (error instanceof AdminClientError && error.status === 404) {
        clearCheckpoint(key, plan.token);
        throw new Error("This media is no longer in the library.");
      }
      throw error;
    }
  } else {
    const result = await client.detachMedia(id);
    if (!("state" in result)) return result;
    const models = new Map(input.confirmed.map((entry) => [entry.entryId, entry.modelKey]));
    if (
      result.state !== "drafts" ||
      result.drafts.length !== models.size ||
      result.drafts.some((d) => !models.has(d.entryId))
    )
      throw new Error(
        "The entries using this media changed. Review the refreshed list before confirming again.",
      );
    live();
    plan = {
      version: 1,
      token: crypto.randomUUID(),
      next: 0,
      drafts: result.drafts.map((d) => ({ ...d, modelKey: models.get(d.entryId)! })),
    };
    writeCheckpoint(key, plan);
  }
  const token = plan.token;
  const check = () => {
    live();
    if (readCheckpoint(key)?.token !== token)
      throw new Error("This plan changed in another tab. Review current usage.");
  };
  input.progress(plan);
  try {
    while (plan.next < plan.drafts.length) {
      check();
      const { entryId, expectedRevision } = plan.drafts[plan.next]!;
      input.attempt();
      const ack = await client.detachMedia(id, { entryId, expectedRevision });
      if (!("state" in ack) || ack.state !== "entry-complete" || ack.entryId !== entryId)
        throw new Error("The API did not acknowledge the expected entry. Continue to retry.");
      const stored = readCheckpoint(key);
      if (stored?.token !== plan.token)
        throw new Error("This plan changed in another tab. Review current usage.");
      plan = { ...plan, next: Math.max(plan.next + 1, stored.next) };
      writeCheckpoint(key, plan);
      input.progress(plan);
    }
    check();
    const receipt = await client.detachMedia(id, "finish");
    if ("state" in receipt) throw new Error("The API did not confirm pending deletion.");
    clearCheckpoint(key, plan.token);
    return receipt;
  } catch (error) {
    if (
      error instanceof AdminClientError &&
      (error.status === 409 || error.code === "CONTENT_INVALID_STATE")
    )
      clearCheckpoint(key, plan.token);
    throw error;
  }
}
