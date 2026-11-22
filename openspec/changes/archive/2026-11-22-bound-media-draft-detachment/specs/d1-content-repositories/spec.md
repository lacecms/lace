## ADDED Requirements

### Requirement: Detaching media fits each full Worker invocation

The Worker SHALL complete each admission, single-entry step, finish, replay and refusal within 50 D1 statements per authenticated invocation, 40 statements per mutation batch and 100 bound parameters per statement. Accounting SHALL include session resolution, admission and mutation guards, response reads, diagnostics and all D1 work registered with `waitUntil` by that request. An eligible maximum-size draft SHALL fit in one entry step. A limit exception or error-driven partial commit SHALL NOT serve as continuation.

#### Scenario: One through fifty using entries finish under budget
- **WHEN** identical authenticated HTTP scenarios run on Node/SQLite and Worker/local D1 with 1, 2 and 50 actual distinct draft-only entries
- **THEN** each reaches a single committed deletion event, with one revision increment per changed draft, and each Worker request individually meets all three ceilings

#### Scenario: The fifty-first using entry is rejected before writes
- **WHEN** 51 distinct entries in migrated storage use the media and the client requests admission or directly addresses one of those drafts
- **THEN** both runtimes refuse the request before the first draft mutation, retain active media and queue no deletion, and the Worker request meets all three ceilings

#### Scenario: A large single draft and a busy finish fit the same ceilings
- **WHEN** one step detaches from a valid 200-block, 200-media-reference draft with mixed link and entry-reference projections, and finish wakes the dispatcher with other due media and build work
- **THEN** the entry save and the entire finish invocation each meet all three ceilings, and remaining draft values and reference projections are correct
