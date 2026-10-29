# MCP1 implementation verification

## Status — 2026-10-29

Implementation now includes the guarded OAuth provider, bearer-only MCP authority,
shared content operations, five SDK tools, Node/Worker composition, consent and
account connection UI, deployment templates and documentation. The feature is
opt-in (`LACE_MCP_ENABLED=true`); disabled remains the default. All 26
implementation and delivery-check tasks are complete; the independent release
identity blocker is recorded below. All seven delta capabilities are synchronized
into main specs. The completed change was archived on 2026-10-29 at
`openspec/changes/archive/2026-10-29-add-oauth-mcp-server`.

The production provider type fixture now passes. Only auth and that fixture set
`exactOptionalPropertyTypes: false`; the shared baseline and other packages
retain the original setting and `strict: true` remains enabled. No dependency
patch, plugin cast or TypeScript error suppression was introduced.

## Final implementation acceptance — 2026-10-29

- `corepack pnpm compat:mcp`: **PASS, 102 tests across six files**, including the
  production plugin TypeScript fixture, checked-in migrations, real guarded
  provider persistence, SQLite/D1 races, REST/MCP equivalence, lifecycle, generated
  consumer bundles and a complete production Worker isolate OAuth/SDK flow.
- The real SDK client/server are `2.4.0`; initialize explicitly negotiates
  `2025-11-25`. Both runtimes expose exactly five content tools. Equivalence
  verifies projections, defaults, safe validation errors, singleton/media/link
  rules, revision races and unchanged published snapshots/version/build outbox.
- Lifecycle verifies scope attenuation, current account roles, viewer write
  denial, browser/build credential separation, rotation/replay, owned revocation,
  disable/re-enable, ordinary sign-out independence and all routes while off.
  Refresh replay cleanup is constrained to its grant reference: sibling grants
  for the same user/client retain their provider credentials.
- Actual browser form login, consent denial, fresh read/write approval, SDK draft
  creation and Account confirmation/revocation completed on disposable Node and
  D1 compositions. Account still showed an active browser session after revoke;
  the D1 browser fixture's SDK confirmed `invalid_token` after revocation.
  Escaped identity and keyboard behavior are covered by component tests. Code
  inspection confirms consent uses only the opaque handle and does not write
  OAuth credentials to browser storage. Temporary browser artifacts were removed.
- The production Worker entry was bundled and executed in local workerd with
  D1/R2 and existing migrations. It completed registration, password login,
  consent, code exchange, SDK initialization/list/create/get. The fixture restores
  the canonical Host at its boundary because Miniflare's HTTP dispatch bridge
  replaces Host with its socket address. Production Host/Origin checks remain
  enabled and have independent rejection coverage.
- Combined esbuild output required loading the auth graph before the MCP SDK:
  otherwise SDK schemas ran before shared Zod constructor initialization. Both
  platform composition imports preserve this order; the executable production
  Worker regression protects it. No dependency code was patched.
- Root typecheck: **PASS**, 38 Turborepo tasks plus project config.
- Root Oxlint, architecture boundaries and admin colors: **PASS**, 22 tasks
  (existing warnings remain).
- Root Oxfmt: **PASS**.
- OpenAPI artifact check: **PASS**.
- Documentation check/build: **PASS**, including three docs tests and verification
  of 19 pages, local links/fragments/resources and OpenAPI.
- OpenSpec strict change validation: **PASS**.
- `git diff --check`: **PASS**.
- Root regression suite: **PASS**, 44 Turborepo tasks (2,747 package tests) plus
  **221 root tests across 32 files**. Package tests ran successfully on Node
  `24.22.1`; the final full command reused their successful Turbo cache and ran
  root tests on the installed pinned Node `24.12.0`, pnpm `12.3.4`. One root
  release-artifacts test requires that exact Node version; its earlier failure
  on `24.22.1` disappeared on the required toolchain. The first
  full run caught 55 scheduled D1 queries after adding maintenance. Worker cleanup
  now rotates atomic/dependency-ordered phases with at most three statements;
  the existing 50-query regression exercises all three phases. A tracking fixture
  also now awaits its post-commit promises before advancing its clock, eliminating
  a race with the explicit scheduled pass; expected provider outcomes remain
  unchanged.
