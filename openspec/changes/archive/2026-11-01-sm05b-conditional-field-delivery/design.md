## Context

SM5A (archived) shipped `isFieldVisible`, `publishedFieldValues` and
`publishedBlockData` in `@lacecms/content`, validation in `normalizeFieldMap`
that already treats hidden targets as drafts, and configuration sync that
prunes hidden values from published snapshots. See proposal.md for why SM5B
is needed. Current publication path:

- `ContentUseCases.publish` (`packages/application/src/content-use-cases.ts`)
  runs `validateDraft(entry.draft, model, "publish")`, which normalizes the
  candidate (hidden targets keep values and materialized defaults), checks
  media are active and checks every `delivered` internal link for a published
  route, then calls `content.publish(command)`.
- `PublishContentEntryCommand` (`packages/application/src/index.ts`) carries
  only identity, revision, idempotency, time and actor.
- Node (`packages/platform-node/src/content-repository.ts`) and D1
  (`packages/platform-cloudflare/src/d1-content-repository.ts`) copy the draft
  row, blocks, internal links and media references with `INSERT ... SELECT`,
  guard links with `INVALID_PUBLISHED_LINK_TARGETS_SQL` over the draft's
  `delivered=1` link rows, and D1 builds the returned entry in
  `publishedEntry` from the draft.
- `collectSnapshotInternalLinks` sets `delivered` from `block.hidden` only.
- Render (`packages/render/src/blocks.ts`) parses block data with
  `validateBlockData(definition, data, "publish")`; hidden targets with a
  default come back materialized.
- Public reads and the build export serialize stored published snapshots
  without a model-aware value pass.
- Types: `BlockDataValues<Fields>`, `FieldValue` for groups,
  `ModelFieldValues<Fields>` (config) and render `BlockDataOf` ignore rules;
  `BlockDefinition` has no visibility type parameter.

## Goals / Non-Goals

**Goals:**

- One place computes the published projection and its references: the
  portable use case. Repositories write supplied values atomically.
- Node SQLite and D1 behave identically, proven by shared contract cases.
- Entries without rules keep today's SQL copy path byte for byte.
- Render never hands components a hidden value, including materialized
  defaults.

**Non-Goals:**

- Admin show/hide, validation summaries and client publish readiness (SM5C).
- Read-time filtering in REST or the build export.
- Re-normalizing or migrating snapshots published before SM5B on this branch.
- Changing draft storage, draft references' media semantics or DTO shapes.

## Decisions

### D1. The use case computes the projection; repositories write it

After `validateDraft(..., "publish")`, `publish` derives:

- `fields = publishedFieldValues(model.fields, draft.fields, model.visibility)`;
- for every block (hidden blocks included) `data = publishedBlockData(definition, block.data)`;
- `mediaReferences` from the projected fields and block data with the existing
  `collectMedia` helper, plus the SEO image reference;
- `internalLinks = collectSnapshotInternalLinks(...)` over the projected values.

The publish-mode internal-link check runs over these projected links, not the
draft links, so hidden links never block publication.

Rejected: repositories compute the projection. They would need the active
configuration and block registry, duplicating application logic in two
adapters. Rejected: read-time filtering in REST, export and MCP. Published
references, media usage, link guards and build triggers would still see
hidden values, and ADR 0018 already defines omission at the snapshot, which
sync relies on.

### D2. Optional `projection` on `PublishContentEntryCommand`

```ts
interface PublishedProjection {
  readonly fields: JsonObject;
  readonly blocks: readonly { readonly key: BlockKey; readonly data: JsonObject }[];
  readonly mediaReferences: readonly DraftMediaReference[];
  readonly internalLinks: readonly InternalLinkReference[];
}
interface PublishContentEntryCommand {
  // existing members
  readonly projection?: PublishedProjection;
}
```

The use case sets `projection` exactly when the model or any block type in
the draft declares `visibility` anywhere in its field tree (model level,
nested groups, list-item groups, block data). A pure
`declaresFieldVisibility(fields, visibility?)` helper in `@lacecms/content`
answers this; the use case memoizes it per model key and block type for the
lifetime of the configuration. `blocks` lists every draft block key exactly
once; repositories reject a mismatch with `CONTENT_INVALID_STATE` before
writing.

The use case refuses with `CONTENT_REVISION_CONFLICT` when the loaded draft
revision differs from `expectedRevision` before building the projection, and
the repositories' revision-guarded insert ensures the draft is still that
revision at commit. Because every draft mutation bumps the revision, the
projection always belongs to the committed draft.

Rejected: always supplying a projection. It changes every publication
fixture and write path for content that cannot differ. Rejected: supplying
it only when the projection removed a value. Stale draft link `delivered`
flags (D4) would then decide the atomic guard for opted content after a
visibility change; deciding by declared rules always uses fresh rows.

### D3. Repository write path (shared SQL in `@lacecms/db`)

With `projection` absent, nothing changes. With it present, both adapters, in
their existing transaction or single guarded D1 batch and at the same
checkpoints:

1. Insert the snapshot with the same revision/idempotency guard, taking
   `fields_json` from a bound parameter instead of the draft row; D1 keeps the
   link guard in this statement (step 5 SQL).
2. Copy blocks with `BLOCK_COPY_COLUMNS_SQL`, replacing `data_json` from a
   bound JSON array joined by `block_key` (`json_each`); one statement.
