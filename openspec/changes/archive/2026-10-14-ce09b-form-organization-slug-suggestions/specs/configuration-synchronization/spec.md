## ADDED Requirements

### Requirement: Form layout synchronization never rewrites content
Layout-only changes SHALL use the existing guarded projection-only update on Node/SQLite and Cloudflare/D1 with unchanged model/block versions. They SHALL NOT rewrite draft or published snapshots, field or block data/settings, media references or entry revisions. Like other public projection changes, they SHALL advance published-state version once and create or coalesce one pending build request in the same atomic mutation. The existing concurrent-configuration preconditions SHALL remain authoritative; stale plans SHALL fail atomically without content writes. Repeating synchronization after success SHALL produce no further operation.

#### Scenario: Synchronize populated recursive forms
- **WHEN** a model with draft/published groups, lists, media and block settings changes only layouts
- **THEN** synchronization updates presentation identity while all content, revisions and references remain unchanged and published state advances once with one pending build request on both runtimes

#### Scenario: Reject stale layout synchronization
- **WHEN** persisted configuration identity changes after a layout-only plan was created
- **THEN** application rejects the stale plan without partial updates or content changes

#### Scenario: Repeat the same layout update
- **WHEN** synchronization reruns after the layout metadata has been applied
- **THEN** the plan has no operations
