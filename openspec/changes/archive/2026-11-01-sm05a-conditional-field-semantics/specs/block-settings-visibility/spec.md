## MODIFIED Requirements

### Requirement: Block settings declare bounded sibling-select visibility
Block definitions SHALL accept optional portable `settingsVisibility` metadata
mapping declared scalar setting keys to rules of exactly `{ setting, values }`.
The controller SHALL be a declared required select with a valid default; `values`
SHALL be a nonempty array of unique declared option strings. Targets SHALL exist
and differ from their controller. A controller SHALL NOT itself have a visibility
rule; chains, cycles, unknown keys/references, malformed values, nonportable values
and additional rule properties SHALL fail with a descriptive configuration path.
Normalization SHALL detach and deeply freeze the metadata and preserve JSON round
trips. REST metadata SHALL reject forged invalid forms using the same rules.

A rule SHALL match when its controller's effective scalar value, including its
normal declared default when absent, belongs to `values`. A target without a rule
SHALL remain visible. Omitted metadata SHALL preserve existing descriptor
encodings, hashes and UI. Only scalar declared block settings SHALL support
`settingsVisibility` rules; model fields, block data, group/list items and
block-envelope fields SHALL NOT accept `settingsVisibility`. Model fields, block
data and group items use the separate `visibility` declaration of the
`conditional-fields` capability, whose hidden values are not required and are
omitted from published content; `settingsVisibility` keeps its presentation-only
semantics, and block-envelope fields acquire no conditional behavior.

#### Scenario: Valid custom block
- **WHEN** a custom block declares an unconditional required `arrangement` select and a `wrap` boolean with a visibility rule for one option
- **THEN** metadata round trips and the admin presents wrap only for that option without a custom editor or built-in block knowledge

#### Scenario: Reject invalid dependency graphs
- **WHEN** a rule references a missing/non-select/optional controller, references itself, targets an undeclared setting, uses undeclared/duplicate options or makes a conditional target control another setting
- **THEN** configuration and forged metadata validation reject it before editing with the affected metadata path

#### Scenario: Settings rules stay separate from data rules
- **WHEN** a block declares `settingsVisibility` for a setting and `visibility` for a data field
- **THEN** the hidden setting keeps unconditional validation and delivery, while the hidden data field follows conditional-field semantics