3. Insert internal links from `internalLinkRowsJson(projection.internalLinks)`
   instead of `COPY_INTERNAL_LINKS_SQL`.
4. Insert media references from one bound JSON array instead of copying the
   draft rows.
5. Guard links with a new `INVALID_PROJECTED_LINK_TARGETS_SQL`: the same
   target/route predicate as `INVALID_PUBLISHED_LINK_TARGETS_SQL`, reading
   `delivered` rows from `json_each(?)` instead of the draft snapshot. Node
   runs it inside the transaction before writing; D1 embeds it as
   `not exists (...)` in the snapshot insert and re-runs it after a zero-row
   insert to report `internal_link_unavailable` issues, as today.

Routes, entry pointer, public-state bump, outbox, idempotency record and old
snapshot deletion are unchanged. JSON arrays are single binds, so D1 stays
within 100 binds per statement and adds no statement per item. D1
`publishedEntry` uses the projected fields and block data for the returned and
idempotency-stored entry; Node reloads from the database as today.

Rejected: copying, then pruning with `UPDATE`. It writes hidden values into a
published row for an instant and doubles block writes.

### D4. Draft link rows mark hidden links as not delivered

`collectSnapshotInternalLinks` receives the model-level rules and each
block's definition (with its data rules) and sets `delivered: false` for a
link inside any hidden target, in addition to hidden blocks. Draft saves
therefore store accurate draft warnings, and the existing non-projected path
is unaffected for unopted content. Publication of opted content never relies
on the stored draft flags (D2, D3). Configuration sync does not recompute
draft link rows; a visibility change leaves draft warnings stale until the
next save, which affects only warnings.

### D5. Delivery

Public entry and global reads, the build export (pages, media dictionary,
link manifest) and admin/MCP published reads return stored published
snapshots. Correct snapshots come from D3 and from SM5A sync pruning; no
read path changes. Tests assert the omission end to end on each runtime.

### D6. Render projection

`parseBlockData` returns `publishedBlockData(definition, validated)` after
publication-mode validation. This removes hidden values, including defaults
the validator materialized for hidden targets, and values from exports made
before SM5B. Blocks without rules return the validated value unchanged
(identity fast path when `definition.visibility` is undefined and no nested
group declares rules).

### D7. Published value types

- `BlockDataValues<Fields, Visibility = undefined>` and config
  `ModelFieldValues<Fields, Visibility = undefined>`: keys of `Visibility`
  move to the optional half; other keys keep `FieldIsRequired`.
- `FieldValue` for a group reads the definition's `visibility` property type
  (already preserved by `field.group` via `PropertyFrom<Options,
  "visibility">`) and passes it to `BlockDataValues`.
- `BlockMetadata` and `BlockDefinition` gain a third type parameter
  `Visibility = undefined`; `defineBlock` infers it as a `const` parameter
  constrained by `FieldVisibility<Fields>`; `validate` and `defaultValue` use
  `BlockDataValues<Fields, Visibility>`. Render `BlockDataOf` infers the third
  parameter.
- Model definitions expose their inferred `visibility` type so consumers can
  write `ModelFieldValues<typeof model.fields, typeof model.visibility>`.

Defaults of `undefined` keep every existing inferred type, checked by the
existing type tests plus new ones. Optional is also sound for draft-mode
`validate` results, where hidden values may be present.

Rejected: a separate `PublishedBlockData` type family. It doubles the public
type surface while optional targets already describe both modes.

### D8. Agent, import and API guidance

- MCP tool descriptions (`packages/mcp/src/index.ts`): `list_content_models`
  mentions `visibility`; `create_entry`/`save_draft` say hidden values are kept
  and validated as drafts; `publish_entry` says hidden fields are not required
  and not published.
- `FieldVisibility` OpenAPI description adds published omission; regenerate
  `api-v1.json`.
- `docs/mcp.md` and `docs/content-import.md` get a short conditional-fields
  paragraph. Public authoring docs and the shipped example stay in SM5C.

### D9. Architecture and ADR

`docs/mvp-architecture.md` §8 replaces "adopt the projection in SM5B" with the
delivered behavior; §9.3 states published snapshots and their references hold
the projection; §10 step 2 states that opted content inserts supplied
projected values and references and guards projected links. ADR 0018 status
becomes "accepted; SM5A and SM5B implemented".

## Risks / Trade-offs

- [Two write paths in each repository] → Shared SQL constants in
  `@lacecms/db`, one contract suite running both paths on fake, SQLite and D1,
  and checkpoint failure injection on the projected path.
- [Use case and repository disagree on block keys] → Repositories verify the
  projected key set equals the draft's before writing and fail without
  partial writes.
- [Stale draft link warnings after a sync visibility change] → Warnings only;
  publication recomputes from current rules. Next save refreshes rows.
- [Snapshots published on this branch between SM5A and SM5B still carry
  hidden values] → Branch was never released; republish fixes them, and
  render already removes such values (D6).
- [Type parameter added to `BlockDefinition`] → Defaulted, so existing
  annotations compile; type tests cover built-in and user blocks.
- [Revert copies the projection into the draft, dropping hidden values] →
  Accepted by the SM5A spec; documented in SM5C user docs.

## Migration Plan

No database migration and no template version change. Deploying SM5B affects
only new publications of entries whose model or blocks declare rules.
Rollback: redeploy the previous build; snapshots written by SM5B are valid
published values for the older code. Dev databases from this branch can
republish affected entries to drop stale published values.
