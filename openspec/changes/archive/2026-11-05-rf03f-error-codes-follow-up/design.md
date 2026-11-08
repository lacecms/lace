## Context

See proposal.md (Why). Measured at commit `24f6ad1b`.

**Stale-plan sites.** Every one raises `CONTENT_INVALID_STATE` through a local
failure helper:

- application `configuration/apply.ts:288` (`staleSynchronization`, used at
  :330 and :392);
- db `sync/block-migration-scan.ts:87` (`staleBlockMigration`);
- Node `content-repository.ts:421,508,547`;
- D1 `d1-content-repository.ts:1365,1529,1544`;
- test-utils `store/support.ts:127`, `store/sync.ts:218`.

The detectors are `platform-node/src/content-sync.ts:53` and
`cli/src/commands.ts:145`.

**Setup and lookup sites:**

- Node `security.ts:174,199,213,242,249,284`;
- D1 `d1-security.ts:199,212,219,230,243,274,280`.

`server/src/routes/setup-session.ts:54-56` catches everything except
`AuthorizationError` and returns `notFound()`, which is
`errorResponse(transportError("NOT_FOUND"))`. That is the same envelope the
classifier produces for `AccountError("NOT_FOUND")`.

**Admin setup form.** `SetupAdminForm.tsx:82-88` reconciles on `404` or a lost
response, shows a rate-limit message on `429`, and shows a generic failure
otherwise.

**Pass-through checks:**

- `db/shared/cursors.ts:31`, `shared/values.ts:39`, `shared/write-errors.ts:10`;
- `platform-node/image-inspector.ts:49`;
- `db/builds/export.ts:154`, which rewraps any `DomainError` as a cursor error
  and is out of scope as a transport-local mapping.

**Header parsers and their wrappers:**

- contracts `shared/preconditions.ts:9-45`, `media/mappers.ts:139-143`;
- server `shared/request.ts:40-48` and `routes/media.ts:224-228`, each
  `catch {}`.

**Server plain errors:**

- `composition/route-context.ts:60,68,113`;
- `routes/builds.ts:50,70,93,114`;
- `routes/setup-session.ts:77`;
- `runtime/build-site.ts:45`, `runtime/email.ts:354`.

**Rate-limit middleware.** `app/create-app.ts:175-186` builds the `429` with
`String(retryAfterSeconds)` (default 60). The classifier's `RATE_LIMITED`
exposure applies `max(1, ceil(seconds))`.

**Platform error classes:**

- `platform-node`: `minio-storage.ts:31`, `runtime.ts:70,297`,
  `host-database-safety.ts:100` (a CLI host guard, out of scope);
- `platform-cloudflare`: `r2-storage.ts:33`, `settings.ts:57`.

## Goals / Non-Goals

**Goals:**

- Every failure named above carries a `LaceError` code that its consumers test.
- The REST error matrix stays equal to the RF3D baseline except for the setup
  change, and the matrix totality test lists the new classes.
- MCP keeps classifying through the same table.

**Non-Goals:**

- New documented transport codes or OpenAPI changes.
- Changing messages.
- `HostDatabaseSafetyError` (CLI host safety, not a transport failure).
- Build-export cursor mapping.
- Client-side packages (sdk, render, cli, create-lace, admin), consistent with
  RF3D.

## Decisions

### 1. Stale plans

- `domain/src/shared/errors.ts` adds `CONFIGURATION_SYNC_STALE` to
  `DomainErrorCode`.
- `domain/src/content/synchronization.ts` (new, beside the content lifecycle)
  exports `StaleSynchronizationError extends DomainError`.
- Each stale site throws it with its existing message. The local helpers keep
  their names and bodies call the new class.
- The detectors use
  `error instanceof LaceError && error.code === "CONFIGURATION_SYNC_STALE"`.
  `cli` reaches `LaceError` through its allowed `@lacecms/contracts`
  re-export, and the code constant through a contracts re-export of the
  domain code.

**Classifier.** The code is not a transport code, so the classifier maps it to
`500 INTERNAL_ERROR`. The roadmap's "409" is withdrawn because no transport
route applies a plan. A matrix row pins the 500.

*Alternative:* reuse `CONTENT_INVALID_STATE` with a structured `reason`.
Rejected, because a separate code is what the CLI needs and what the matrix
can pin.

### 2. Setup failures

**Adapters.** In both adapters:

- the four outcomes (already completed, unavailable, invalid credential, user
  not found) throw `AccountError("NOT_FOUND")`;
