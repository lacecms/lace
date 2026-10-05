## ADDED Requirements

### Requirement: Scheduled runs check due tracked deployments
Each scheduled invocation SHALL, after site-build dispatch and isolated from the other dispatchers, claim at most 5 due tracked builds through a 60-second check lease and check each once. Post-commit passes SHALL NOT poll the provider. A failure while tracking SHALL be logged without secrets and SHALL NOT prevent media-deletion dispatch. Claims, check records and completions SHALL keep the whole scheduled invocation within 50 D1 queries. A Worker restart or terminated invocation SHALL lose no tracking state: a claimed but unfinished check becomes due again after its lease.

#### Scenario: Many tracked builds are due
- **WHEN** more than 5 tracked builds are due in one scheduled run
- **THEN** at most 5 are checked, the rest stay due for later runs, and the run stays within 50 D1 queries

#### Scenario: Restart during tracking
- **WHEN** an invocation claims a tracked build check and terminates before recording it
- **THEN** a scheduled run of a newly composed Worker after the 60-second lease checks the same deployment and records its outcome

#### Scenario: Tracking throws
- **WHEN** the tracker fails during a scheduled run
- **THEN** media deletion still runs and the log names only the tracking component and a closed reason
