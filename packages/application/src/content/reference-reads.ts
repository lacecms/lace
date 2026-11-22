import { isInternalLinkTargetId, MAX_LINK_RESOLVE_IDS } from "@lacecms/content";
import { DomainError, type Actor } from "@lacecms/domain";
import type {
  ContentReferenceReadPort,
  ReferenceImpactQuery,
  ReferenceTargetQuery,
} from "../ports/references.js";
import { authorizeContentOperation } from "./authority.js";
import { assertLinkImpactQuery, assertLinkPageLimit } from "./internal-links.js";

export class ContentReferenceUseCases {
  public constructor(private readonly references: ContentReferenceReadPort) {}

  public list(actor: Actor, query: ReferenceTargetQuery) {
    authorizeContentOperation(actor, "listReferenceTargets");
    assertLinkPageLimit(query.limit);
    if (!isInternalLinkTargetId(query.modelKey) || (query.search?.length ?? 0) > 100)
      throw new DomainError("CONTENT_INVALID_STATE", "Invalid reference target query.");
    return this.references.listReferenceTargets(query);
  }

  public impact(actor: Actor, query: ReferenceImpactQuery) {
    authorizeContentOperation(actor, "readReferenceImpact");
    assertLinkImpactQuery(query);
    return this.references.readReferenceImpact({ ...query, actorId: actor.id });
  }

  public resolve(actor: Actor, ids: readonly string[]) {
    authorizeContentOperation(actor, "resolveReferenceTargets");
    if (
      ids.length > MAX_LINK_RESOLVE_IDS ||
      new Set(ids).size !== ids.length ||
      !ids.every(isInternalLinkTargetId)
    )
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        `Reference target IDs must be valid, distinct and at most ${MAX_LINK_RESOLVE_IDS}.`,
      );
    return this.references.resolveReferenceTargets(ids);
  }
}
