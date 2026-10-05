# application-ports-and-commands Specification

## Purpose

Defines portable application contracts and in-memory test behavior that give
later use cases and both runtime adapters one consistent atomic content boundary.

## Requirements

### Requirement: Focused portable content commands and reads

The system SHALL expose application-level input and output contracts,
independent of REST DTOs and database rows, for planning normalized model
synchronization against portable stored-model identity and snapshot summaries;
dry-running and atomically applying a guarded approved synchronization plan;
creating an entry; loading an entry's draft or published aggregate; listing
model entries with an opaque cursor; atomically replacing a complete draft at
an expected revision; atomically publishing a guarded draft with an optional
idempotency key; deleting an entry with caller actor/time; creating, listing,
and loading media metadata; marking unreferenced media for asynchronous
deletion; retrying failed media deletion; listing published entries for one
supplied collection model with an opaque cursor, resolving public content,
loading media that is publicly reachable; reading the current published-state
version; and exporting build content. The model-sync planning and apply
contracts SHALL expose ordered portable operations, diagnostics, fresh-state
guards, and complete outcomes without exposing a database or generic
transaction callback. A complete-draft command SHALL carry the validated media-
reference projection, including its stable source key, field path, and media
identity, rather than requiring an adapter to infer references from arbitrary
JSON. Read operations SHALL be separate from state-changing operations. State-
changing contracts SHALL encode their required guards and complete result rather
than accepting a generic cross-runtime transaction callback. When a guarded
publication supplies an idempotency key, its command contract SHALL bind the
key to the entry, authenticated actor, and complete publication input and SHALL
return the original completed publication result for an identical retry without
performing the publication again. Media creation SHALL accept validated metadata
only after storage success; no media command or result SHALL contain binary
bytes, an HTTP value, a framework type, or a database row.

#### Scenario: A runtime adapter supplies portable entry data
- **WHEN** an application caller requests an entry aggregate, a cursor page for
  one collection's published entries, public data, public media, the current
  published-state version, or build export
- **THEN** the returned contract contains portable domain/configuration values
  and no HTTP, framework, or database-row type

#### Scenario: Model synchronization is planned without a persistence callback
- **WHEN** an application caller compares normalized configuration to portable
  stored-model and snapshot summaries
- **THEN** it receives the deterministic plan, diagnostics, and no-op/apply
  status without a database-row type or general transaction callback

#### Scenario: A guarded synchronization apply crosses runtimes
- **WHEN** an application caller supplies a valid synchronization plan and its
  fresh-state guard to a runtime adapter
- **THEN** the adapter returns a portable complete outcome or rejects the stale
  or invalid plan without exposing a database row or generic transaction
  callback

#### Scenario: A guarded content operation crosses runtimes
- **WHEN** a caller requests entry creation, full-draft save, publication,
  deletion, or later model-sync application
- **THEN** the command declares the guard and complete state change needed for
  one atomic persistence operation without exposing a general transaction
  callback

#### Scenario: Complete draft inputs identify media references
- **WHEN** application validation accepts media fields in snapshot fields or
  block data for a complete draft
- **THEN** the persistence command receives the media identities with `$fields`
  or the stable block key and their field paths, without inspecting arbitrary
  serialized values

#### Scenario: Media metadata remains separate from binary storage
- **WHEN** a caller creates, lists, loads, requests deletion of, or retries
  deletion of media through an application contract
- **THEN** the contracts exchange detached metadata and lifecycle guards only,
  while binary transfer remains at the object-storage capability boundary

#### Scenario: Cursor traversal has no transport dependency
- **WHEN** a caller lists entries for a model or published entries for one
  collection after receiving a continuation cursor
- **THEN** it can pass that opaque cursor back to the application contract and
  receive the next portable page without importing a REST schema

#### Scenario: A conditional export checks only its version
- **WHEN** a caller checks the current published-state version before deciding
  whether to load build-export content
- **THEN** it receives the portable non-negative version without loading the
  complete exported entries

#### Scenario: An identical publish retry is atomic
- **WHEN** an application caller retries guarded publication with the same entry,
  actor, idempotency key, and complete publication input
- **THEN** the command returns the original complete result without replacing the
  publication, changing the public export version, or requiring a second
  downstream build dispatch

#### Scenario: Published deletion persists supplied audit values
- **WHEN** an application caller deletes current published content
- **THEN** persistence receives the caller actor and application-clock time

### Requirement: Portable infrastructure capability boundaries

The system SHALL expose portable capability contracts for binary object storage,
derived caching, site-build triggering, UTC clock reads, unique ID generation,
password-safe opaque-token hashing and verification, and dispatcher-event lease
claiming/completion. Object storage SHALL keep binary data outside the content
database contract. Cache values SHALL be non-authoritative, so a cache miss,
eviction, or delayed invalidation SHALL not alter correct content results. Token
contracts SHALL accept secrets only for hashing or verification and SHALL expose
only a derived verifier for persistence. Lease contracts SHALL identify a bounded
claim, lease expiry, and completion/failure outcome so concurrent dispatchers do
not process one event as separate successful work.

