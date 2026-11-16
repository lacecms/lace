## ADDED Requirements

### Requirement: Build history can be traversed from Admin
Builds SHALL load the newest page first and offer an accessible Load more
action for successive pages. Every loaded row SHALL retain the existing
detail and status behaviors, including administrator retry for eligible
records. Polling and manual request or retry refreshes SHALL preserve a
coherent newest-first list without duplicating rows. The entry editor SHALL
continue its bounded current build-status polling independently of the
history pages opened on Builds.

#### Scenario: An administrator reaches older build history
- **WHEN** an administrator opens Builds and loads the next page
- **THEN** the older rows are appended in order and detail and retry behave
  as they do for eligible rows on the first page

#### Scenario: A new build appears during polling
- **WHEN** Builds has loaded more than one page and a poll detects a new
  build newer than the displayed rows
- **THEN** it appears first and no build is shown twice across the refreshed
  pages

### Requirement: Operational lists recover from invalid continuations
Admin SHALL keep cursors for Users, Pending invitations, Builds and
Assistant connections in query state. Each list SHALL advance beyond the
loaded pages through its own continuation action and keep existing items
visible if that request fails. For an invalid continuation it SHALL offer
to reload the affected list from the first page and discard the rejected
continuation. Session failures SHALL follow the existing session recovery path.

#### Scenario: Loading another page returns an invalid cursor
- **WHEN** an authorized Admin client requests a second page and receives
  the `/after` validation failure
- **THEN** the first page remains visible, the recovery action requests
  without `after`, and the invalid cursor is discarded on restart
