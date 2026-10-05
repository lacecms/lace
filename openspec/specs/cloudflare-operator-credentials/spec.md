# Cloudflare Operator Credentials

## Purpose

Defines explicit remote operator credential loading and a read-only credential-source diagnosis that prevents D1-only tokens from silently overriding Wrangler OAuth.

## Requirements

### Requirement: Remote operator credentials use an explicit private file
Remote migration, synchronization, bootstrap and Cloudflare preflight SHALL accept a unique `--operator-env <path>` option only with an explicitly selected `cloudflare-remote` target. Missing, duplicate or invalid option/target combinations SHALL return USAGE/3 before file or provider access. Loading SHALL read only the selected regular non-symlink file, bounded to 64 KiB, without executing contents. On POSIX its permissions SHALL deny group/other access. A selected missing, unsafe, unreadable or malformed file SHALL fail CONFIG/4 without falling back to another credential source. Supported remote setting assignments SHALL be unique and syntactically valid. Process settings SHALL override selected-file settings, including empty values; diagnostics SHALL identify source categories without values or private paths. Omission of the option SHALL preserve process-environment remote operation and SHALL NOT auto-load the private file or infer a remote target.

#### Scenario: Private file selected
- **WHEN** a remote command selects a protected operator file and no process override
- **THEN** account, token, database and Wrangler configuration are resolved from that file without changing the parent environment

#### Scenario: Process override
- **WHEN** selected-file values differ from the supplied process environment
- **THEN** the supplied process values win consistently, including an empty value causing the usual missing-setting failure

#### Scenario: Unsafe or ambiguous input
- **WHEN** the selected file is a symlink, oversized, insecure on POSIX, malformed or missing, or the option is used for a local target
- **THEN** the CLI fails before remote mutation, preserves files and never prints supplied paths or credential values

### Requirement: Preflight reports credential selection without modifying state
The CLI SHALL provide `lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth [--operator-env <path>] [--json]` requiring explicit unique target and Wrangler authentication choice. It SHALL report the resolved Lace token source, the source a root-working-directory Wrangler invocation would select from process environment, `.env` and `.env.local`, and the selected validated account ID. The account ID SHALL be a 32-character hexadecimal identifier; no arbitrary account string, account name, email, database ID, private path, token, password or provider body SHALL be reflected. Supported sources SHALL be stable categories (`process`, `operator-file`, `dotenv`, `dotenv-local`, `oauth-candidate`, `absent`), with account/provenance independent from permission proof. Unsupported alternate authentication keys or environment selectors SHALL fail with safe configuration guidance rather than silently resolving a different identity.

OAuth choice SHALL fail CONFIG/4 when a nonempty API token is inherited or found in either implicit root dotenv file, even if another file would take precedence. Recovery SHALL direct the operator to move legacy tokens privately, remove their assignments from every implicit file and clear inherited token variables; unsetting the shell variable alone SHALL NOT be described as sufficient. Token choice SHALL require a nonempty explicitly intended Wrangler token and report when its value differs from the Lace token, without printing either. OAuth candidate means no overriding token was found, not proof of login, scope or account membership.

Preflight SHALL issue only a bounded provider request using the resolved Lace token against the explicit account/database to validate D1 access, with a read-only `SELECT 1` query. It SHALL refuse placeholder/mismatched database selection before the request. Unauthorized responses SHALL fail OPERATION_FAILED/6 with D1 permission/account recovery advice; unavailable or malformed responses SHALL fail with sanitized infrastructure advice. It SHALL NOT apply migrations, sync, bootstrap, deploy, create resources/files, launch OAuth login, read/refresh/write the OAuth cache or run Wrangler. Each probe SHALL have a five-second maximum and the whole command a thirty-second maximum, bounded input/output and no followed redirects. Local data, project files and authentication state SHALL remain unchanged under concurrent preflights.

#### Scenario: D1 token shadows OAuth
- **WHEN** OAuth is selected after login but the operator token remains in the shell, `.env` or `.env.local`
- **THEN** preflight fails and names the source category and removal action without exposing the token or assuming OAuth was chosen by Wrangler

#### Scenario: Clean OAuth choice
- **WHEN** the D1 token is confined to the explicit private file and the shell and implicit dotenv files contain no overriding token
- **THEN** Lace source is operator-file and Wrangler source is oauth-candidate, with OAuth authentication and deploy permissions explicitly unverified

#### Scenario: D1 access denied
- **WHEN** the read-only selected D1 probe returns 401 or 403
- **THEN** preflight reports authorization failure and the required next action before migration/sync/bootstrap, without changing D1 data

#### Scenario: Valid D1 and different Wrangler token
- **WHEN** token mode uses different private D1 and process Wrangler tokens
- **THEN** preflight reports distinct credential selection without revealing or assuming equivalent scopes

### Requirement: Preflight output is deterministic and evidence-limited
JSON SHALL be one object on stdout with `ok`, `code`, `message`, `operation` equal to `cloudflare preflight`, `reason`, `nextAction` and ordered `data` checks and source/account fields. Human output SHALL show the same conclusions. Success SHALL use PREFLIGHT_OK/0 and mean only completed applicable read-only checks; failures SHALL use CONFIG/4 or OPERATION_FAILED/6 with existing sanitized diagnostic fields, and usage SHALL use USAGE/3. Known configuration failures SHALL take precedence over provider failures; dependent probes SHALL be skipped. Neither output SHALL contain raw tool/provider text, secrets or private paths. Worker/Pages write permission and OAuth login verification SHALL be explicitly unverified in successful reports, directing operators to `wrangler whoami` and an operation-specific permission checklist before deploy or secret commands.

#### Scenario: Provider includes a credential in an error
- **WHEN** a provider response or exception contains sentinel tokens or private paths
- **THEN** human and JSON reports contain only fixed sanitized advice and one parseable JSON object where requested

#### Scenario: Read-only success precedes deployment
- **WHEN** D1 and source-selection checks succeed
- **THEN** the report does not certify deployment authorization and names separate Wrangler authentication and scope review as the next step
