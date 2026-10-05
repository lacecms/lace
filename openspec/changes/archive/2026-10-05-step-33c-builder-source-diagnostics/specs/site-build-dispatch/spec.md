## ADDED Requirements

### Requirement: Known build failures retain bounded diagnostics across persistence
The closed site-build failure vocabulary SHALL be `source_invalid`, `source_symlink`, `source_unreadable`, `source_missing`, `source_special_file`, `install_failed`, `build_failed`, `version_changed`, `trigger_unavailable`, `build_timeout`, `invalid_build_event`, and `provider_failed`. Known reasons SHALL be preserved through trigger, dispatch, durable build failure and authenticated history/detail. Unknown reasons SHALL become `provider_failed`, with no associated path. Optional source paths SHALL be validated against the builder diagnostic contract at each trust boundary and SHALL be absent for non-source reasons. Invalid optional paths SHALL be discarded while preserving a recognized reason. SQLite and D1 SHALL preserve identical diagnostics and SHALL continue reading legacy reason-only errors; malformed stored diagnostics SHALL safely fall back without revealing their original contents. Outbox failure text and structured logs SHALL contain the closed reason and build/event correlation only, never raw responses, errors or subprocess output.

#### Scenario: Recognized builder failure survives dispatch
- **WHEN** a builder fails with `source_symlink` and path `src/components/linked.astro`
- **THEN** dispatch persists that reason and path in the same claimed failure update and both history and detail return them instead of `provider_failed`

#### Scenario: Failure awaits retry or exhausts attempts
- **WHEN** a recognized source failure occurs before the attempt limit or on the eighth attempt
- **THEN** the same diagnostics are readable respectively on the existing pending build or terminal failed build, preserving the current retry schedule

#### Scenario: Old or malformed stored error
- **WHEN** either runtime reads a legacy `install_failed` error or malformed/unknown structured error
- **THEN** the legacy row returns `install_failed` without a path and the malformed/unknown row returns only `provider_failed`

#### Scenario: Path attempts to leak a configured location
- **WHEN** a trigger or stored diagnostic supplies a recognized source reason and an absolute, escaping, excluded or overlong path
- **THEN** the recognized reason remains available but no path or raw value reaches persistence output or authenticated DTOs

#### Scenario: Claim ownership changes
- **WHEN** a stale dispatcher tries to record a result after its claim is recovered
- **THEN** it changes neither the recovered lifecycle nor its diagnostics

#### Scenario: Retry succeeds
- **WHEN** corrected source builds successfully on the retained claim or a new administrator retry
- **THEN** success carries no stale failure diagnostic and the original failed row remains unchanged when a new retry row was created

## MODIFIED Requirements

### Requirement: Node dispatch invokes the private fixed-command builder
The Node/VPS site-build trigger SHALL send only the build ID and target version to the private builder with the dedicated secret, map its synchronous success or sanitized failure to the existing durable build lifecycle, and treat unavailable or malformed builder responses as retryable trigger failure. It SHALL accept the existing reason-only failure response and the additive bounded optional `path` field, preserve recognized builder reasons, discard unsafe optional paths, and reject unknown reasons, extra fields, inconsistent status/summary and responses exceeding 1024 UTF-8 bytes. Cloudflare SHALL use its own trigger adapter under the same application port and diagnostic/persistence rules.

#### Scenario: Builder succeeds
- **WHEN** the builder reports success for a dispatched build
- **THEN** the dispatcher may record synchronous success for that build

#### Scenario: Builder is unavailable
- **WHEN** the builder cannot be reached or returns an invalid response
- **THEN** the dispatcher records a sanitized `trigger_unavailable` failure and leaves publication committed

#### Scenario: Old builder response
- **WHEN** a builder returns its valid existing `source_invalid`, `install_failed`, `build_failed` or `version_changed` response without `path`
- **THEN** the specific reason is preserved and no path is inferred
