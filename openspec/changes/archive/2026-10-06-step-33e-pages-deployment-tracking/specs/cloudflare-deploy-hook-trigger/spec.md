## ADDED Requirements

### Requirement: Identified acceptance is tracked when Pages tracking is configured
When Pages deployment tracking is configured, a deploy-hook acceptance carrying a valid provider deployment ID SHALL be returned as the tracked outcome, so the build stays `running` with that ID and its outbox event completes. An acceptance without a valid ID SHALL remain terminal `accepted` without a provider ID, and failure mappings SHALL be unchanged.

#### Scenario: Tracked hook acceptance
- **WHEN** tracking is configured and the hook returns `{"success":true,"result":{"id":"dep-1"}}`
- **THEN** the build stays `running` with provider ID `dep-1`, its event is completed, and it becomes due for a tracking check

#### Scenario: Tracked installation, hook without ID
- **WHEN** tracking is configured and the hook returns 2xx without a valid ID
- **THEN** the build becomes `accepted` without a provider ID and is never polled
