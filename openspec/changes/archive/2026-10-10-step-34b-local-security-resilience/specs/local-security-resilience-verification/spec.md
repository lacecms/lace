## Purpose

Defines reproducible local security, fault recovery, query budget and dependency audit evidence for the two Lace runtimes before owner-operated deployment acceptance.

## ADDED Requirements

### Requirement: Local security verification is reproducible and fails closed
One documented command SHALL run required Node/SQLite/MinIO and local Worker/D1/R2 security and resilience phases using isolated owned state and controlled provider/proxy responses. It SHALL report each required scenario, reject failed, skipped, empty or unavailable phases, and clean owned processes/containers/state on success, failure and interruption. It SHALL NOT delete ordinary development data, use infrastructure credentials or mutate a remote installation. Dependency metadata access SHALL be explicitly distinguished from infrastructure access.

#### Scenario: Required local phase cannot execute
- **WHEN** a runtime, local service or required test is unavailable or skipped
- **THEN** verification records failed or incomplete status and subsequent unexecuted phases remain not-run

### Requirement: Security negative cases preserve protected state and secret exclusion
Verification SHALL exercise actual authentication and runtime composition boundaries for session/cookie policy, expired/revoked/disabled sessions, public enrollment denial, CSRF/origin rejection, role and build-token permissions, trusted-client rate limits, malformed/oversized/MIME-mismatched uploads, filename handling, URL/rich-text attacks, hash-only token storage and revocation, secret-free diagnostics/output and arbitrary builder command/path/environment resistance. Denied operations SHALL leave protected state unchanged. Production-cookie and configured-proxy cases SHALL run locally with controlled transport; they SHALL NOT count as deployed TLS/proxy acceptance. Test credentials SHALL be searched for without printing their values.

#### Scenario: A hostile origin uses an authenticated session
- **WHEN** a foreign-origin request attempts a protected mutation or provider session operation
- **THEN** the request is denied and content, users, tokens and media remain unchanged

#### Scenario: Unsafe media or rich text is supplied
- **WHEN** malformed upload metadata/bytes or a forbidden URL or rich-text attribute is submitted
- **THEN** the existing safe error contract applies without publication of unsafe content or exposure of internal errors

#### Scenario: Credentials appear in a diagnostic
- **WHEN** an injected credential sentinel reaches captured HTTP, logs, CLI errors or static output outside an intentional one-time reveal
- **THEN** verification fails naming the surface with the value redacted

### Requirement: Fault injection verifies durable recovery and truthful outcomes
Verification SHALL inject failures in database mutation/commit, object upload/deletion, builder execution, process termination after durable claim, deploy-hook transport/response and Pages tracking. On both persistence adapters it SHALL assert no partial aggregates or false publication rollback, bounded production retry policy, expired-lease recovery, stale-result rejection and restart recovery. Builder tests SHALL prove an interrupted or failed build leaves the previous complete release served until an atomic successful replacement. Controlled provider outcomes SHALL exercise accepted, succeeded, failed, cancelled and unknown without attributing an unproved deployment success; real-backend admin checks SHALL reflect persisted outcomes and applicable recovery actions.

#### Scenario: Dispatcher dies after claim
- **WHEN** a dispatcher process terminates after recording a claim and restarts after lease expiry
- **THEN** the same work recovers under the accepted lease rules and the stale owner cannot change the recovered result

#### Scenario: Storage fails during a media operation
- **WHEN** object upload or deletion fails after the preceding durable operation
- **THEN** metadata follows the accepted media lifecycle and retry policy and public readers do not see nonexistent active media

#### Scenario: Provider outcome cannot be proven
- **WHEN** a hook is accepted without tracking or tracking ends at its deadline without a proven result
- **THEN** persisted history and admin show accepted or unknown respectively and the current successful site version does not advance

### Requirement: D1 budgets are asserted at content and export boundaries
Verification SHALL measure bound parameters and executed SQL statements, including statements inside batches and full request overhead. It SHALL exercise 200 blocks and 200 media references for create, save and publication, reject 201 before writes, and assert at most 100 parameters per statement and 50 queries per tested invocation. Build-export verification SHALL use an explicit large fixture crossing several identifier chunks, compare every published entry/block/reference, measure output bytes and query count, and detect N+1 growth. Fixture dimensions, measured maxima and simulator limitations SHALL be recorded. Since the current export contract has no global entry/byte cap, verification SHALL NOT claim an unbounded export has a verified maximum or introduce truncation silently; a discovered incompatible budget ceiling SHALL require a planning update before changing the export contract.

#### Scenario: Maximal authenticated content mutation validates media in bounded sets
- **WHEN** an authenticated Worker invocation creates, saves or publishes an entry with 200 blocks and 200 media-reference locations
- **THEN** shared content validation uses bounded set-based metadata reads rather than one query per reference, preserves every reference location and rejects missing/inactive media without partial state
- **AND** complete invocation overhead remains within 50 statements and 100 parameters per statement, with transactional guards retained against media-state races

#### Scenario: Large published export crosses identifier chunks
- **WHEN** the recorded large fixture is exported through the authenticated local Worker
- **THEN** all expected published values are present and the invocation stays within the asserted query and parameter budgets

#### Scenario: Simulator differs from production constraints
- **WHEN** local D1 accepts work without enforcing a production quota
- **THEN** explicit instrumentation still enforces the test budgets and remote capacity confirmation remains pending in the owner plan

### Requirement: Dependency vulnerabilities and licenses have attributable dispositions
Verification SHALL audit the locked direct/transitive graph for vulnerabilities and licenses, distinguish production, tooling and shipped artifact exposure, and record timestamp, lockfile identity, tool/data source, affected versions, severity/license, reachability and disposition. Missing metadata or an unavailable audit SHALL remain incomplete. Accepted risks SHALL carry rationale, scope, mitigation and review trigger; findings SHALL NOT be suppressed solely to produce success. An undispositioned vulnerability or incompatible/unknown license SHALL prevent a complete security acceptance claim.

#### Scenario: Advisory affects a locked package
- **WHEN** the audit reports a vulnerability
- **THEN** evidence records its affected dependency path and remediation or explicit justified risk disposition

#### Scenario: The reviewed audit identifies actionable locked dependencies
- **WHEN** advisory results require the approved targeted dependency remediation
- **THEN** the pinned catalog and narrow transitive resolutions are updated, affected behavior and refreshed artifacts are verified, and advisory/license metadata is collected again without suppressing residual findings
- **AND** retained tooling risks carry explicit reachability restrictions, mitigation and review triggers, while distribution license obligations remain visible until verified

### Requirement: Evidence separates workspace verification from candidate acceptance
The 34B record SHALL include source/tree identity, tool versions, commands, scenario results, sanitized fault checkpoints, budget measurements and audit dispositions. Candidate claims SHALL identify verified package checksums and image identities using the refreshed 34A inventory as baseline. Shipped changes SHALL require a reviewed refreshed clean-source candidate and exact-artifact regression acceptance before final candidate success; earlier artifacts SHALL NOT be relabelled as containing a fix. Local success SHALL NOT imply session 34C completion, real infrastructure acceptance, publication or stable-release approval.

#### Scenario: Source correction passes against older candidate artifacts
- **WHEN** source tests pass but candidate artifacts predate a shipped correction
- **THEN** evidence reports source success and candidate acceptance remains pending until refreshed artifacts pass
