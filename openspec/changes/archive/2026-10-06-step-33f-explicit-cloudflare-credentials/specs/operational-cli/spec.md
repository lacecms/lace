## ADDED Requirements

### Requirement: Explicit remote credentials reach both D1 transports
Remote migration, synchronization and bootstrap SHALL use the same resolved account, database and token from process settings or the explicitly selected operator file. Remote migration's installed Wrangler child SHALL receive the resolved account and API token explicitly so implicit dotenv loading cannot substitute a different token for that operation. Token values SHALL NOT be placed in arguments, stdout, stderr or diagnostics. File resolution and target validation SHALL finish before provider writes; migration ordering, sync atomicity, bootstrap guards, error codes and the single successful bootstrap token reveal SHALL remain unchanged. Local/Node operations SHALL NOT load a remote operator file or gain remote credentials as a side effect. The parent process environment SHALL remain unchanged.

#### Scenario: Private-file remote migration
- **WHEN** a remote migration uses a private-file D1 token and root dotenv contains a different token
- **THEN** both Wrangler migration and the subsequent D1 ledger read use the explicitly resolved token and account without exposing them

#### Scenario: Sync and bootstrap use the selected target
- **WHEN** either command selects the same operator file
- **THEN** D1 requests use that file's account/database/token with existing atomicity and setup guards

#### Scenario: Local migration
- **WHEN** local migration runs without the remote option
- **THEN** local persistence and credential behavior remain unchanged and no remote account is selected
