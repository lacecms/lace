## ADDED Requirements

### Requirement: Group-valued lists support portable item labels
A list descriptor SHALL accept optional `itemLabel`, a field key naming an
immediate text, textarea, select or URL child of its group item. Builders and
all recursive metadata boundaries SHALL reject non-string keys, missing keys,
nested paths, unsupported child kinds and itemLabel on a scalar-valued list or
another descriptor kind. Valid metadata SHALL be detached portable JSON and
SHALL NOT change inferred content values, runtime content validation, defaults,
list bounds or stored item shape. No callback or template execution is allowed.

#### Scenario: Valid label metadata
- **WHEN** a list of groups with a title text child declares itemLabel title
- **THEN** its normalized and JSON-round-tripped metadata retain itemLabel and its inferred values remain arrays of the same group objects

#### Scenario: Invalid label targets
- **WHEN** itemLabel names a nested path, absent child, media/group/rich-text child, or is supplied on a scalar list
- **THEN** definition and forged metadata validation reject it with the descriptor path before use

#### Scenario: Content remains independent of presentation
- **WHEN** itemLabel changes between two permitted children
- **THEN** previously valid content remains equally valid with unchanged defaults and no extra stored keys
