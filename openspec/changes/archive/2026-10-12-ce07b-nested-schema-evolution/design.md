## Context

See proposal.md for motivation and scope. CE7A already supplies bounded recursive descriptors, validation, list-budget counting, nested media collection and descriptor-scoped canonical identity. The remaining restriction is deliberate: `configuration-sync.ts` refuses most populated composite model changes; `configuration-evolution.ts` compares/rewrites only root keys. Config extraction only removes root rename hints; nested hints fail descriptor validation. Shared SQL helpers update root JSON keys and exact media paths, so using them unchanged for a parent rename would leave descendant reference paths stale.

Block migration planning already reads all blocks for aggregate counting and enforces prior-media provenance, hidden-block draft validation and guarded entry units. Its budget context currently receives raw model fields, independently of pending model transforms. CE7B must join those views while retaining the existing intermediate-write safety and final replan lifecycle.

## Goals / Non-Goals

**Goals:** one portable definition/path visitor and transformation semantics shared by evidence, apply and memory doubles; bounded reads; deterministic refusal evidence; atomic values/references on SQLite and D1.

**Non-Goals:** a general JSON patch API, cross-parent moves, item deletion/insertion migrations for model lists, schema changes to SQL tables, new authoring UI or a new resumable model-field migration lifecycle.

## Decisions

### 1. Separate schema addresses from concrete value paths

Keep legacy root keys at existing report/hint boundaries. Nested schema addresses are slash paths: `/profile/title`, `/links/*/title`, `/links/*/children/*/url`. Canonicalize `/title` to `title`. Named segments use the existing ASCII field-key grammar, so no escaped field names or literal star names are possible. `*` is legal only at a list item transition; numeric segments are not schema addresses. A list item can be a comparison target (`/tags/*`) but not a rename/removal target. Concrete diagnostic paths use existing typed path encoding with numeric positions and `/fields` or `/blocks/<index>/data` prefixes. Parse to typed segments before traversing; never interpolate user text into SQL.

Use field-level `renamedFrom: "oldSibling"` recursively; do not add a second model-level rename DSL. Normalize all child hints into the runtime model's existing synchronization mapping. Extend `removedFields` with schema paths. Canonicalize hints, validate sibling conflicts and reject overlapping removals. Block definitions still reject hints at every depth and list item descriptors reject identity hints. Extract model child hints before descriptor metadata projection, preserving literal content keys inside defaults.

Pair ancestors before children during diff/validation. Paths supplied in removal hints use configured ancestor names; ancestor rename pairing maps them to baseline branches. This supports a parent rename plus a child rename/removal without cross-parent movement. Hints below wholly new branches fail as missing context. Existing hints stay inert after application under the baseline rules.

Rejected: dot/bracket syntax, arbitrary JSON Pointer names, indices and path-valued renamedFrom. They add parsing/escaping or ambiguous list-specific behavior without a requirement.

### 2. Recursively compare definitions, transform occurrences once

Extend the application diff to compare group field maps and list items; compare container options separately from descendants, avoiding a generic breaking change for a recognized `fields` or `item` difference. Compare effective normalized list bounds. Preserve CE1 classes, deterministic sorting, block definition migration classification, scalar encodings and version rules. A type change remains breaking on populated models, including list items and hinted renames; empty-model behavior stays CE1.

Compile a JSON-safe recursive transformation description from paired structures/hints. The pure evaluator walks each present container once: rename named keys at that level, prune declared removals, then apply applicable changed/added defaults and descend. A renamed parent is traversed under its target schema context. Do not create missing parents unless their own applicable default supplies them. Do not normalize untouched values or apply unchanged defaults opportunistically. Empty arrays have no child occurrences; no operation resizes an existing array. A changed item default cannot replace present items or merge properties into them; changed defaults on named children still backfill absent child keys.

Collect holders/collisions from the same object occurrence; any present target is a collision, even with no source there. Count each snapshot once per schema finding. Check inserted defaults recursively for media, including descendant defaults: reject actual media-bearing backfills, rather than rejecting unrelated existing media or unused defaults. Retain CE1 media-default diagnostics and scalar behavior. Pure transformation results include canonical fields, changed flags, rebuilt `$fields` media locations and bounded findings; reports contain facts/counts, not all stored content.

Rejected: invoking the ordinary save/publish use case. It changes revisions/audit semantics, may materialize unrelated defaults and rejects grandfathered published absence.

### 3. Validate both final prospective state and migration intermediates

Extend snapshot scan values with retained block data, hidden flags and reference information needed for budgets. Keep snapshot pages at 100 and migration entry pages at 50, with batched block/reference reads and opaque cursors. Every data-dependent model transformation receives complete snapshot context. Preparation evaluates applicable model rewrites/removals and migrated outputs together before deciding the plan; use the executable registry only during preparation/migration, and persist JSON-safe evidence for adapter replanning.

