## ADDED Requirements

### Requirement: A sequential dispatcher owns the build at trigger time

The production VPS poller SHALL claim at most one eligible site-build event per poll and SHALL claim it only when ready to invoke the builder. On every runtime a sequential dispatcher SHALL invoke the external trigger only under a current, unexpired lease for that event. If a lease has waited behind another trigger, the dispatcher SHALL conditionally confirm ownership in durable storage immediately before using it. An expired, refused or unconfirmed lease SHALL cause no trigger call, outcome write, retry charge or rescheduling by that dispatcher for that event. Existing expiry recovery and renewal of an in-flight build SHALL continue to apply.

#### Scenario: A restarted VPS dispatcher finds two due builds

- **WHEN** two distinct builds are due after restart and the first builder call lasts over 60 seconds with successful lease renewals
- **THEN** while the first call is in progress the poller holds only its lease and has not claimed or started the second build
- **AND** with one healthy poller and both triggers returning success, each build ID reaches the builder exactly once, both durable rows become `succeeded`, and their outbox events are completed
- **AND** a subsequent poll invokes neither build again

#### Scenario: Another worker takes the next build

- **WHEN** one VPS poller is executing the first build and a peer claims and completes the second eligible event
- **THEN** the peer records the second outcome under its own lease and the first poller never invokes the second build after it finishes the first

#### Scenario: A caller dispatches several claims sequentially

- **WHEN** a later claim in a bounded pass has waited for the preceding trigger and durable storage confirms it still owns an unexpired lease
- **THEN** the dispatcher can invoke the trigger for that build and record the result under that lease
- **AND** if ownership has expired, passed to a peer, or cannot be confirmed because the check fails, that dispatcher skips the external call and leaves recovery to the normal claim path

#### Scenario: The owner crashes before calling the builder

- **WHEN** a dispatcher acquires a build lease and stops before the external call, and a replacement dispatcher polls before and again after expiry
- **THEN** the outstanding lease excludes the replacement before expiry, and the replacement can reclaim the same build ID and execute it after expiry
- **AND** the old lease cannot start the build when its holder resumes or record an outcome against the recovered claim
