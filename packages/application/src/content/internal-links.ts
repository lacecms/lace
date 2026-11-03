import type {
  LinkTargetStatus,
  LinkTargetQuery,
  LinkTargetPage,
  LinkImpactQuery,
  LinkImpactPage,
  LinkImpactAcknowledgment,
  LinkImpactEvidence,
  ContentLinkReadPort,
} from "../ports/links.js";
import { authorizeContentOperation } from "./authority.js";
import { isInternalLinkTargetId } from "@lacecms/content";
import { DomainError } from "@lacecms/domain";
import type { Actor } from "@lacecms/domain";

/** Permissions are checked before input validation or any adapter call. */
export class ContentLinkUseCases {
  public constructor(private readonly links: ContentLinkReadPort) {}
  public resolve(
    actor: Actor,
    ids: readonly string[],
  ): Promise<Readonly<Record<string, LinkTargetStatus>>> {
    authorizeContentOperation(actor, "resolveLinkTargets");
    if (ids.length > 200 || new Set(ids).size !== ids.length || !ids.every(isInternalLinkTargetId))
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "Link target IDs must be valid, distinct and at most 200.",
      );
    return this.links.resolveLinkTargets(ids);
  }
  public list(actor: Actor, query: LinkTargetQuery): Promise<LinkTargetPage> {
    authorizeContentOperation(actor, "listLinkTargets");
    assertLinkPageLimit(query.limit);
    if (
      (query.search?.length ?? 0) > 100 ||
      (query.status !== undefined && query.status !== "published" && query.status !== "unpublished")
    )
      throw new DomainError("CONTENT_INVALID_STATE", "Invalid link target query.");
    return this.links.listLinkTargets({
      ...query,
      ...(query.search === undefined ? {} : { search: query.search.trim() }),
    });
  }
  public impact(actor: Actor, query: LinkImpactQuery): Promise<LinkImpactPage> {
    authorizeContentOperation(actor, "readLinkImpact");
    assertLinkPageLimit(query.limit);
    const locations =
      query.sourceEntryId !== undefined ||
      query.snapshotId !== undefined ||
      query.locationsAfter !== undefined;
    if (
      !isInternalLinkTargetId(query.targetId) ||
      (query.action !== "delete" && query.action !== "unpublish") ||
      (locations &&
        (query.after !== undefined ||
          !isInternalLinkTargetId(query.sourceEntryId) ||
          !isInternalLinkTargetId(query.snapshotId)))
    )
      throw new DomainError("CONTENT_INVALID_STATE", "Invalid link impact query.");
    return this.links.readLinkImpact({ ...query, actorId: actor.id });
  }
}
export function assertLinkPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new DomainError("CONTENT_INVALID_STATE", "Link page limit must be between 1 and 50.");
}

/** Validate an observed precondition only; mutation adapters also enforce authorization guards. */
export function assertLinkImpactAcknowledgment(
  acknowledgment: LinkImpactAcknowledgment | undefined,
  evidence: LinkImpactEvidence,
  hasPublishedUsages: boolean,
): void {
  if (acknowledgment !== undefined) {
    const actual = decodeLinkImpactReceipt(acknowledgment.receipt);
    if (
      acknowledgment.acknowledgePublishedLinks !== true ||
      JSON.stringify(actual) !== JSON.stringify(normalizeEvidence(evidence))
    )
      throw impactChanged();
  } else if (hasPublishedUsages) {
    throw new DomainError(
      "CONTENT_LINKS_IN_USE",
      "Published links use this destination. Review the current link impact before removal.",
    );
  }
}

// The same portable base64url envelope convention used by persistence cursors.
declare function btoa(value: string): string;
declare function atob(value: string): string;
function impactChanged(): DomainError {
  return new DomainError(
    "CONTENT_LINK_IMPACT_CHANGED",
    "Link impact changed. Refresh and review it again.",
  );
}
function normalizeEvidence(value: LinkImpactEvidence): LinkImpactEvidence {
  const keys = [
    "version",
    "targetId",
    "action",
    "actorId",
    "draftRevision",
    "publishedSnapshotId",
    "graphRevision",
  ];
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.version !== 1 ||
    !isInternalLinkTargetId(value.targetId) ||
    !isInternalLinkTargetId(value.actorId) ||
    (value.action !== "delete" && value.action !== "unpublish") ||
    !Number.isSafeInteger(value.draftRevision) ||
    value.draftRevision < 1 ||
    !Number.isSafeInteger(value.graphRevision) ||
    value.graphRevision < 0 ||
    (value.publishedSnapshotId !== null && !isInternalLinkTargetId(value.publishedSnapshotId))
  )
    throw impactChanged();
  return {
    version: 1,
    targetId: value.targetId,
    action: value.action,
    actorId: value.actorId,
    draftRevision: value.draftRevision,
    publishedSnapshotId: value.publishedSnapshotId,
    graphRevision: value.graphRevision,
  };
}
export function encodeLinkImpactReceipt(evidence: LinkImpactEvidence): string {
  const binary = encodeURIComponent(JSON.stringify(normalizeEvidence(evidence))).replace(
    /%([0-9A-F]{2})/gu,
    (_, byte: string) => String.fromCharCode(parseInt(byte, 16)),
  );
  const receipt = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  if (receipt.length > 4096) throw impactChanged();
  return receipt;
}
export function decodeLinkImpactReceipt(receipt: string): LinkImpactEvidence {
  try {
    if (typeof receipt !== "string" || receipt.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(receipt))
      throw impactChanged();
    const binary = atob(receipt.replaceAll("-", "+").replaceAll("_", "/"));
    const json = decodeURIComponent(
      Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
    const evidence = normalizeEvidence(JSON.parse(json) as LinkImpactEvidence);
    if (encodeLinkImpactReceipt(evidence) !== receipt) throw impactChanged();
    return evidence;
  } catch {
    throw impactChanged();
  }
}

/** Convert relative descriptor pointers back into existing aggregate validation paths. */
export function internalLinkIssuePath(
  reference: {
    readonly sourceKey: string;
    readonly area: "fields" | "data";
    readonly pointer: string;
  },
  blockKeys: readonly string[],
): readonly (string | number)[] {
  const relative = reference.pointer
    .slice(1)
    .split("/")
    .map((part) => {
      const decoded = part.replaceAll("~1", "/").replaceAll("~0", "~");
      return /^(0|[1-9][0-9]*)$/u.test(decoded) ? Number(decoded) : decoded;
    });
  return reference.area === "fields"
    ? ["fields", ...relative]
    : ["blocks", blockKeys.indexOf(reference.sourceKey), "data", ...relative];
}