Validate changed present subtrees in their state mode and newly tightened presence/minimum constraints only, so an unrelated grandfathered required field does not block a rename. New required fields without defaults retain CE1 compatibility and wait for next publication. Draft/hidden minima remain permissive. Always enforce maxima, safe present values, normalized JSON size, the full 500-element snapshot budget and 200 media locations. Include retained hidden/unchanged blocks and resulting defaults. Attribute aggregate failures to the changed schema operation plus the concrete path supplied by the budget validator.

Block units still write only blocks, before final model rewrites. Validate each actual intermediate snapshot using actual model values/retained blocks in addition to checking the final combined state. Reject a plan that requires a later model removal to make an intermediate safe; this keeps resumability safe without adding a second model-rewrite lifecycle. A failed preparation writes nothing. After successful migration units, reprepare and retain the existing reviewed-plan equivalence check excluding completed migrations.

### 4. Reuse guarded final mutation with exact snapshot rewrite payloads

Retain scalar set-based SQL fast paths when only scalar operations are involved. For composite transformations, boundedly reread matching snapshots and prepare exact replacement field JSON plus complete `$fields` reference sets using the shared pure evaluator. Extend the application persistence payload/helper types rather than teach SQL a second wildcard traversal implementation. The adapter verifies current stored state, fingerprint and evidence-derived plan before assembling writes; the D1 batch's opening state guard also protects the interval between reread and execution. Node performs verification and writes within its existing SQLite transaction.

Shared `db` helpers produce parameterized snapshot updates and replacement `$fields` inserts/deletes, appended to the existing final mutation after model identity changes. Bind snapshot IDs/JSON/paths; never interpolate pointers. Assert expected affected rows through the existing adapter guard mechanism. Preserve `$seo` and block sources. Rebuild from actual resulting field values with existing media collector/encoder, including subtree rename/removal, rather than prefix substitutions. Do not change revision, timestamps or audit columns. Guard reference-affecting concurrent mutations as part of fingerprint/state verification. Public-state/outbox behavior remains the existing once-per-final-mutation rule.

Do not split model rewrites across independently committed batches: this would violate final atomicity. Read pages are bounded but final mutation size grows with affected snapshots, as existing sync writes can affect many rows. Add a representative multi-page D1 fixture and verify query/binding/request bounds; if exact rewrite batching cannot fit supported D1 execution limits, stop and revise this design before implementing a staged protocol or imposing a new product limit. SQL schema stays unchanged; both adapters and memory doubles receive the same rewrite contract.

### 5. Keep diagnostics useful and permissions unchanged

Preserve scalar report fields/codes and introduce nested `schemaPath`/concrete `path` evidence consistently for classification, default rejection, constraint failure and collisions. Keep the 20-snapshot finding cap, total snapshot counts and deterministic ordering. CLI check uses preparation only, with existing exit codes. Add no HTTP write surface or permissions; synchronization remains the operator action. Use existing structured migration findings for invalid block output and existing stale-plan failures for concurrency. Do not log full snapshots or defaults.

## Risks / Trade-offs

- Model and block operations can pass separately and fail together → combined final evaluation plus actual intermediate-unit checks before writes.
- Parent moves can corrupt media usage if only the root path is changed → rebuild the full model-field reference set from transformed JSON.
- Full validation can remove published grandfathering → validate changed constraints and global safety/limits separately; regression fixtures cover missing unrelated required values.
- D1 batch size can grow with rewritten snapshots → bound read pages, parameterize writes, exercise multi-page limits and stop for a planning revision if atomic capacity needs a different design.
- Hints retained across environments can be reapplied → baseline pairing, inert already-applied rules, idempotence and ancestor-rename tests.

## Migration Plan

During apply, first replace the explicit CE7A restriction in architecture §8, update ADR 0013's evolution decision and link CE7B from the roadmap. Accepted specs change only through the later explicit synchronization/archive workflow. Implement descriptor/config support, portable diff/evaluation, evidence/migration composition, then both adapters and contracts. No database migration or stored JSON shape conversion is required.

Verify existing scalar fixtures/hashes and nested evolution on memory, SQLite and D1. Document hint examples, refusal recovery and interruption/rerun behavior. Deploy the engine before adopting nested hints; take a matching content/config backup before destructive synchronization. Rollback to the prior engine after adopting composites/nested changes requires matching prior configuration/data backups or an explicit tested conversion; dropping hints alone does not undo JSON rewrites. CE7C/CE7D remain separate changes.