- Release identity gate: **FAIL, pre-existing HEAD inconsistency**. The checked-in
  `release/alpha.json` selects template `0.35.0`, while the generator inventory
  already selects `0.38.0` in HEAD. `release:check` reports `Template identity
  mismatch`. The MCP package was added to the release inventory; the candidate
  version/template identity was not silently changed. Release preparation and
  publication remain blocked by this independent release decision.

All Cloudflare/D1 evidence is local. No real-account remote deployment, npm
publication or production credential exchange was performed. Owner acceptance
still includes canonical public HTTPS/proxy behavior, the actual chosen OAuth
assistant and Cloudflare account deployment/bindings. Published-package/image
acceptance needs a coherent release candidate and the pinned release toolchain.

The following sections preserve earlier baseline failures and planning history;
they are historical evidence, superseded by the final acceptance above.

## Pinned candidates

- Existing Better Auth: `1.7.3` (unchanged).
- `@better-auth/oauth-provider`: `1.7.3`; its published peer range accepts
  Better Auth `^1.7.3`.
- Official `@modelcontextprotocol/server` and `@modelcontextprotocol/client`:
  `2.4.0`.
- Existing Drizzle `0.45.2`, better-sqlite3 `13.0.3`, Miniflare
  `5.20260903.0-alpha`, Valibot `1.4.2`, JSON Schema converter `1.4.0`.

The provider is a production auth dependency and the SDK server is a production
MCP adapter dependency. Root/client dependencies support the compatibility gate;
versions are catalog-pinned with committed lockfile resolutions.

## Executable evidence

Run `corepack pnpm compat:mcp` with Node `24.22.1` and the project-pinned pnpm
`12.3.4`. D1 tests need permission to open local workerd sockets.

Fixture: `scripts/fixtures/oauth-mcp/compat.test.mjs`.

- PASS: password login with existing credential tables and normal opaque-token
  refresh on better-sqlite3.
- PASS: the same login/refresh using the existing local D1/Miniflare harness and
  Drizzle D1 adapter.
- PASS: official SDK v2 client initializes at `2025-11-25`, lists a probe tool
  with its Valibot-derived JSON Schema and calls it; structured/text results
  agree. This is an in-process Web Request/Response transport test.
- FAIL on **both SQLite and D1**: refresh replay does not prevent a concurrent
  rotation from recreating renewable authority after family invalidation.

The two failing tests deliberately assert the required security behavior; they
are not skipped or marked expected failures. `compat:mcp` must remain nonzero
until the persistence integration closes the race. This fixture is separate
from the ordinary root `test` selection.

### Deterministic failing schedule

1. Request A reads a valid refresh token and commits the provider's real
   compare-and-swap that marks it rotated/revoked.
2. The fixture pauses A after that adapter operation, before child insertion.
3. Request B reuses the same token. It observes revocation, runs the provider's
   family deletion and returns HTTP `400` with `invalid_grant`.
4. A resumes, inserts a new refresh/access token and returns HTTP `200`.
5. A subsequent request using that new refresh token also returns HTTP `200`.
   The gate requires rejection after the family was revoked.

The fixture wraps only the adapter's scheduling boundary. SQL, persistence,
provider verification, token generation and HTTP handlers are real. It does not
print token values or hash records on assertion failure. The initial grant is
seeded through provider records to isolate rotation; this is not evidence for
an authorization-code or consent flow.

The published provider `1.7.3` implements `createRefreshToken` as separate
`incrementOne` and `create` calls. Its `invalidateRefreshFamily` implementation
also documents the non-atomic invalidation/rotation window. Source inspection
of published `1.7.14` found the same window; that version was not installed,
runtime-tested or selected, and upgrading alone has not been demonstrated to
solve it.

## Provider inventory inspected

The pinned plugin declares these tables:

- `oauthClient`
- `oauthResource`
- `oauthClientResource`
- `oauthRefreshToken`
- `oauthAccessToken`
- `oauthConsent`
- `oauthClientAssertion`

The fixture synthesizes temporary tables from those pinned definitions to test
compatibility. This is test-only, is not a production migration and does not
replace the reviewed SQL/journal/index work in task 1.3.

