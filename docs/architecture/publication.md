# Content publication

Part of the [Lace architecture](README.md).

## 10. Content publication

Publication is an application use case reserved to `content:publish`, which
only administrators hold in the default role policy ([ADR 0025](../adr/0025-better-auth-role-permissions.md)). It takes the
entry ID, expected draft revision, actor and an optional idempotency key, and
supplies a build event request that is committed with the mutation and triggers
a static rebuild ([ADR 0027](../adr/0027-outbox-triggered-rebuild.md)). Detailed
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

1. admits the shared write plan only if the validated draft and revision still
   match, delivered links are valid, the route is available and no live
   idempotency result takes precedence; then inserts the snapshot with
   `INSERT ... SELECT` from that draft;
2. copies blocks and media-reference rows set-based, conditional on the new
   snapshot; when conditional-field rules apply, it writes the supplied
   published projection and checks its delivered internal links instead
   ([conditional-fields](../../openspec/specs/conditional-fields/spec.md));
3. replaces the entry's route; a path collision rolls back everything;
4. points `content_entries.published_snapshot_id` at the new snapshot;
5. increments `published_state.version`;
6. uses the shared `enqueueEvents` compiler to create or coalesce the supplied
   build event with the version read after that increment;
7. stores the idempotency result when a key was supplied;
8. deletes the old published snapshot, whose blocks and references cascade.

A typed admission miss leaves every dependent write a no-op. Live idempotency
results take precedence, followed by stale revision, invalid delivered links
and route conflicts. Every draft mutation bumps the same revision, so
a validated candidate cannot be published after a concurrent change. The port
models atomic publication explicitly rather than assuming that D1 supports an
interactive transaction callback; Node may use a SQLite transaction, D1 uses
guarded batches.

The use case supplies the actor, operation time and new or removed snapshot;
persistence owns admission and the guarded atomic write. Publication,
unpublication and deletion share their ordered statements,
including public-state and build work, with runtime-specific executors. A
receipt reports outbox work only after the atomic unit commits; replays,
guard misses, draft-only mutations and rollbacks report none.

The draft stays in place: after publication, draft and published hold
equivalent data as independent records.

The outbox dispatcher runs after commit and invokes `SiteBuildTrigger`. Failed
dispatches stay recoverable with bounded exponential backoff, and a scheduled
recovery process handles events left pending after a Worker or container
terminates ([outbox-dispatch](../../openspec/specs/outbox-dispatch/spec.md)).

On the VPS, each poll claims at most one build when it is ready to call the
builder. Other due builds stay available to a peer or the next poll while the
active call renews its lease. Recovery can reclaim the same build ID when an
unfinished lease expires. If the builder already acted before the dispatcher
stopped and the result was never recorded, recovery can invoke that build ID
again. See the [site-build dispatch specification](../../openspec/specs/site-build-dispatch/spec.md).

On the Worker, a request whose committed D1 batch inserted or coalesced an
outbox event registers one best-effort `waitUntil` pass, whatever its route
or transport (REST or MCP); scheduled dispatch remains the recovery path
([cloudflare-scheduled-dispatch](../../openspec/specs/cloudflare-scheduled-dispatch/spec.md)).
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

[ADR 0034](../adr/0034-acyclic-entry-reference-fields.md) sets the pre-1.0
integrity rules for typed entry references. Draft writes preserve an acyclic
graph across saved drafts. Publication independently preserves an acyclic
graph across delivered published references, whose targets must be published.
Each mutation checks the affected graph atomically. A direct delivered
reference blocks target unpublication or deletion until the referring
publication stops using it. Direct draft usage requires a reviewed warning
before deletion.

### Draft preview boundary (selected PV1 scope)

Creating a preview is a separate `content:write` browser-session command. It
freezes one saved routed draft and published context into an expiring build
input; it creates neither a published snapshot nor publication build work.
Successful publication of that entity atomically invalidates its ready and
in-flight preview. Saving, reverting and unpublishing retain the preview; it
continues to identify the captured revision. Entity/model removal and deletion
of media included in a preview invalidate the corresponding preview packages.
Logical invalidation precedes asynchronous object cleanup. These temporary
build inputs do not introduce content revision history or a third content state.
See [ADR 0033](../adr/0033-protected-static-draft-preview.md).
