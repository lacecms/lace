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
  listReferenceTargets: "content:read",
  resolveReferenceTargets: "content:read",
  readReferenceImpact: "content:read",
  readLinkImpact: "content:read",
} satisfies Record<string, Permission>);
export type ContentOperation = keyof typeof contentOperationPermissions;

/** Maximum delegated surface. New operations default to denied. */
export const mcpContentOperations = Object.freeze({
  list_content_models: "discoverModels",
  list_entries: "list",
  get_entry: "load",
  create_entry: "create",
  save_draft: "save",
  publish_entry: "publish",
} satisfies Record<string, ContentOperation>);

export const delegatedContentOperations: readonly ContentOperation[] = Object.freeze(
  Object.values(mcpContentOperations),
);

export function mcpToolScope(name: unknown) {
  if (typeof name !== "string" || !Object.hasOwn(mcpContentOperations, name)) return undefined;
  return contentOperationPermissions[
    mcpContentOperations[name as keyof typeof mcpContentOperations]
  ];
}

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