#### Scenario: Cache is unavailable
- **WHEN** a cache capability misses, is evicted, or returns no value
- **THEN** callers can continue from the authoritative content capability and preserve correct content behavior

#### Scenario: A token is stored safely
- **WHEN** a caller creates an opaque build or API token verifier
- **THEN** persistence receives a password-safe derived verifier rather than the plaintext token

#### Scenario: Concurrent dispatchers claim work
- **WHEN** two dispatcher instances attempt to claim the same available event
- **THEN** the lease capability grants it to at most one active lease until that lease expires or is completed

### Requirement: In-memory parity doubles preserve content invariants

The system SHALL provide in-memory application test doubles for the content,
infrastructure, and dispatch capability contracts. The content double SHALL
enforce page singleton cardinality, expected-revision conflicts, globally unique
published routes, exactly one mutable draft per committed entry, and detached
immutable publications. It SHALL make a complete draft save and a guarded
publication appear atomically: failures SHALL leave all stored aggregates,
routes, and public projections unchanged. Returned aggregates and projections
SHALL be detached from future caller mutation.

#### Scenario: A competing page creation is rejected
- **WHEN** an in-memory content double receives a second successful-create request for the same page model
- **THEN** it rejects the request with the stable page-cardinality conflict and retains the original entry unchanged

#### Scenario: Publication retains the previous public value after a draft edit
- **WHEN** an in-memory content double publishes an entry and subsequently saves a changed draft
- **THEN** public reads and build export retain the detached published snapshot while the draft receives exactly one revision increment

#### Scenario: A route conflict does not partially publish
- **WHEN** guarded publication resolves to a route owned by another entry
- **THEN** it rejects the request with the stable route-conflict failure and leaves the candidate draft, existing route owner, and all public projections unchanged

### Requirement: Portable security lifecycle commands preserve guarded outcomes
The system SHALL expose portable, REST- and database-independent contracts for
setup-credential issuance and claim/completion, user lifecycle administration,
opaque build-credential issuance/verification/revocation, and fixed-window
rate-limit decisions. Commands SHALL encode their actor, time, lifecycle
guards, and complete outcome rather than accepting a generic transaction
callback or a persistence row. Persistence-facing values SHALL contain only
derived credential, email-subject, and rate-limit identifiers.

#### Scenario: A runtime adapter implements a security command
- **WHEN** a Node or Cloudflare adapter receives a portable setup, user, token,
or limiter command
- **THEN** it can enforce the documented guarded outcome without importing an
HTTP DTO or exposing a database row to application callers

### Requirement: Portable dispatch and media-finalization commands preserve recovery state
The system SHALL expose portable contracts to claim and conditionally complete
leased asynchronous events with a retry policy, as well as to finalize one
claimed media-deletion event. Media finalization SHALL either remove only a
still-`deleting`, unreferenced media record after its object deletion succeeds,
or record a sanitized terminal deletion failure on that media record. These
contracts SHALL carry no binary data, HTTP values, database rows, credentials,
or raw infrastructure errors.

#### Scenario: A runtime finalizes an object-deletion event
- **WHEN** an adapter receives a valid active lease for one
  `media.delete.requested` event after idempotent object deletion
- **THEN** it can complete the event and remove only the matching eligible media
  metadata through portable command inputs and outputs

#### Scenario: A stale completion is refused
- **WHEN** a dispatcher attempts to finalize or fail an event with an expired,
  replaced, or otherwise invalid lease
- **THEN** the adapter preserves the later event and media state without
  reporting a successful completion

### Requirement: Build commands and trigger outcomes remain portable
The application SHALL expose actor-checked build request/retry commands and portable ports for claiming build work, recording trigger outcomes, and completing tracked provider deployments. Trigger outcomes SHALL distinguish proven synchronous success, untracked provider acceptance with an optional provider ID, tracked provider acceptance with a required provider ID, and failure, without exposing HTTP or database row types. Only proven success SHALL map to `succeeded`; untracked acceptance SHALL map to `accepted`; tracked acceptance SHALL keep the build `running`. The tracked completion port SHALL accept only `succeeded`, `failed`, `cancelled`, or `unknown`. Publication result and durable build-dispatch status SHALL remain independent.

#### Scenario: Publication trigger is unavailable
- **WHEN** publication commits and subsequent site-build triggering is unavailable
- **THEN** publication remains successful and its durable build event remains recoverable

#### Scenario: Runtime reports a synchronous trigger result
- **WHEN** a runtime trigger returns proven synchronous success
- **THEN** the application can persist a succeeded build without requiring a provider ID

#### Scenario: Runtime reports untracked acceptance
- **WHEN** a runtime trigger returns acceptance without tracking, with or without a provider ID
- **THEN** the application persists an `accepted` build and never a `succeeded` one