- "claimed user is not an administrator" and "invitation could not be
  reloaded" throw `InvariantError`.

**Route.** `setup-session.ts` removes its try/catch, so the classifier
produces:

- `404 NOT_FOUND` (identical body) for the outcomes;
- `403` for authorization, as before;
- `500` for anything else.

**Other callers.** The account use cases that call `user(…)` and other
adapter lookups already expect `AccountError("NOT_FOUND")` semantics. The
security contract suite pins the codes on both runtimes.

**Admin.** The admin is unchanged: `404` still reconciles, and other statuses
show its existing generic message.

### 3. Pass-through

The four guards replace `instanceof DomainError` (and `ContentValidationError`
in `write-errors.ts`) with `instanceof LaceError`. `ContentValidationError`
already extends `LaceError` (RF3D).

### 4. Header parsers

- `resolveExpectedRevision`, the ETag parsers and `resolveMediaPrecondition`
  throw `ContractValidationError` with the same issue path conventions.
- The two server wrappers become
  `catch (error) { if (!(error instanceof ContractValidationError)) throw error; return invalid(…) }`,
  keeping their messages and pointers.
- Mapper argument guards (`public-mappers.ts`, `build-export-mappers.ts`,
  `primitives.ts`, the media base URL guard) remain `TypeError` per RF3D
  decision 7.

### 5. Server failures and rate limits

- **Plain errors** listed in Context become `InvariantError` from
  `@lacecms/contracts`, which already re-exports `LaceError`. Contracts adds an
  `InvariantError` re-export, because the server may not import content.
- **Authorization.** `setup-session.ts` no longer special-cases authorization
  (decision 2). Any other `instanceof AuthorizationError` test becomes a code
  test.
- **Rate limits.** The non-protocol branch of the middleware throws
  `new RateLimitExceededError(retryAfterSeconds)`, and the boolean-decision
  default stays 60. `RATE_LIMITED.expose` now produces the header for both
  paths. For the integer values the limiter returns, the header text is
  unchanged. The matrix test pins `30 → "30"` and `0.2 → "1"`. The protocol
  branch keeps `protocolErrorResponse`.

### 6. Platform bases

- `application/src/ports/storage.ts` gains
  `ObjectStorageError extends LaceError<"STORAGE_UNAVAILABLE">`.
- `application/src/ports/runtime-configuration.ts` (new; or the existing port
  module that owns runtime settings) gains
  `RuntimeConfigurationError extends LaceError<"RUNTIME_CONFIGURATION_INVALID">`.
- `NodeObjectStorageError`/`CloudflareObjectStorageError` extend
  `ObjectStorageError`. `NodeEnvironmentError`/`CloudflareEnvironmentError` and
  `NodeInfrastructureUnavailableError` extend `RuntimeConfigurationError`.
- Each keeps its `name`, constructor signature and export. The base
  constructor takes the code and message, and each subclass passes its
  existing message.
- Neither code is a transport code, so HTTP stays `500`, which matches the
  existing "stored object unavailable" scenario.

### 7. Matrices

- **test-utils `errors/error-matrix.ts`** gains rows for:
  - `StaleSynchronizationError`, `ObjectStorageError` and
    `RuntimeConfigurationError` (500);
  - the setup `AccountError("NOT_FOUND")` (404);
  - the middleware `429`.
- **Exported classes.** The totality test's list of packages scanned for
  exported error classes adds `platform-node` and `platform-cloudflare` for
  the classes above.
- **REST matrix.** The REST matrix in `server/app/error-matrix.test.ts` is
  re-pinned. Its only intended difference from the RF3D baseline is a new
  case: setup with a failing repository returns `500`.

## Risks / Trade-offs

- **[Setup outage now shows a generic admin message instead of
  reconciling.]** → The admin's existing branch handles it. A later state
  read still reconciles a completed installation, which the existing "lost
  response" scenario covers through a retry. Recorded as the one intended
  behavior change.
- **[A pass-through now lets `InvariantError` escape where callers relied on
  422.]** → The repository contracts and the matrix show any changed status.
  An invariant failure was always a defect, and 500 is its specified mapping.
- **[Subclass constructors change their base.]** `instanceof Error` stays
  true, and `name` is unchanged. → The platform packaged export tests compare
  export lists, which are unchanged.

## Migration Plan

No stored data or API description changes. Rollback is a revert. The one REST
difference (setup infrastructure failure `500`) is recorded in the change
verification and the CHANGELOG decision list in roadmap §5.
