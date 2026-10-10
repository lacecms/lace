## Context

See proposal.md for motivation. The current state that shapes the design:

- `@lacecms/config` computes each model's `structureHash` as SHA-256 over
  `omitDisplayMetadata(omitListFields({...model, blockDefinitions}))`.
  `omitDisplayMetadata` removes every `label` and `description` key at any
  depth, including field keys such as `description: field.textarea()` (used in
  `docs/personal-site-guide.md`). The structure itself is not kept.
- `@lacecms/application/configuration-sync.ts` holds the pure planner, the
  reports and the ports. Repositories (`NodeContentRepository`,
  `D1ContentRepository`) re-read `STORED_MODEL_STATE_SQL`, re-plan, and compare
  the plan JSON before writing. D1 guards the whole batch with
  `STORED_MODEL_STATE_JSON_SQL = ?` through `mutation_guards`. Both runtimes
  call `bumpPublicState` after every applied plan.
- Snapshot `fields_json` is plain JSON. `validateModelFields` fills defaults for
  absent keys, so saved drafts already contain defaults that existed at save
  time. The render core validates block data only, never top-level fields.
- `content_snapshots.schema_version` records the model version at write time.
  Nothing reads it for decisions.
- Draft status (`published`/`changed`) compares draft and published revisions.

## Goals / Non-Goals

**Goals:**
- A faithful stored structure per model, valid only for the hash it was written
  for, with an upgrade path for installations without one.
- A pure, deterministic diff and classifier in `@lacecms/application` shared by
  both runtimes.
- Data-dependent decisions made from bounded scans and protected against
  concurrent edits by a cheap SQL-evaluable guard.
- Backfill as one set-based statement per field on both runtimes.

**Non-Goals:**
- Hints (`renamedFrom` per field, `removedFields`, `removedBlocks`), pruning and
  media-reference rebuilding (CE1B).
- Block migrations, draft revision bumps and per-snapshot guarded rewrites
  (CE1C).
- Changing what `content_snapshots.schema_version` means.

## Decisions

### 1. Canonical structure lives on the runtime model; display stripping becomes definition-scoped

`@lacecms/config` gains `contentModelStructure(model, registry)`, which builds
the structure explicitly: `{kind, key, version, path|route, blocks, fields,
blockDefinitions}`. It removes `label`/`description` only from the model, from
each field definition, from each block definition and from each block field
definition. The key set and nesting match the old hashed value, so the hash
does not change for configurations that never used those keys.
`NormalizedContentModel` gains two optional properties:
`structure?: ContentModelStructure` (a deeply frozen JSON object) and
`legacyStructureHash?: string`. The second is set only when the old algorithm
gives a different hash. `publicModel` strips both, as it strips `renamedFrom`.
They are optional so that hand-built models (tests, programmatic callers) keep
working. A model without `structure` falls back to hash-only strict planning.

*Alternatives:* (a) keep the lossy hash and store the lossy structure. The diff
would then silently miss fields named `description`, for example a tightened
SEO description or a backfilled default. Rejected. (b) a `structure` getter or
side map keyed by model. Rejected: models are plain frozen data that crosses
package boundaries.

### 2. Baseline validity is SQL-checkable: `structure_json` + `structure_json_hash`

Migration `0005` adds both nullable columns. `STORED_MODEL_STATE_SQL` returns
`case when structure_json_hash = structure_hash then structure_json end`, so
neither runtime sees a baseline whose hash no longer matches. An older engine
that rewrites `structure_hash` after a rollback therefore invalidates the
baseline automatically. The D1 guard JSON includes `has_baseline` (a boolean),
not the structure text, which keeps the guard parameter small.

*Alternative:* one column, verified in the application by re-hashing. Rejected:
Node applies inside a synchronous better-sqlite3 transaction and D1 guards in
SQL. Neither can run async Web Crypto at guard time.

### 3. Three-phase prepare: identity plan → scan → final plan

`prepareConfigurationSynchronization` performs:

1. Read the stored state (now with `structure` and `snapshotFingerprint`).
2. Compute the scan requests. This pure function diffs every matched or renamed
   model with snapshots and a valid baseline, and keeps models whose changes
   include a validated, destructive or migration change, or a backfill.
3. Scan each requested model through `readConfigurationSyncSnapshots` in pages
   of 100 and fold each page into `ConfigurationSyncEvidence` with a pure
   evaluator. The evidence holds, per model: the fingerprint it was computed
   for, draft/published totals, per-field and per-block-type holder counts,
   backfill counts, oversize backfills, and violations (capped at 20 named, with
   a total).
4. `planConfigurationSynchronization({models, storedModels, evidence})` stays
   pure and synchronous. It attaches `evolution` (changes, counts, backfills) to
   `version-update` and `rename` operations and emits diagnostics. A model that
   needs evidence but lacks evidence for the same fingerprint gets a
   `SNAPSHOT_EVIDENCE_STALE` diagnostic.

The evidence travels in `PreparedConfigurationSynchronization` and in
`ApplyConfigurationSynchronizationInput`. Repositories keep their re-plan check
by calling the planner with `input.evidence`. Evidence is valid only for the
fingerprints that are part of the guarded stored state.

*Alternative:* re-run the scan inside apply. Rejected: impossible on D1 without
interactive transactions, and it would make the runtimes diverge.

### 4. Snapshot fingerprint in stored state instead of per-snapshot guards

`STORED_MODEL_STATE_SQL` adds, per model,
`count || ':' || sum(revision) || ':' || sum(updated_at) || ':' || max(updated_at)`
over snapshots of the model's entries. Every draft save increments the
revision and sets `updated_at`. Publication inserts a snapshot with a new
`updated_at`. Deletion changes the count. Because the fingerprint is part of the
existing state comparison (`sameStoredModelStates` on Node, the guard JSON on
D1), both runtimes get one uniform stale check with no new guard mechanism.
Edits to unrelated models also make a plan stale. That is acceptable for a rare
operator command and keeps the counts in the report exact.

*Alternative:* list snapshot `(id, revision)` pairs in the guard. Rejected:
unbounded guard size against D1's statement limits.

### 5. Diff and classification rules (application, pure)

`configuration-structure.ts` compares baseline and target structures:

- **Fields.** Added → `compatible` (backfill when a default is declared).
  Removed → `destructive`. For a field present in both:
  - a type change → `breaking`;
  - changes to `required`, `minLength`, `maxLength`, `min`, `max`, `options`
    and `defaultValue` are compared property by property;
  - any tightening → one `validated` change that lists every changed property;
  - only relaxations or default changes → `compatible`;
  - only an option reorder → `display`;
  - any other property difference → `breaking` (`FIELD_CHANGE_UNSUPPORTED`).
- **Allowlist.** Added type → `compatible`. Removed type → `destructive`. Pure
  reorder → `display`.
- **Block definitions** for types in both allowlists, compared as canonical
  JSON → `migration`.
- **Path or route** change → `breaking`. It is refused only when published
  snapshots exist; with drafts only it is applied, because routes are computed
  at publication.
- **Key and version** are excluded from the diff (decision 1 keeps them in the
  hash).

The validated check evaluates each snapshot's post-backfill value with the
target field definition: `validateFieldValue` for present values, and presence
for published snapshots when the field becomes required. A model without
snapshots skips evaluation: its changes are reported and applied as today.

### 6. Backfill is set-based, revision-neutral, and media-free

For each backfilled `(model, field)` both runtimes run:

```sql
update content_snapshots
   set fields_json = json_set(fields_json, '$.<field>', json(?))
 where entry_id in (select id from content_entries where model_key = ?)
   and json_type(fields_json, '$.<field>') is null
```

The field key matches `^[A-Za-z][A-Za-z0-9]*$`, so the path cannot be
injected. The value is bound as canonical JSON. The statement runs after the
model's identity update, so a rename's cascade has already moved `model_key`.
Revisions, `updated_at` and `updated_by` stay unchanged. The written value
equals what `validateModelFields` would add on the next save, so an open editor
loses nothing, and draft/published status is preserved. CE1C introduces
revision bumps for real data transformations. Media defaults are refused
(`MEDIA_DEFAULT_BACKFILL_UNSUPPORTED`): media IDs are environment-specific, and
a backfill would need reference rows, which come with CE1B.

