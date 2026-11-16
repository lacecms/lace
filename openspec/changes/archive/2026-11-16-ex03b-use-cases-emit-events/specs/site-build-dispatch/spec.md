## ADDED Requirements

### Requirement: Use cases explicitly request site builds

The portable mutation command SHALL carry a `site.build.requested` event
request from the application whenever the operation requests a build:

- Publish, unpublish and deletion of a published collection entry SHALL
  supply reason `publication`, the acting principal's ID and the operation time.
  Publication SHALL name the new snapshot, including for route-less
  entries. Unpublication and published deletion SHALL name the snapshot
  they are removing. Deletion of a draft-only entry SHALL supply no build
  request.
- A change to media alt text, caption or focal point SHALL supply a
  conditional request with reason `media_metadata`, the editing actor,
  the effective metadata update time and a null snapshot. The write SHALL
  increment the published-state version and enqueue the event only if a
  current published snapshot references the media at the time of the
  guarded write. Tag-only edits and unchanged submissions SHALL supply no
  build request.
- Configuration synchronization SHALL supply one request with reason
  `configuration_sync`, actor `system:content-sync`, the final apply time
  and a null snapshot when the reviewed final plan advances public state.
  The request SHALL take effect only in the revalidated final mutation.
  Preview, resumable migration units, no-op apply, baseline-only apply
  and other applies with no public effect SHALL enqueue no build work.
- An administrator's manual build request SHALL supply reason `manual`,
  and an explicit retry SHALL supply reason `retry` and the selected
  build ID as retry source. Both SHALL use the requester and request time
  and a null snapshot. Neither SHALL increment the published-state version.

Each admitted operation that advances public state SHALL increment it once
and enqueue or coalesce its supplied build event in the same atomic write.
The event and any queued result SHALL use the target selected by that write
under the existing coalescing rules.

#### Scenario: Content lifecycle commands supply a snapshot-specific build request

- **WHEN** an authorized publication, unpublication or deletion of a
  published entry commits
- **THEN** the pending request records the operation's actor, time, reason
  and new or removed snapshot as specified above, with the version that
  mutation committed

#### Scenario: A publication changes media reachability before a metadata write

- **WHEN** a descriptive metadata edit is prepared and a publication or
  unpublication adds the first or removes the last current published
  reference before the guarded media write
- **THEN** the edit commits one version increment and build request only
  if a current published reference exists at the write, and otherwise
  reports no build queued

#### Scenario: A synchronization becomes stale before its final mutation

- **WHEN** a public-changing sync supplies a build request and its final
  revalidation or write guard fails
- **THEN** it commits neither a final public version increment nor a build
  insert or coalesce

#### Scenario: An explicit build request reads the current version

- **WHEN** an administrator requests a build or retries an eligible one
- **THEN** the queue receipt and event use the published-state version at
  enqueue, including zero before the first publication, without adding
  a version increment

#### Scenario: An ordinary draft change produces no build work

- **WHEN** an entry is created, duplicated, saved, reverted or deleted
  with no change to the current public projection
- **THEN** the command commits no version increment, build event or
  build coalesce
