## Why

RF3D gave every shared package one `LaceError` base and the server and MCP one
classifier. The RF4X audit (2026-11-04) found failures that still bypass the
model.

- **Stale synchronization plans are recognized by message text.** The
  application, db and both platform repositories throw
  `DomainError("CONTENT_INVALID_STATE")` with "…plan is stale" messages.
  `platform-node/src/content-sync.ts:53` and `cli/src/commands.ts:145` detect
  them with `error.message.includes("stale")`. A reworded message silently
  breaks the "rerun sync" guidance.
- **Setup and user lookups throw plain `Error`.** Both security adapters do
  this ("Setup already completed.", "Setup unavailable.", "Setup credential is
  invalid.", "User not found.", plus two internal states). The setup route
  converts every failure except authorization into `404`, so a database
  outage during setup is reported as an unknown token.
- **Pass-through checks predate `LaceError`.** `db/shared/{cursors,values,write-errors}.ts`
  and `platform-node/image-inspector.ts` re-throw only `DomainError`. An
  `InvariantError` or `AccountError` raised below them is rewritten to
  `CONTENT_INVALID_STATE` (422).
- **Contracts header parsers throw `TypeError`.**
  `shared/preconditions.ts` and `media/mappers.ts` do this. The server wraps
  them in bare `catch {}`, which also swallows unexpected errors.
- **The server has its own untyped failures and duplicate paths:**
  - plain `Error` for unavailable capabilities and composition gaps;
  - a server-local `AuthorizationError` that `setup-session.ts` tells apart
    by class, although `DomainError` carries the same code;
  - a rate-limit middleware that builds its `429` by hand instead of through
    the classifier's `Retry-After` rule.
- **Platform errors do not extend `LaceError`.** Object-storage and
  environment errors are twins across Node and Cloudflare:
  `NodeObjectStorageError`/`CloudflareObjectStorageError` and
  `NodeEnvironmentError`/`CloudflareEnvironmentError`, plus
  `NodeInfrastructureUnavailableError`.

This is Session RF3F of `docs/refactoring-roadmap.md` (second audit
follow-up, 2026-11-05). It follows RF3E and precedes RF5, which rewrites the
security adapters these failures come from.

## What Changes

- **Stable stale-plan code.**
  - `@lacecms/domain` gains the code `CONFIGURATION_SYNC_STALE` and a
    `StaleSynchronizationError` (a `DomainError`).
  - Every stale-plan site throws it with its current message: application
    `configuration/apply.ts`, db `sync/block-migration-scan.ts`, the Node and
    D1 repositories, and the test-utils store.
  - `content:sync` and the CLI test the code.
  - **Correction to the roadmap text:** configuration synchronization has no
    REST or MCP route, so the code is not a documented transport code. If it
    ever reached HTTP it would map to `500 INTERNAL_ERROR`, like other
    internal failures.
- **Setup failures and the uniform `404`.**
  - Setup and user-lookup failures in both security adapters become
    `AccountError("NOT_FOUND")`. That code is already documented as `404`
    with the same envelope the setup route returns today.
  - The setup route drops its catch-all, so each outcome keeps its uniform
    `404`, and unexpected failures map to `500 INTERNAL_ERROR` instead of
    `404` (owner decision 2026-11-05: keep the uniform `404`).
  - The two internal setup states (claimed user is not an administrator, an
    invitation that cannot be reloaded) become `InvariantError`.
- **Pass-through checks** test `instanceof LaceError`, so an
  `InvariantError` or `AccountError` keeps its code.
- **Contract header parsers** throw `ContractValidationError`:
  `resolveExpectedRevision`, ETag parsing and `resolveMediaPrecondition`.
  The two server wrappers catch only that class, with their current messages
  and pointers. Argument guards in projection mappers keep `TypeError`, as
  RF3D decided.
- **Server failures:**
  - Capability and composition gaps throw `InvariantError`.
  - The setup route and middleware test `AUTHORIZATION_DENIED` by code.
    `AuthorizationError` stays as the server's constructor of that code.
  - The rate-limit middleware throws `RateLimitExceededError` for non-protocol
    paths, so the classifier alone produces the `429` envelope and
    `Retry-After`. Protocol paths keep their OAuth-style body.
- **Platform bases.**
  - `@lacecms/application` (owner of the storage and runtime ports) gains
    `ObjectStorageError` (`STORAGE_UNAVAILABLE`) and
    `RuntimeConfigurationError` (`RUNTIME_CONFIGURATION_INVALID`), both
    extending `LaceError`.
  - The Node and Cloudflare storage and environment errors and
    `NodeInfrastructureUnavailableError` extend them, keeping their names and
    exports. Neither code is a transport code, so HTTP responses stay
    `500 INTERNAL_ERROR`.
- The error matrix in test-utils gains every new class, and the REST matrix
  stays equal to the RF3D baseline apart from the documented setup change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: the one-error-model requirement covers the new codes and
  classes, pass-through preservation, typed header failures and the
  classifier-only `429`.
- `configuration-synchronization`: a stale plan fails with a stable code that
  callers test instead of its message.
- `browser-first-admin-setup`: setup outcomes keep one ambiguous `404`, while
  infrastructure failures during setup are reported as server errors.

## Impact

- **Roadmap.** Implements RF3F after RF3E, before RF5.
- **Code.**
  - `packages/domain` (`shared/errors.ts` code, new error class);
  - `application` (error bases, `configuration/apply.ts`);
  - `db`, `contracts` (preconditions, media mappers);
  - `server` (setup route, middleware, request helpers, composition);
  - `platform-node`, `platform-cloudflare` (security adapters, repositories,
    error classes, `content-sync.ts`);
  - `cli` (`commands.ts`), `test-utils` (store, error matrix).
- **API.** One REST behavior change: unexpected failures during
  `POST /api/v1/setup/admin` return `500` instead of `404`. Every setup
  outcome the admin handles keeps `404`. OpenAPI is unchanged.
- **Dependencies.** None added.
