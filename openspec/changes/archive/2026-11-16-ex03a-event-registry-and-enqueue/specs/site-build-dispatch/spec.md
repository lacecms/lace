## MODIFIED Requirements

### Requirement: Site-build requests coalesce before claim
The system SHALL enqueue publication, manual and retry requests through the
same durable `site.build.requested` outbox event. Any other mutation that
requests a site build SHALL use that same path. Requests before claim SHALL
use a 5-second debounce from the most recent request and target the latest
published-state version read inside the atomic enqueue, after any increment
by the producer. The target SHALL be zero when no published-state row exists.
A request after claim SHALL create or coalesce the next pending event without
changing the claimed target. Coalescing SHALL retain the pending event's ID
and attempts and any valid retry source unless the new request supplies its
own explicit retry source. If the pending payload is malformed JSON, a valid
new request SHALL replace it and SHALL carry only its own retry source.

#### Scenario: Rapid publications coalesce
- **WHEN** several publications commit within five seconds before a build event is claimed
- **THEN** one pending event targets the newest published-state version and becomes available five seconds after the last request

#### Scenario: Publication follows a claim
- **WHEN** a publication commits after an event is claimed
- **THEN** its version is retained in a distinct pending event and the claimed build's target remains fixed

#### Scenario: Retry is followed by another build request
- **WHEN** a publication or manual request coalesces into pending retry work
- **THEN** the pending event keeps its ID, attempts and retry source while
  its target and deadline reflect the latest request

#### Scenario: An explicit retry replaces pending retry lineage
- **WHEN** an administrator retries a different eligible build before the
  pending event is claimed
- **THEN** the pending event and queue receipt use the latest target and the
  pending payload names the explicitly retried build

#### Scenario: Valid new request replaces unusable pending JSON
- **WHEN** a valid build request coalesces into an unclaimed event whose
  stored payload is malformed JSON
- **THEN** the same event ID carries a valid payload targeting the committed
  version, and only an explicitly supplied retry source is present
