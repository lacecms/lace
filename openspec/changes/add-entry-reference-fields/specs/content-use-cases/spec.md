## MODIFIED Requirements

### Requirement: Reverting a draft restores the published content
The revert use case SHALL accept an entry identity and the expected draft
revision, read the entry's current published snapshot identity, and invoke one
guarded atomic revert command with the application clock time and actor.
Restoring the snapshot SHALL pass entry-reference draft admission, including
cycle checks against other current saved drafts and the retained-missing
selection rule. On successful admission the command SHALL copy the published
title, slug, fields, schema version, blocks, and media references into the
draft, advance the draft revision exactly once, record the actor and time as
the draft's last update, and set the published snapshot's revision to the new
draft revision. It SHALL not change public content, the published-state
version, or build work. An entry without a current publication SHALL fail
with `CONTENT_NOT_PUBLISHED`. A stale draft revision, or a publication
replaced or removed after it was read, SHALL fail with
`CONTENT_REVISION_CONFLICT` and leave the draft unchanged.

#### Scenario: Revert abandons saved draft changes
- **WHEN** an editor reverts a published entry whose saved draft changed the
  title, slug, a field, a block, and a media reference
- **THEN** the draft equals the published values, the draft revision advanced
  once, media usage of the draft matches the publication, the entry status is
  `published`, and the published-state version is unchanged

#### Scenario: Revert at a stale revision fails
- **WHEN** a draft save commits after the caller read revision 4 and the caller
  reverts with expected revision 4
- **THEN** revert fails with `CONTENT_REVISION_CONFLICT` and the saved draft
  remains

#### Scenario: Revert of a never-published entry fails
- **WHEN** a caller reverts an entry that has no published snapshot
- **THEN** it fails with `CONTENT_NOT_PUBLISHED` and the draft is unchanged

#### Scenario: An otherwise valid publication would close a draft cycle
- **WHEN** A publishes a reference to B, A's draft clears it and B's draft selects A, and an editor tries to revert A
- **THEN** the operation reports the cycle at A's reference without changing either revision, the draft or build work

### Requirement: Destructive confirmation is guarded and replay-safe
Delete/unpublish SHALL apply the impact contracts of internal-url-links and
entry-reference-fields in the
same transaction as existing target preconditions, public-state advance and
outbox write. Unpublish idempotency SHALL include the confirmation input and
replay a committed success before checking now-obsolete receipt state; changed
input under the same key SHALL conflict. Delete SHALL retain existing revision
guards; a retry after deletion SHALL report the existing not-found behavior
without mutating other content. Receipt failures SHALL preserve all target and
source state. Current delivered published typed usages SHALL block removal
even with a current URL acknowledgment. Deleting with incoming draft typed
usages requires its own current confirmation. Draft typed usages SHALL NOT
require that confirmation for unpublication. Read-only impact access SHALL require `content:read`, while
mutations SHALL retain their existing permissions.

#### Scenario: Lost unpublish response
- **WHEN** an acknowledged unpublication commits and its response is lost
- **THEN** a retry with the same idempotency key and input replays success without a second state bump or build

#### Scenario: Unconfirmed direct API call
- **WHEN** a caller bypasses the dialog and removes a target with published-visible incoming URL links, no typed usages and no URL acknowledgment
- **THEN** the application returns `CONTENT_LINKS_IN_USE` without writes

#### Scenario: A draft-only receipt cannot override a newly published use
- **WHEN** a source publishes its typed selection between reading draft deletion impact and submitting the reviewed deletion
- **THEN** deletion fails with the current published blocker, and the source, target and committed publication work stay intact
