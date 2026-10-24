## ADDED Requirements

### Requirement: Schema rewrites maintain URL reference projections and impact
Every model-field/block-data rewrite, field rename, list/group rewrite, block
migration, hidden-state change and existing field/block pruning SHALL update internal URL
locations, delivery flags and incoming revisions in the same guarded unit as
its content changes. Ordinary URL grammar extension SHALL not itself rewrite
existing manual URLs or add descriptor identity metadata. Existing provider
restriction classifications SHALL remain unchanged. Configuration sync SHALL
retain its existing prohibition on removing any model while entries exist,
including page/global singletons and collections with linked targets. Existing
destructive field/block hints SHALL NOT bypass that prohibition. This change
SHALL NOT add a model-deletion operation, a model-removal impact receipt or a
CLI impact override. Existing field/block pruning SHALL remove outgoing
reference locations atomically. Route-only changes SHALL preserve tokens and
follow existing public version/build behavior without rewriting incoming sources.
New or changed delivered references introduced into published content through
defaults or migrations SHALL satisfy publication target checks against the
prospective post-sync route set. Existing unavailable references left unchanged
SHALL not prevent unrelated schema updates. No schema rewrite SHALL bypass
the target checks for newly introduced or changed delivered references.
Block settings SHALL retain their existing allowlist and required-default
contract. Settings-only changes SHALL NOT introduce internal-reference rows or
change the link graph when reference locations/delivery and source snapshot
identity/phase remain unchanged.

#### Scenario: Populated model removal remains prohibited
- **WHEN** sync removes a page model still linked by a published navigation global
- **THEN** planning reports `REMOVAL_HAS_ENTRIES` and apply refuses without removing entries, routes or references

#### Scenario: Removing source and target models cannot bypass the prohibition
- **WHEN** a sync plan removes both a linked target and its only published source
- **THEN** the populated-model removal prohibition remains in force for both models, without a confirmation override

#### Scenario: A new default would publish an unavailable destination
- **WHEN** sync would backfill an entry reference into published snapshots and that destination has no prospective published route
- **THEN** sync rejects the new reference before the affected mutation instead of bypassing publication checks

#### Scenario: Rewrite fails or is interrupted
- **WHEN** a guarded nested/block rewrite fails or a resumable migration stops
- **THEN** each committed unit has coherent content, references and incoming revisions, and rerun follows existing recovery/version rules
