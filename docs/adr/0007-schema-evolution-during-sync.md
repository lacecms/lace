# ADR 0007: Evolve populated content models during configuration sync

- Status: Accepted
- Date: 2026-10-10
- Governing architecture: [section 4.7](../mvp-architecture.md#47-published-content-is-immutable),
  [section 8](../mvp-architecture.md#configuration-projection),
  [section 9.1](../mvp-architecture.md#91-content-models), and
  [section 9.3](../mvp-architecture.md#93-content-snapshots)
- Related: [content and editor roadmap](../content-editor-roadmap.md) step CE1,
  OpenSpec change `ce01a-structure-baseline-compatible-changes`

## Context

Until CE1A, `lace content sync` stored only a structural hash per model and
refused every structural change to a model that had a draft or published
snapshot. A live site could not add an optional field or allow a new block
type without manual database work. The hash also removed every `label` and
`description` key at any depth, so a field named `description` was invisible
to structural identity.

## Decision

1. `content_models` stores the canonical structure of the last successful
   sync (`structure_json`) and the structural hash it was written for
   (`structure_json_hash`). A baseline is valid only while that hash equals
   `structure_hash`, which SQL can check on both runtimes; an engine that does
   not maintain baselines invalidates them by changing the hash.
2. The canonical structure strips display metadata only from model, field and
   block definitions. Runtime models carry their structure and, when it
   differs, the hash of the earlier algorithm so that the first sync after the
   upgrade records a baseline without a version bump.
3. Sync diffs the baseline and the configured structure and classifies each
   change as compatible, display, validated, destructive, migration or
   breaking. Data-dependent decisions read snapshots through a bounded
   repository scan; the scan result is valid only for a per-model snapshot
   fingerprint (count, revision sum, update-time sum and maximum) that is part
   of the guarded stored state.
4. Defaults of new or newly defaulted fields are backfilled with one set-based
   `json_set` update per field in the same guarded mutation that records the
   model, without changing revisions, audit actors or timestamps. Published
   snapshot rewrites advance `published_state.version` and request one build.
   Applies that only record baselines do neither.

## Alternatives considered

- **Keep the lossy hash and store the lossy structure.** Rejected: fields named
  `description` would silently escape diffing, validation and backfill.
- **Verify baselines by re-hashing in the application.** Rejected: neither
  Node's synchronous transaction nor D1's batch guard can run Web Crypto.
- **Guard each scanned snapshot by ID and revision.** Rejected: the guard
  would grow with the content and exceed D1 statement limits; per-snapshot
  guards arrive with block migrations, where each snapshot is rewritten.
- **Bump draft revisions on backfill.** Rejected for CE1A: the backfilled value
  equals what validation adds on the next save, and a revision bump would turn
  every published entry into "changed".

## Consequences

- The first sync after upgrading reports `record-baseline` operations and must
  run once; it does not trigger a build.
- Any content edit during sync makes the plan stale; the operator reruns.
- Destructive hints (CE1B) and block migrations (CE1C) build on the baseline
  and classification.
