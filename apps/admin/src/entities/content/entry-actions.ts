/** The lifecycle actions an entry menu offers; each mirrors the API's permission rule. */
export interface EntryActions {
  readonly delete: boolean;
  readonly duplicate: boolean;
  readonly revert: boolean;
  readonly unpublish: boolean;
}

/**
 * Which lifecycle actions to offer for an entry. Visibility is a convenience:
 * the API stays the authorization boundary. A published entry's deletion also
 * needs `content:publish`, and pages are never duplicated or deleted.
 */
export function entryActions(input: {
  readonly canPublish: boolean;
  readonly canWrite: boolean;
  readonly kind: "collection" | "page";
  readonly published: boolean;
  /** The saved draft's revision differs from the published revision. */
  readonly savedChanges: boolean;
  /** The editor form differs from the saved draft. */
  readonly unsavedChanges: boolean;
}): EntryActions {
  const collection = input.kind === "collection";
  return {
    delete: input.canWrite && collection && (!input.published || input.canPublish),
    duplicate: input.canWrite && collection,
    revert: input.canWrite && input.published && (input.savedChanges || input.unsavedChanges),
    unpublish: input.canPublish && input.published,
  };
}

/** Whether any action is offered, so callers can omit an empty menu. */
export function hasEntryActions(actions: EntryActions): boolean {
  return actions.delete || actions.duplicate || actions.revert || actions.unpublish;
}