### 7. Operations and public-state advancement

- New action `record-baseline` (model unchanged, baseline missing, or stored
  hash equal to `legacyStructureHash`). Its write is
  `update content_models set structure_json, structure_json_hash, structure_hash`
  guarded by the expected key, kind, version, hash and projection hash.
- `create`, `label-update`, `version-update` and `rename` also write the
  baseline from the configured model's `structure` when it is present.
- Every operation except `record-baseline` keeps today's behavior of advancing
  `published_state.version` and coalescing one build. An apply whose operations
  are all `record-baseline` skips `bumpPublicState`, so the first sync after the
  upgrade does not trigger deploys.

### 8. Report and diagnostics

Operations gain an optional `evolution`:
`{ snapshots: {draft, published}, changes: [{class, kind, target, properties?,
affected?: {draft, published}, backfill?: {draft, published}}] }`.
Diagnostics gain optional `fieldKey`, `blockType`, `class`, `affectedCount` and
`snapshots: [{entryId, state, title}]`. New stable codes:

- `STRUCTURE_BASELINE_MISSING` (the strict fallback with restore-sync-apply
  guidance; it replaces `STRUCTURE_CHANGE_HAS_SNAPSHOTS` when a baseline could
  exist; the old code remains for models without `structure`);
- `FIELD_TYPE_CHANGED`, `FIELD_CHANGE_UNSUPPORTED`, `CONSTRAINT_VIOLATED`,
  `FIELD_REMOVAL_HAS_DATA`, `BLOCK_TYPE_REMOVAL_HAS_BLOCKS`,
  `BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`, `ROUTE_CHANGE_HAS_PUBLISHED`,
  `MEDIA_DEFAULT_BACKFILL_UNSUPPORTED`, `BACKFILL_EXCEEDS_LIMIT`,
  `SNAPSHOT_EVIDENCE_STALE`.

The text report prints one indented line per change, for example
`  compatible field-added summary (backfill: draft=2, published=1)`. The CLI
JSON `data` is the plan JSON, so it gains these fields additively.

### 9. Package boundaries

- `config` → `content` only (unchanged).
- `application` holds the diff, evaluator, planner and ports; it imports
  `content` validators.
- `db` owns the shared SQL and row mapping.
- Adapters implement `readConfigurationSyncSnapshots` and the apply writes.
- The CLI only renders.

The dependency direction is unchanged.

## Risks / Trade-offs

- [Any edit during sync makes the plan stale] → The operator reruns. The
  message already says so (`runLocalContentSync` and the CLI keep their stale
  handling).
- [`json_set` appends keys, so `fields_json` key order differs from
  application-written JSON] → Readers parse JSON. Nothing compares the stored
  text.
- [Structural hash changes for configurations with `label`/`description` field
  keys] → `legacyStructureHash` lets the first sync record the baseline without
  a version bump. This is covered by a test.
- [A large model scan on D1 costs about two queries per 100 snapshots] → The
  scan is read-only, runs only for data-dependent changes, and runs from the
  CLI, not from a Worker request.
- [Backfilled published snapshots change public data without republication] →
  This is intended (owner decision 3). The published version advances and a
  build is requested in the same mutation. Architecture 4.7 and 9.3 record the
  rule.

## Migration Plan

1. Deploy the engine with migration `0005` (`lace db migrate`). Older engines
   start against the migrated database and ignore the columns.
2. Run `lace content sync --check`. It reports `record-baseline` for each model
   and returns the pending-change exit code.
3. Run `lace content sync` once. Baselines are stored, and no build is
   requested unless other changes are pending.
4. Rollback: an older engine works unchanged. If it syncs a structural change,
   the baseline becomes invalid by construction. After returning to this
   engine, the restore-sync-apply path recovers.
