## ADDED Requirements

### Requirement: Nested plans report schema paths and bounded snapshot evidence
Human and JSON synchronization reports SHALL preserve existing scalar report fields and ordering, and SHALL use absolute schema pointers with `*` list-item segments for nested changes and planned writes. Refusal evidence SHALL name model, change class, schema path, total affected snapshot count and up to 20 named snapshots with entry ID, state and title. Concrete offending values SHALL additionally carry JSON Pointers with numeric indices, for example `/fields/links/2/title`. A snapshot SHALL count at most once per finding even if several items fail. Reports SHALL remain deterministic across equivalent insertion orders. Check mode SHALL execute the same prospective evaluation as apply preparation without writes and retain existing exit-code semantics.

#### Scenario: Nested check report
- **WHEN** check mode evaluates a rename in `/links/*/title` and a tightening violated at `/fields/links/2/title`
- **THEN** text and JSON identify the former/new schema paths, the offending snapshot and concrete path, return non-zero and leave models, snapshots, references, public state and outbox unchanged

#### Scenario: Many offending items
- **WHEN** three items of one snapshot and one item of a second snapshot violate the same child constraint
- **THEN** the finding counts two affected snapshots and names each at most once with a concrete offending path

### Requirement: Nested synchronization preserves guarded atomic application
Nested model-field transformations and complete `$fields` reference rebuilding SHALL commit in the same guarded final mutation as model identities/baselines and public version/build work on Node and D1. Container renames/removals SHALL handle all descendant references without affecting `$seo` or retained block references. Root scalar paths SHALL remain legacy field keys and nested usage paths SHALL remain relative JSON Pointers. Final model rewrites SHALL preserve snapshot revisions, audit actors/timestamps, title, slug and unrelated values; block migration revision/audit rules SHALL remain unchanged.

Planning SHALL use bounded pages and fingerprint-bound, JSON-safe scan evidence sufficient to re-decide the plan without executable migrations. Data-dependent nested changes SHALL count/check complete prospective snapshots, including block data needed for aggregate limits. Apply SHALL reject intervening saves, publication, duplication, media-reference changes or synchronization that changes the guarded state. The final mutation SHALL roll back completely on failure; valid no-op synchronization SHALL write nothing. Block migrations SHALL retain the existing guarded per-entry units and final replan comparison. An interruption after committed migration units SHALL leave the old model baseline/public state until a successful rerun; committed units SHALL remain safe and SHALL NOT be migrated twice.

#### Scenario: Atomic nested media rewrite
- **WHEN** a parent containing nested media is renamed and another nested media field is removed
- **THEN** JSON and all descendant `$fields` references change atomically, unaffected sources stay unchanged and published state advances once with one pending build request

#### Scenario: Concurrent edit rejects a nested plan
- **WHEN** an editor saves a list item after planning a nested rewrite
- **THEN** apply rejects the stale plan without committing any final model, JSON, reference, public-state or outbox write

#### Scenario: Failed final write rolls back
- **WHEN** a persistence failure occurs after a nested JSON update but before its reference rebuild completes
- **THEN** the final mutation rolls back every nested JSON/reference/model/version/build change on both runtimes

#### Scenario: Interrupted block migration plus model backfill
- **WHEN** a combined plan stops after one entry migration unit and is rerun
- **THEN** it migrates only remaining stale blocks, reapplies prospective validation and commits model backfills and one version/build transition only in the successful final mutation

#### Scenario: Repeated synchronization
- **WHEN** a nested evolution has been successfully applied and the same configuration and hints are synchronized again
- **THEN** the plan is a valid no-op with no content writes, revision changes, public-version increment or build request
