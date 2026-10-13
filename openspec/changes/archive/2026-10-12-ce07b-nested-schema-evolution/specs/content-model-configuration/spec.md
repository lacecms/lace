## ADDED Requirements

### Requirement: Nested model synchronization hints use schema paths
Model field normalization SHALL accept `renamedFrom` on every named root or group child field, including group children reached through lists. It SHALL name a former sibling key, never a path or index. Internal rename mappings SHALL use root keys for root fields and absolute schema pointers for descendants. Model `removedFields` SHALL accept legacy root keys and absolute schema pointers whose named segments obey the field-key grammar and whose `*` segment selects every list item. `/links/*/legacy` SHALL select `legacy` in every group item of `links`; `/profile/legacy` SHALL select a group child. `/title` and `title` SHALL normalize to the same root address. An item itself SHALL NOT be a removal target.

Hints SHALL be temporary synchronization input, recursively absent from admin/public field metadata, runtime field descriptors, structural identity and projection identity; runtime model synchronization mappings SHALL retain them. Duplicate normalized paths, configured removal targets, shared rename sources within one sibling map, self-renames and rename-source/removal overlap SHALL fail before startup. Invalid path grammar, indices, misplaced wildcards and cross-parent rename paths SHALL be rejected. Removal paths SHALL be resolved against the paired baseline/configuration during planning; a valid path absent from the baseline SHALL be inert, while traversing a known non-container or using `*` at a known non-list SHALL be invalid.

Nested removal paths SHALL use configured ancestor names. The planner SHALL map renamed ancestors to baseline names before evaluating child hints. Overlapping ancestor/descendant removals SHALL be rejected as redundant; a removal below a renamed ancestor SHALL be permitted. Nested hints on a newly added ancestor SHALL be rejected because there is no former sibling context. Already-applied hints SHALL be inert under the existing baseline rules.

#### Scenario: Rename and remove in every list item
- **WHEN** `links` has group children `title` renamed from `headline` and omits `legacy`, and the model declares `removedFields: ["/links/*/legacy"]`
- **THEN** normalization retains the two synchronization paths, strips the child hint from all projected descriptors and leaves data/default keys intact

#### Scenario: Preserve root compatibility
- **WHEN** a model uses the existing root `renamedFrom` and `removedFields: ["legacy"]` syntax
- **THEN** its normalized hints and scalar configuration hashes remain compatible

#### Scenario: Reject ambiguous addresses
- **WHEN** hints use `/links/0/title`, `/links/*`, `profile.title`, a cross-parent rename, duplicate `title` and `/title` removals or a rename source also removed
- **THEN** normalization refuses the hints and names the offending path

#### Scenario: Parent and child rename
- **WHEN** `cards` is renamed from `links` and its child `title` is renamed from `headline`, with removal `/cards/*/legacy`
- **THEN** planning pairs the ancestors first and resolves both child operations against former `links` items

#### Scenario: Repeat with retained hints
- **WHEN** synchronization already applied those nested hints and an unrelated structural change is planned
- **THEN** the retained hints do not repeat the rewrite or cause a missing-source diagnostic
