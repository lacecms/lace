## ADDED Requirements

### Requirement: Composite data is safely inspectable before nested authoring
Before generic composite authoring ships, group/list fields SHALL have explicit
labeled read-only inspection with an indication that nested editing is pending.
Existing scalar controls SHALL remain usable. Loaded composite values SHALL
survive draft initialization, unrelated scalar saves, dirty comparison,
discard/reload, conflict JSON, revert and block duplication without coercion,
new item IDs or loss of explicit empty objects/arrays. Local validation SHALL
use recursive draft rules so incomplete required descendants and list minima
do not block saving. Server composite issues SHALL remain visible in the
validation summary and identify the nested location; exact leaf-control focus
and list mutation actions are deferred to generic nested authoring.

#### Scenario: Save an unrelated scalar
- **WHEN** an editor opens nested data, changes only the title or a scalar field and saves
- **THEN** all composite values and order remain unchanged and the editor does not crash

#### Scenario: Conflict JSON preserves data
- **WHEN** that save conflicts and the editor copies local JSON
- **THEN** the JSON contains the exact nested values, including `{}` and `[]`

#### Scenario: Read-only viewer
- **WHEN** a viewer opens an entry containing groups/lists
- **THEN** the values are inspectable and no mutation control is available

#### Scenario: Incomplete composite draft
- **WHEN** loaded composite content lacks a required descendant or is below minItems and an unrelated scalar is edited
- **THEN** local draft validation permits saving while publication still reports the nested problem
