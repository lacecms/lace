import { hasPermission, DomainError, type Actor, type Permission } from "@lacecms/domain";

/** Every protected content entry point declares one operation here. */
export const contentOperationPermissions = Object.freeze({
  discoverModels: "content:read",
  list: "content:read",
  load: "content:read",
  create: "content:write",
  save: "content:write",
  describeActor: "content:read",
  loadDraft: "content:read",
  loadPublished: "content:read",
  publish: "content:publish",
  unpublish: "content:publish",
  revertDraft: "content:write",
  duplicate: "content:write",
  detachMedia: "content:write",
  delete: "content:write",
  resolveLinkTargets: "content:read",
  listLinkTargets: "content:read",
  readLinkImpact: "content:read",
} satisfies Record<string, Permission>);
export type ContentOperation = keyof typeof contentOperationPermissions;
/** Maximum delegated surface. New operations default to denied. */
export const delegatedContentOperations: readonly ContentOperation[] = Object.freeze([
  "discoverModels",
  "list",
  "load",
  "create",
  "save",
]);
export function canContentOperation(actor: Actor, operation: string): boolean {
  if (!Object.hasOwn(contentOperationPermissions, operation)) return false;
  const permission = contentOperationPermissions[operation as ContentOperation];
  if (!hasPermission(actor, permission)) return false;
  return (
    actor.authority === undefined ||
    (delegatedContentOperations.includes(operation as ContentOperation) &&
      actor.authority.operations.includes(operation))
  );
}
export function authorizeContentOperation(actor: Actor, operation: ContentOperation): void {
  if (!canContentOperation(actor, operation))
    throw new DomainError("AUTHORIZATION_DENIED", "Content operation is not permitted.");
}
