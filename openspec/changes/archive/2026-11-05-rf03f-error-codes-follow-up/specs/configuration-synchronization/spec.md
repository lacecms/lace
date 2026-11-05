## ADDED Requirements

### Requirement: A stale synchronization plan fails with a stable code
When applying a synchronization plan is refused because the plan no longer
matches current stored state, the failure SHALL carry the stable code
`CONFIGURATION_SYNC_STALE`. This covers the final mutation's guards, a changed
block-migration result, a failed block-migration guard and a fresh plan that
differs from the reviewed one. It SHALL keep its current human-readable
message. The Node and Cloudflare repositories, the application apply path and
the in-memory test store SHALL raise the same code. Callers that tell a user
to review and rerun synchronization (the local `content:sync` command and the
CLI) SHALL recognize a stale plan by this code, never by its message text.
Other synchronization failures SHALL keep their current codes.

#### Scenario: A stale plan is reported by code
- **WHEN** a draft is saved after a plan was prepared and the plan is then
  applied on Node or Cloudflare
- **THEN** apply fails with code `CONFIGURATION_SYNC_STALE` and no write

#### Scenario: Rerun guidance does not depend on wording
- **WHEN** a stale plan failure reaches `pnpm content:sync` or the CLI sync
  command with a reworded message
- **THEN** the command still prints its rerun guidance, because it tests the
  code

#### Scenario: Other failures are not mistaken for stale plans
- **WHEN** apply fails with an invalid-content failure whose message contains
  the word "stale"
- **THEN** the commands report it as an ordinary failure, without rerun
  guidance
