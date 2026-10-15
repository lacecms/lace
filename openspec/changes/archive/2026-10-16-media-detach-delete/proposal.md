## Why

On a deployed Cloudflare installation an owner removed the block that used an
image and still could not delete the image: the library kept reporting one
using entry and offered no way forward. Investigation shows the reference
projection itself is correct on both runtimes — draft saves rebuild the draft's
references and publication deletes superseded snapshots by cascade — but usage
deliberately counts the current draft **or** the current published snapshot.
Removing a block from the draft leaves the published version still using the
image until the entry is republished, and the details panel does not say that
publishing is the missing step. Separately, owners have no way to delete an
image that drafts still use without editing every entry by hand.

This is a standalone post-roadmap change (no roadmap step or session unit; the
content-editor roadmap is archived). It refines the media deletion behavior in
`docs/mvp-architecture.md` § Media and the accepted `media-use-cases`,
`admin-media-library` and `rest-contracts` specs.

## What Changes

- **Detach, then delete.** `DELETE /api/v1/admin/media/:mediaId` accepts an
  optional `detach=drafts` query parameter. With it, the server first removes
  the item from the current draft of every entry that uses it (a media field
  is cleared, a media item of a list is removed from the list, an SEO image is
  cleared, in entry fields and in visible or hidden blocks alike), saving each
  draft as a normal guarded draft save by the requesting actor, and then
  requests deletion through the unchanged guarded deletion path.
- Detaching never rewrites a published snapshot. When a current published
  snapshot uses the item the request is refused with `MEDIA_IN_USE` before any
  draft changes, so the public site never loses an image or fails to render.
  A request is also refused when more entries use the item than the usage read
  returns (50).
- Detaching requires both `media:write` and `content:write`. Without the query
  parameter deletion behaves exactly as today.
- **Admin confirmation.** When every listed usage is draft-only, the media
  details panel offers deletion again. Its confirmation dialog names the
  entries whose drafts will lose the image, warns that required fields may
  then block publication and that open editors will see a revision conflict,
  and sends the detaching request.
- **Clear guidance for published usage.** When a published version still uses
  the item, the panel keeps deletion unavailable and names those entries. When
  an entry's draft no longer uses the item and only its published version
  does, the panel says that publishing (or unpublishing) the entry releases
  the image — the case reported from production.
- **Coverage.** A repository contract case (memory, Node SQLite and D1) and an
  HTTP-level case prove that removing a media block from a draft marks the
  usage published-only, and that publishing then releases the item for
  deletion. New unit, contract, server, admin unit and e2e cases cover
  detaching.

Non-goals: rewriting published snapshots, automatic republication, deleting
media still used by a publication, bulk deletion, media referenced by more
than 50 entries, changes to the asynchronous object deletion or the public
delivery contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases`: adds detaching draft-only usage before a deletion request,
  with its permission, published-usage and bounds refusals.
- `admin-media-library`: deletion of an item used only by drafts is offered
  through a confirmation that names the affected drafts; published usage
  explains whether publishing releases the item.
- `rest-contracts`: the media delete route accepts the validated
  `detach=drafts` query parameter.

## Impact

- `packages/content`: pure `detachFieldMedia` helper next to
  `collectFieldMedia`.
- `packages/application`: `ContentUseCases` draft detach command and
  `MediaUseCases.requestDeletion` detach orchestration.
- `packages/contracts`, `packages/server`: delete-route query schema,
  OpenAPI document (`api-v1.json`).
- `packages/test-utils`: repository contract case for block removal.
- `apps/admin`: admin client, media details panel, deletion dialog, tests.
- `docs/mvp-architecture.md` § Media deletion.
- No migration, no public contract or SDK change, no template bump.