Candidate public provider paths discovered from endpoint definitions:

| Method | Provider path (under `/api/auth`) |
| --- | --- |
| GET | `/.well-known/oauth-authorization-server` |
| GET, POST | `/oauth2/authorize` |
| POST | `/oauth2/consent` |
| POST | `/oauth2/continue` |
| POST | `/oauth2/token` |
| POST | `/oauth2/register` |
| POST | `/oauth2/revoke` |

These are inventory, **not an implemented or verified production allowlist**.
Consent continuation and canonical discovery alias behavior must still be
verified before declaring the exact external surface. The provider also
exports introspection, userinfo, client/resource/consent CRUD and end-session
routes; their existence does not authorize exposing them. The opaque-token
fixture disables the JWT plugin and does not require signing keys.

## Other checks

- Root typecheck: PASS (36 Turborepo tasks plus root config typecheck).
- Root Oxlint/boundary/admin-color checks: PASS; existing warnings remain.
- Root Oxfmt check: PASS.
- OpenAPI compatibility check: PASS.
- `openspec validate add-oauth-mcp-server --type change --strict`: PASS.
- `git diff --check`: PASS.

The supplied shell's fallback `pnpm` is 11.25.0. Commands use Corepack for
12.3.4; the complete root typecheck also needs the cached pnpm directory in
PATH for its nested `pnpm typecheck:config` invocation:

```sh
PATH="$HOME/.cache/node/corepack/v1/pnpm/12.3.4:$PATH" corepack pnpm typecheck
```

## Outstanding compatibility evidence

The gate is incomplete. No claims are made for S256 authorization-code
exchange/one-winner races, consent through the real admin form, a Worker-isolate
bundle without Node HTTP imports, full migration indexes, failure atomicity,
account invalidation, cross-transport content equivalence, generated/release
artifacts or remote deployment. D1 here is real local workerd-backed D1 accessed
from the test runner; it is not an end-to-end deployed Worker OAuth server.

Task 1.2 explicitly requires stopping and revising planning on incompatibility.
The discovered result needs a concrete persistent family/issuance protocol and
its failure/recovery rules before production integration proceeds; the broad
instruction to use guarded persistence is not itself a passing proof.


## Resumed baseline — 2026-10-29

`corepack pnpm compat:mcp:baseline`: **9 passed**. The selection deliberately
runs only baseline cases; the two security regression assertions remain in
`compat:mcp` and still block final acceptance in task 1.5.

Additional positive evidence:

- S256 authorization-code issuance/exchange and code-reuse rejection on SQLite
  and D1, using a persisted existing user, password login and seeded prior
  consent. No `skipConsent` bypass is enabled. Actual first-consent UI remains
  a later acceptance requirement.
- A bundled Worker executes S256 login/code exchange and official SDK
  initialize/list/call against local D1. The bundle selects the SDK's workerd
  exports, uses `nodejs_compat` and its external import inventory contains no
  Node HTTP/HTTPS/HTTP2 APIs. The Node and Worker use the same portable probe
  and provider configuration. This is local Worker-isolate evidence, not a
  remote deployment or a production content adapter.
- Exact candidate provider method/path and schema inventories have executable
  assertions. The existing production auth boundary returns `404` for all
  candidate OAuth/discovery paths and tested GET/POST/DELETE variants on both
  databases; no production feature is exposed by the fixture.

The initial failed-gate report above is retained as historical negative
evidence. Its task numbers refer to the original plan. Final acceptance still
requires checked-in migrations, guarded issuance/revocation and every security
regression passing without filtering.


## Migration prerequisite — 2026-10-29

Task 1.3 adds `0012_oauth_mcp.sql`, its Drizzle snapshot/journal/inventory and
static exported schema. Seven provider tables and four lifecycle tables store
family/user generations, issuance claims/tombstones and provider-token bindings.
Provider schema definitions are checked against the exact pinned plugin.

`vitest run scripts/fixtures/oauth-mcp/migrations.test.mjs packages/db/src/index.test.mjs --maxWorkers=1`:
**28 passed**, including fresh and populated SQLite/D1 migrations, preservation
of existing credentials/sessions/content/build tokens, indexes, unique consumed
inputs, committed-state constraints and foreign-key checks. The complete
baseline also passes (**9 cases**) on checked-in migrations. Dynamic fixture
schema generation has been removed. Worker S256 flow now includes refresh
across separately constructed auth instances; opaque credentials require no
per-instance signing keys. No production OAuth route is enabled.


