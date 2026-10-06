## MODIFIED Requirements

### Requirement: Onboarding feedback is traceable to acceptance evidence

The repository SHALL keep a feedback acceptance map that lists every item of the onboarding feedback log with its resolution status, the acceptance stages, tests and documents that prove it, or an explicit decision or deferral. A repository test SHALL fail when a feedback item has no entry, when a referenced acceptance stage or file does not exist, when the deferred CMS-adoption item is not marked deferred, or when the map lists an unresolved defect. Once every item is resolved, decided or deferred, the log and its map MAY move under `docs/archive/`; the test SHALL then read them at their archived paths and keep enforcing the same rules.

#### Scenario: Unmapped feedback item
- **WHEN** a new numbered item is added to the feedback log without a map entry
- **THEN** the traceability test fails naming the item

#### Scenario: Open defect
- **WHEN** the map lists a defect found by the regressions as unresolved
- **THEN** the traceability test fails, so the regression suite is not counted as accepted

#### Scenario: Archived log and map
- **WHEN** the log and map are read from their archived location and a referenced stage or file is removed
- **THEN** the traceability test still fails naming the missing evidence

## ADDED Requirements

### Requirement: Alpha.2 field-trial feedback is traceable to evidence

The repository SHALL keep an acceptance map for the alpha.2 field-trial log that lists each numbered item (§1–§6) and the general diagnostics requirement with a status (`resolved`, `decision`, `deferred` or `open`) and its evidence: acceptance stages, tests and documents, or a recorded decision. Every item whose final confirmation depends on a real Cloudflare account or real server SHALL name that check as owner input to the release gate rather than claim it was verified locally. A repository test SHALL fail when a log item has no row, when a referenced acceptance stage or file does not exist, when a row is `open`, or when a row's evidence is too short to identify proof. Each referenced acceptance stage SHALL be one that the exact-artifact suite runs.

#### Scenario: Complete map
- **WHEN** every alpha.2 item maps to existing exact-artifact stages, tests or documents with a non-open status
- **THEN** the traceability test passes

#### Scenario: Unmapped or open item
- **WHEN** an item lacks a row or is marked `open`
- **THEN** the traceability test fails naming the item

#### Scenario: Real-account confirmation pending
- **WHEN** an item's last confirmation needs a real Cloudflare deployment
- **THEN** the map names the owner check for the release gate and does not present local stub evidence as that confirmation
