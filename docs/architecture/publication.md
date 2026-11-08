# Content publication

Part of the [Lace architecture](README.md).

## 10. Content publication

Publication is an application use case reserved to `content:publish`, which
only administrators hold in the default role policy ([ADR 0025](../adr/0025-better-auth-role-permissions.md)). It takes the
entry ID, expected draft revision, actor and an optional idempotency key, and
writes an outbox event that triggers a static rebuild ([ADR 0027](../adr/0027-outbox-triggered-rebuild.md)). Detailed
behavior is in
[content-use-cases](../../openspec/specs/content-use-cases/spec.md)
("Publication is guarded, idempotent, and build-independent").

The use case first loads the draft, blocks, active configuration and current
published pointer and validates the complete candidate without writing,
including composite required descendants, `minItems` and normalized list,
media and byte budgets. A hidden block is validated in draft mode, so an
unfinished block can be published hidden; it is copied into the published
snapshot but never delivered (§12). One guarded transaction or D1 atomic batch
then ([ADR 0002](../adr/0002-d1-batches-and-node-transactions.md)):

1. inserts the new snapshot with `INSERT ... SELECT` only if the entry still
   points to the validated draft at `expectedDraftRevision`;
2. copies blocks and media-reference rows set-based, conditional on the new
   snapshot; when conditional-field rules apply, it writes the supplied
   published projection and checks its delivered internal links instead
   ([conditional-fields](../../openspec/specs/conditional-fields/spec.md));
3. replaces the entry's route; a path collision rolls back everything;
4. points `content_entries.published_snapshot_id` at the new snapshot;
5. increments `published_state.version`;
6. creates or coalesces the `site.build.requested` outbox event;
7. stores the idempotency result when a key was supplied;
8. deletes the old published snapshot, whose blocks and references cascade.

A zero-row snapshot insert returns `CONTENT_REVISION_CONFLICT` and makes every
conditional statement a no-op. Every draft mutation bumps the same revision, so
a validated candidate cannot be published after a concurrent change. The port
models atomic publication explicitly rather than assuming that D1 supports an
interactive transaction callback; Node may use a SQLite transaction, D1 uses
guarded batches.

The draft stays in place: after publication, draft and published hold
equivalent data as independent records.

The outbox dispatcher runs after commit and invokes `SiteBuildTrigger`. Failed
dispatches stay recoverable with bounded exponential backoff, and a scheduled
recovery process handles events left pending after a Worker or container
terminates ([outbox-dispatch](../../openspec/specs/outbox-dispatch/spec.md)).
Publication success and deployment success are distinct states; the admin can
show "published, build pending" or "published, build failed".

### Deletion, globals and lifecycle commands

- Deleting a draft-only entry requires `content:write`; deleting a published
  one also requires `content:publish`, and the same atomic mutation removes
  its route, increments `published_state.version` and enqueues a build.
- Pages and globals are configuration-defined singletons: delete and
  duplicate fail with `CONTENT_PAGE_SINGLETON` (HTTP `409`); they are removed
  by removing the model from `lace.config.ts`.
- Globals follow the page lifecycle without a route
  ([ADR 0010](../adr/0010-global-models.md)): publication writes no
  `published_routes` row but still increments the version and requests a build,
  because any page may render a global.
- Unpublish, revert and duplicate are guarded atomic commands
  ([ADR 0008](../adr/0008-entry-lifecycle-commands.md),
  [content-use-cases](../../openspec/specs/content-use-cases/spec.md)).
  Unpublish (`content:publish`) removes the route and snapshot, increments the
  version and requests a build, leaving the draft unchanged; a removed snapshot
  cannot be restored. Revert (`content:write`) copies the publication into the
  draft without touching public output, the version or build work. Duplicate
  (`content:write`, collections only) creates an unpublished copy at revision
  1.