## Guarded integration acceptance — 2026-10-29

Tasks 1.4–1.5: `corepack pnpm compat:mcp` **41 passed, no filtered/skipped or
expected-failure cases**. This includes migration cases plus the original
replay regression, now requiring both the resumed request and subsequent
renewal to fail after revocation. Negative historical evidence above describes
the unguarded provider, not the current guarded integration.

Supported seams verified with pinned Better Auth/provider:

- `BetterAuthOptions.database` supplies a request-scoped public `DBAdapter`.
- `findOne`, `consumeOne`, `incrementOne`, `create` and `deleteMany` couple
  provider protocol handling to guarded SQL claim/prepare/commit/revoke.
- The public adapter `transaction` callback preserves wrapping when Better
  Auth enters its internal adapter context; no async D1 transaction is assumed.
- The provider's `postLogin.consentReferenceId` binds authorization codes and
  issued rows to the durable grant. Provider code generation, PKCE and credential
  hashing remain in the selected provider profile.
- The token response is withheld until durable authority publication commits.
  Raw driver failures are translated before reaching provider error logging.

Both database adapters pass concurrent code/refresh, revocation before and after
publication, account-generation races, lost-response retry, consumed-token
replay after provider-row cleanup, pending-attempt expiry and a real
second-statement unique-constraint failure proving batch rollback. Tests also
check grant-bounded expiry, hashed credential persistence, owned/idempotent
revocation and sanitized failures. D1 guarded renewal and sequential S256 flow
stay within the 50-query per-invocation bound, counting provider and guard SQL.

The fixture Worker uses the same public guard and D1 persistence implementation
as Node tests. It runs S256 and renewal plus official SDK initialize/list/call;
its bundle has no Node HTTP imports. This is still a probe tool and local
compatibility evidence, not the five application tools or deployed acceptance.
The exact provider method/path inventory above is locked by assertions and AS
metadata advertises the tested canonical URLs. It is the required allowlist
for later explicit production composition; other provider endpoints stay
unexposed. The production auth boundary remains on its original three routes.

Remaining delivery includes shared content authority/projections, full OAuth
consent/connection/account orchestration, production gates/rate limits, admin UI,
REST/MCP equivalence, packaging and full release checks. Historical root checks
above predate the persistence implementation; the final apply must rerun them.


## Shared content boundary — 2026-10-29

Tasks 2.1–2.5 are complete. Domain actors now carry an immutable permission and
operation ceiling; one portable authorizer denies unregistered operations and
all non-allowlisted delegated lifecycle work before reads. Browser role and
published/unpublished deletion behavior is retained. Direct link-directory and
audit-directory operations are also outside the delegated surface. Audit values
strip request authority without stripping it from nested application dispatch.

Application now owns authorized model discovery, safe attribution and complete
admin read/projection orchestration. Contracts own pure model/list/admin
projections, block normalization, MCP envelope schemas and safe validation/error
classification. Admin discovery/list/get/create/save use those shared exports;
HTTP headers, query parsing, ETags and status codes stay in the server.

Evidence: **280 passed** existing SQLite/D1 lifecycle/repository contracts;
**205 passed** focused server/contracts/application checks; **56 passed** earlier
domain/application policy regressions; the additional application metadata/audit
suite is **6 passed**. `openapi:check` passes with no wire-schema changes.
A converter test derives all five MCP argument JSON Schemas from the same
Valibot contracts, including mandatory save revision, typed filters, strict
unknown-key rejection and JSON data objects.


## Connection and account lifecycle — 2026-10-29

Tasks 3.1–3.2 are complete. Owner-scoped connection reads use indexed keyset
continuation and provider client display identity without secrets. All browser
roles manage their own connections; delegated actors are rejected before the
port. Revocation is owned/idempotent and immediately invalidates bindings.

