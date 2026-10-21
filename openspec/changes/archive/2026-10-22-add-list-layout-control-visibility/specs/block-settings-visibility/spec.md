## Purpose

Defines bounded conditional presentation of scalar block settings while preserving
stored values, portable metadata, unconditional validation and reachable errors.

## ADDED Requirements

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
encodings, hashes and UI. Only scalar declared block settings SHALL support these
rules; model fields, block data, group/list items and block-envelope fields SHALL
not acquire conditional behavior.

#### Scenario: Valid custom block
- **WHEN** a custom block declares an unconditional required `arrangement` select and a `wrap` boolean with a visibility rule for one option
- **THEN** metadata round trips and the admin presents wrap only for that option without a custom editor or built-in block knowledge

#### Scenario: Reject invalid dependency graphs
- **WHEN** a rule references a missing/non-select/optional controller, references itself, targets an undeclared setting, uses undeclared/duplicate options or makes a conditional target control another setting
- **THEN** configuration and forged metadata validation reject it before editing with the affected metadata path

### Requirement: Hidden settings retain ordinary value and validation semantics
Changing visibility SHALL NOT clear, reset, omit, normalize away or unregister a
setting's authored value. Draft saves, publication, exports, duplication, revert,
discard, mode switches and revision-conflict recovery SHALL retain existing
scalar behavior. Defaults, type/option checks and requiredness SHALL remain
unconditional and identical on Node and Cloudflare. Invalid inapplicable settings
SHALL still fail at their ordinary setting paths. Hiding a setting SHALL NOT grant
permissions, alter the block hidden-on-site envelope, or change public rendering.

The generic admin SHALL reveal a setting with a relevant validation issue even
when its predicate does not match, associate its error/guidance, and explain its
temporary visibility. Validation-summary activation SHALL reveal containing
settings tabs/disclosures and focus the control. Resolving/clearing its relevant
error SHALL restore predicate-based visibility. A publication-only problem ignored
for a hidden-on-site block SHALL not count as a relevant error. Server metadata
and UI visibility SHALL NOT be relied upon to bypass validation or authorization.

#### Scenario: Retain an inactive choice
- **WHEN** an editor chooses a grid preset, switches to flex and saves
- **THEN** the hidden preset is included unchanged and returning to grid restores its selection

#### Scenario: Refuse invalid inactive data
- **WHEN** an API caller supplies an invalid hidden setting on either runtime
- **THEN** save fails at that scalar's ordinary path without partial writes

#### Scenario: Reach and fix a hidden error
- **WHEN** a hidden setting has a relevant server validation error
- **THEN** its control is revealed and focusable from the summary without changing the controller, and becomes hidden again after correction

#### Scenario: Authorization and request locks
- **WHEN** a viewer reads the block or an editor has a lifecycle request pending
- **THEN** visibility follows the same predicate/error rules and existing mutation restrictions remain enforced
