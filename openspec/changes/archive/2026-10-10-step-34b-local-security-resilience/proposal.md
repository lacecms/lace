## Why

Roadmap Step 34, session **34B**, must establish local security and resilience evidence after 34A. Three recorded 32B weaknesses remain in source: Node trusts client-supplied forwarding headers, Better Auth can share a fallback sign-in bucket, and host SQLite commands are not guarded against live Compose consumers.

## What Changes

- Define and test one trusted client identity boundary for Node and Cloudflare, shared by Lace and Better Auth; preserve persistent limits and actor-scoped upload/token limits.
- Guard host database commands before opening SQLite when a running Compose database consumer uses that database; provide sanitized stop/check/retry guidance.
- Enforce the configured trusted-origin policy at shared cookie-authenticated Lace mutation actor resolution, covering the newly reproduced foreign-origin user-creation defect on Node and Worker; preserve production canonical-origin and development-only loopback aliases.
- Correct Node image validation to reject malformed/truncated containers and trailing executable bytes using portable complete-container validation shared with Worker, preserving displayed dimensions, byte/pixel limits and binary-derived MIME rules.
- Add reproducible local security negative tests covering authentication, sessions, CSRF/origin, roles, uploads, URL/rich-text safety, token storage/revocation, redaction and builder command/path isolation.
- Inject database, object-storage, builder, process and deploy-hook/Pages failures; verify atomicity, durable retries, expired leases, restart recovery, previous static output and truthful admin statuses.
- Correct the reproduced per-reference media-validation N+1 at the shared content boundary using bounded set-based metadata reads on SQLite and D1, preserving active-media validation and transactional write guards.
- Assert local D1 query/parameter budgets at maximum entry size and under a recorded large build-export fixture; audit locked dependency vulnerabilities and licenses with explicit dispositions.
- Remediate the locked audit findings with sharp 0.35.5, undici 7.29.1, tinypool 2.1.2, http-cache-semantics 4.3.0, smol-toml 1.9.0 and source-map-js 1.2.2 through reviewed catalog/narrow transitive resolutions; explicitly disposition legacy esbuild-server and OpenSpec braces findings as restricted tooling risks with review triggers, retaining all findings and license obligations.
- Record source and exact-candidate results separately, using the refreshed 34A inventory as baseline. Shipped fixes require reviewed refreshed artifacts before candidate success can be claimed.

## Capabilities

### New Capabilities

- `local-security-resilience-verification`: account-free negative/fault/budget/audit verification and evidence requirements for 34B.

### Modified Capabilities

- `bootstrap-user-token-abuse-controls`: trusted request identity shared with provider sign-in protection and role-appropriate rate-limit subjects.
- `operational-cli`: pre-open protection against concurrent host/Compose database access.

## Impact

Basis: architecture §§4.8, 6, 8 (MVP limits), 9.8, 11–14, 16, 19–22; roadmap session 34B. Related accepted contracts include `authentication-and-actor-boundary`, `hono-app-factory`, `media-use-cases`, `render-core`, `d1-content-repositories`, `outbox-dispatch`, `site-build-dispatch`, `fixed-command-vps-builder`, `cloudflare-deploy-hook-trigger`, `cross-runtime-product-verification` and `prepublication-consumer-security`; their guarantees remain in force.

Affected areas: auth/server/platform composition, CLI and generated deployment configuration/guides, shared test harnesses, verification scripts and evidence under `docs/archive/step-34/`. No public DTO or schema migration is planned. Dependencies are completed 34A, the current candidate inventory, local Docker/MinIO, Miniflare D1/R2, Chromium and advisory/license metadata access. No new runtime dependency is assumed.

Scope excludes 34C backup/restore and operations-documentation completion, real VPS/Cloudflare/TLS acceptance, registry publication and stable-release approval. Only corrective guide/owner-plan edits needed for 34B belong here. New defects that require an architectural or material scope change stop apply for an OpenSpec update.