Both security adapters advance the same durable user generation inside their
existing atomic password/session/account mutation: disable, password reset,
administrator sign-out-everywhere, password-change revoke-others and explicit
session revoke-others. No feature-enabled flag conditions this invalidation.
Ordinary session deletion and non-revoking password changes preserve independent
grants. SQL transactions/batches include all effects, so interruption cannot
commit account success with surviving OAuth authority.

Evidence: **12 passed** new account/OAuth lifecycle cases on SQLite/D1,
**46 passed** existing invitation/reset/session/account suites. Owned connection
and cleanup-focused selection: **6 passed**. Previously passing guard cases
cover pending issuance/account-generation races and lost-commit-response retry.


## Production type compatibility blocker — 2026-10-29

Resume work prepared the closed public-client profile in
`packages/auth/src/mcp-oauth.ts` and the separate bearer-only resolver in
`packages/auth/src/mcp-actor.ts`. The latter checks the actual provider access
record as well as committed binding/grant/current-user state, and intersects
provider token scopes with the consent ceiling. Literal OAuth method/path and
discovery inventories are defined, but not wired to public runtime routing.
The compatibility fixture now imports the prepared production profile instead
of referring to missing profile helpers.

New runtime checks cover bounded public registration, native/web callbacks,
forbidden metadata/URL fetching, unsupported grants, scope expansion, code
client/resource/callback/verifier substitutions, role changes, consent versus
token downscoping, disabled/invalid-role users, expired/revoked/provider-record
mismatch, and browser/build/bearer credential separation. Invalid persisted
roles are prevented by the SQL CHECK constraint; the resolver's defensive
invalid-role branch is tested with a malformed authority result.

A real attempt to compose `createMcpOAuthProvider(...)` in
`betterAuth({ plugins: [...] })` fails TS2322 with Lace's existing
`exactOptionalPropertyTypes: true`. `oauth2Authorize.options.metadata.openapi.parameters`
contains an inferred union whose `schema.items?: undefined` member is
incompatible with the `better-call` OpenAPI parameter declaration's optional
`items` object. `pnpm why better-call --recursive` finds a single version,
`1.4.0`; both Better Auth and the provider are `1.7.3`. This is a declaration
compatibility failure, not a demonstrated runtime protocol failure.

The minimal unfiltered reproducer is checked in at
`scripts/fixtures/oauth-mcp/provider-types.ts`, with its dedicated strict
`tsconfig.json`. Run:

```sh
corepack pnpm exec tsc -p scripts/fixtures/oauth-mcp/tsconfig.json
```

Expected current result: **FAIL TS2322**. It is deliberately a separate,
failing compatibility gate, not an `@ts-expect-error` assertion, cast, skipped
test or compiler-option relaxation. The previous runtime-only fixture could
not expose this because its provider composition is JavaScript. Production
wiring attempted during investigation was removed; the normal package/root
build still passes. Task 4.1 is not marked complete by the runtime evidence.

The owner rejected dependency patches and selected softer TypeScript checking.
Proposal, design and task 1.5 now specify a local
`exactOptionalPropertyTypes: false` override for auth and the OAuth type fixture,
with `strict: true`, all other checks and the shared root baseline preserved.
Task 1.5 is reopened for the missing type-composition gate. No vendor patch,
plugin cast or error suppression is selected.

Read-only feasibility check:
`corepack pnpm exec tsc -p scripts/fixtures/oauth-mcp/tsconfig.json --exactOptionalPropertyTypes false`
**PASS**. This invocation overrides the compiler flag for the probe only; no
compiler configuration or production code was changed in the planning update.
Applying the local overrides, adding the type check to the executable gate and
rerunning runtime/auth acceptance remain the next implementation work.

Current verification:

- Complete runtime compatibility/migrations suite: PASS, **76 tests**, no skips or expected failures.

- Root typecheck: PASS (36 Turborepo tasks plus root config).
- Root Oxlint/boundary/admin-color checks: PASS (warnings remain).
- Root Oxfmt check: PASS; migration snapshots normalized with Oxfmt.
- OpenAPI compatibility check: PASS.
- OpenSpec strict change validation: PASS.
- `git diff --check`: PASS.
- New strict provider composition fixture: FAIL TS2322, as described above.

All database/Worker evidence is local. No remote deployment was performed.
