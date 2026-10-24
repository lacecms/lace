## ADDED Requirements

### Requirement: Content lifecycle maintains internal URL projections atomically
Create, save, publish, revert, duplicate, delete and unpublish SHALL maintain the
descriptor-derived internal URL projection and incoming dependency revisions in
the same mutation as source JSON/snapshot pointers. Publication SHALL recheck
delivered targets within its guarded commit. Unchanged draft reference tuples
SHALL NOT be deleted/reinserted on unrelated edits. Source deletion SHALL remove
outgoing usages, while target deletion SHALL preserve surviving sources' IDs and
usages. Publication/revert/duplicate SHALL preserve paths and remap new block
keys where applicable. No stored reference SHALL require scanning arbitrary JSON
to answer impact queries. Existing media, revision, audit and build semantics
SHALL remain intact. Existing unavailable links SHALL not block target-only
route/title publication when that target has no unavailable outgoing links.

#### Scenario: Unrelated draft edit
- **WHEN** a title-only save leaves every outgoing reference tuple unchanged
- **THEN** draft revision advances normally, reference rows and dependency revisions remain unchanged, and no build is requested

#### Scenario: Reorder or duplicate
- **WHEN** reference-bearing list items are reordered or their entry is duplicated
- **THEN** locations follow current indices and copied block keys, with no stale usages and no publication of the duplicate

#### Scenario: Lifecycle write fails midway
- **WHEN** a fault occurs after content changes but before reference/counter writes finish
- **THEN** the entire mutation rolls back on Node and D1, including the build queue and dependency revisions

### Requirement: Destructive confirmation is guarded and replay-safe
Delete/unpublish SHALL apply the impact contract of internal-url-links in the
same transaction as existing target preconditions, public-state advance and
outbox write. Unpublish idempotency SHALL include the confirmation input and
replay a committed success before checking now-obsolete receipt state; changed
input under the same key SHALL conflict. Delete SHALL retain existing revision
guards; a retry after deletion SHALL report the existing not-found behavior
without mutating other content. Receipt failures SHALL preserve all target and
source state. Read-only impact access SHALL require `content:read`, while
mutations SHALL retain their existing permissions.

#### Scenario: Lost unpublish response
- **WHEN** an acknowledged unpublication commits and its response is lost
- **THEN** a retry with the same idempotency key and input replays success without a second state bump or build

#### Scenario: Unconfirmed direct API call
- **WHEN** a caller bypasses the dialog and removes a target with published-visible incoming links without acknowledgment
- **THEN** the application returns `CONTENT_LINKS_IN_USE` without writes
