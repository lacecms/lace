## ADDED Requirements

### Requirement: Tracked builds record progress and closed reasons
While a tracked build is `running`, the runtime SHALL record the latest provider stage from a closed vocabulary (`queued`, `initialize`, `clone_repo`, `build`, `deploy`), the time of the last successful provider check, and the next due check, all guarded by build ID, provider ID, and `running` status. A tracked completion SHALL store a reason only from the vocabulary of its outcome: `failed` uses `provider_build_failed`, `provider_deploy_failed`, or `provider_failed` (any other value becomes `provider_failed`); `cancelled` uses `provider_cancelled` or `provider_skipped`; `unknown` uses `tracking_forbidden`, `tracking_not_found`, `tracking_rejected`, `tracking_timeout`, or `tracking_unconfigured`; any other reason for `cancelled` or `unknown` SHALL be stored as no reason. `succeeded` SHALL store no reason. Parallel tracked builds SHALL each be checked and completed only for their own provider ID, and a late or repeated result SHALL never change another build or a terminal one.

#### Scenario: Parallel tracked builds
- **WHEN** builds A (`dep-a`) and B (`dep-b`) are both tracked and Pages reports `dep-b` succeeded while `dep-a` is still building
- **THEN** B becomes `succeeded`, A stays `running` with stage `build`, and neither record carries the other's data

#### Scenario: Unknown with a foreign reason
- **WHEN** a tracked build is completed as `unknown` with reason `provider_build_failed`
- **THEN** it is stored as `unknown` without a reason
