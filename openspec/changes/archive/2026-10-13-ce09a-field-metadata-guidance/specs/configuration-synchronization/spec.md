## ADDED Requirements

### Requirement: Placeholder-only synchronization preserves content
Changing only supported field placeholders SHALL use the existing display/projection update path without a structural model-version increase, default backfill, block migration or draft/published content rewrite. The same behavior SHALL hold on Node and Cloudflare. Existing guarded atomic apply and stale-plan detection SHALL continue to apply.

#### Scenario: Populated model gets new guidance
- **WHEN** an unchanged-version populated model adds, changes or removes a nested field or allowed block placeholder and synchronization succeeds
- **THEN** the plan classifies a display-only update, metadata exposes the new guidance and saved draft/published content values and revisions remain unchanged

#### Scenario: Concurrent synchronization invalidates a plan
- **WHEN** persisted identity changes after a placeholder-only plan is prepared and before it is applied
- **THEN** existing stale-plan guards refuse the apply without partial metadata or content writes
