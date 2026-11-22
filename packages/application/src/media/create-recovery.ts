import type { MediaId } from "@lacecms/domain";
import type { MediaCreateOutcome, MediaUploadOwnershipPort } from "../ports/media.js";

export async function resolveMediaUploadFailure(
  repository: MediaUploadOwnershipPort,
  id: MediaId,
  storageKey: string,
  outcome: MediaCreateOutcome,
): Promise<"preserve" | "cleanup" | "unresolved"> {
  if (outcome === "committed") return "preserve";

  try {
    const ownership = await repository.checkMediaUploadOwnership(id, storageKey);
    if (ownership === "matching" && outcome !== "rolled-back") return "preserve";
    if (ownership === "absent" && (outcome === "rolled-back" || outcome === "unknown-settled")) {
      return "cleanup";
    }
  } catch {
    // An unavailable authoritative read cannot establish that deletion is safe.
  }
  return "unresolved";
}
