## ADDED Requirements

### Requirement: Provider deployment tracking is portable
The application SHALL provide a provider deployment reader port returning only closed observations (in-progress stage; `succeeded`, `failed`, or `cancelled` outcome with stage and optional closed reason; forbidden; not found; rejected; transient) and a site-build tracker that claims due tracked builds, reads each exact deployment, and records progress, backoff, or a terminal outcome through the dispatch port, enforcing the overall deadline and not-found grace. The dispatch port SHALL offer guarded check claims with a lease, guarded check records, and stage-aware tracked completion. The tracker SHALL check builds sequentially, isolate a failure or completion conflict to the affected build, and SHALL treat a thrown reader error as transient. Without a reader every due tracked build SHALL be completed as `unknown` with `tracking_unconfigured`.

#### Scenario: Reader throws
- **WHEN** the reader throws for one of two due builds
- **THEN** that build is rescheduled with backoff and the other build is still checked

#### Scenario: Completion conflict
- **WHEN** a completion is rejected because another run already completed the build differently
- **THEN** the tracker logs a closed `tracking_conflict` reason and continues with the next build
