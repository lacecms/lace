# RF3F verification

## Baseline

Measured at commit `5be57219` (after RF3E) with Node 24.22.1 and pnpm
12.3.4, after a full `turbo run build`. The raw lists were kept in the session
scratchpad for comparison and removed after verification.

- **Error matrices.** `packages/test-utils/src/errors/error-matrix.ts`
  (SHA-256 `a6fb5b39f8d7b700d6706bec26e04e375a45e9ac1c6acc82a80c4253ee8c7d6f`)
  holds 34 cases. Both `server/app/error-matrix.test.ts` (REST) and the
  test-utils classifier test assert each case's status, body and
  `Retry-After`; the classified output of all 34 cases, serialized as JSON,
  has SHA-256 `67745f143c35f4c66e209f5f1ab13579892cd1803c297019eff1223e747e8986`.
- **Exports.** Runtime keys and declaration names, resolved as in RF3E.

| Package | Runtime keys | Declaration names |
|---|---:|---:|
| domain | 82 | 127 |
| application | 140 | 393 |
| platform-node | 39 | 54 |
| platform-cloudflare | 37 | 58 |

- **Titles.** Sorted output of `vitest list` in each package directory.

| Package | Listed titles | Sorted titles SHA-256 |
|---|---:|---|
| domain | 23 | a8332f7c586a56f2c93d7b88b880452d7f9dec9e890981b039ce667e45a696d7 |
| application | 131 | af54a7fc4ed61f63a9a052e9f7e447f4c969fa90db08493d6f1cf345644ca8ba |
| contracts | 98 | 3001550c3e6a7a090a0d79fb9a9460adc0df81d6dea2726f0a61cf9495b6b7fa |
| db | 28 | ca4d172c06de97fa331766e5ac7ad818c26575a10551398725bc39dbe7389525 |
| server | 90 | 3a98603f068a2b156c65bfa408cd828e7d1e60b5bf760360e51c61167d4e903b |
| platform-node | 71 | 7ea2c6336f826b53ff8cb2f3894d7b11bc91b5b52446aaafc356187204436a6f |
| platform-cloudflare | 79 | 4ba170e4b3df77f967d127bdcccaee00d1d73667e7e7ac53e4980518d5be70d7 |
| cli | 109 | afe2f585cd8b91539392fcf1b1909f5f07c68ee84ce147d8cd7a2b118d4ef7c6 |

- **Failure sites.** `git grep` re-confirmed the stale-plan sites and both
  message detectors listed in design Context at the same lines after RF3E.

## Implementation checks

- **Stale plans.** `domain` exports `CONFIGURATION_SYNC_STALE` (a constant
  and a `DomainErrorCode` member typed `InternalDomainErrorCode`) and
  `StaleSynchronizationError`; contracts re-exports the constant for the CLI.
  The classifier's mapped-code assertion excludes `InternalDomainErrorCode`,
  so the code falls through to `500 INTERNAL_ERROR`, pinned by a matrix row.
  Application `staleSynchronization`, db `staleBlockMigration`, the
  test-utils store and both repositories throw it with their current
  messages; the repositories call a new db helper, `staleSynchronizationPlan`,
  and kept their recorded line counts (2,291 and 2,696).
- **Deviation: D1 guard ambiguity.** On D1 the final synchronization guard
  also requires every introduced internal link to be available, so a failed
  guard was either a stale plan or an unavailable link. Node checks links
  before writing and raised `CONTENT_INVALID_STATE` ("…would introduce an
  unavailable internal link."), while D1 raised `CONTENT_INVALID_STATE` with
  the stale message. Throwing the stale code there would have changed the code
  of a non-stale failure, which the `configuration-synchronization` delta
  forbids. The new db helper `failedSynchronizationGuard` rechecks the link
  conditions only after a failed D1 guard: an unavailable link keeps
  `CONTENT_INVALID_STATE`, now with Node's message, and otherwise the plan is
  stale. The `links/removal` contract case pins `CONTENT_INVALID_STATE` on
  both runtimes. Ten repository-contract assertions and two in-memory store
  assertions on genuine stale cases now expect `CONFIGURATION_SYNC_STALE`, and
  the block-migration race case asserts the code instead of the word "stale".
- **Detectors.** `platform-node/src/content-sync.ts` and `cli/src/commands.ts`
  test `instanceof LaceError` and the code. `apps/api/src/content-sync.test.ts`
  rewords the stale double's message and adds a `CONTENT_INVALID_STATE` failure
  mentioning "stale", which is rethrown without guidance;
  `cli/src/commands-sync-failure.test.ts` (typed, mocking only
  `applyPreparedConfigurationSynchronization`) shows the same for the CLI.
- **Setup.** Both adapters raise `AccountError("NOT_FOUND")` for an already
  completed setup, unavailable setup, invalid credential and an unknown user,
  and `InvariantError` for a non-administrator claim and an invitation that
  cannot be reloaded. The setup contract asserts the typed not-found failure
  on Node SQLite and D1. The route's catch-all is gone:
  `server/src/routes/setup.test.ts` shows the three outcomes return a body
  equal to the former `notFound()` body, and a failing setup port returns
  `500 INTERNAL_ERROR`. Admin `SetupAdminForm` tests pass unchanged.
- **Pass-through.** `db/shared/{cursors,values,write-errors}.ts` and
  `platform-node/image-inspector.ts` test `instanceof LaceError`. New typed
  cases (`db/src/shared/pass-through.test.ts`,
  `platform-node/src/image-inspector-pass-through.test.ts`) show an
  `InvariantError` and an `AccountError` keep their identity through each
  guard.
- **Deviation: `ContractValidationError` location.** Contracts declares
  `shared ← errors`, so `shared/preconditions.ts` and `media/mappers.ts` could
  not import the class from `errors/envelope.ts`. The class and
  `contractValidationIssueSchema` moved verbatim to
  `shared/validation-error.ts`; `errors/envelope.ts` re-exports them, so the
  public export list is unchanged. The vocabulary guard names the new owner.
  The parsers throw it through an internal `invalidPrecondition` helper with
  one request-level issue (`path: ""`) carrying the former message;
  `entityTagForVersion` keeps `TypeError` as a generation guard.
- **Server.** The two wrappers catch only `ContractValidationError` and keep
  their messages and pointers; `server/src/shared/precondition-failures.test.ts`
  shows an unrelated failure inside each wrapper becomes `500`. Capability,
  composition, build-site and email-provider failures throw `InvariantError`
  (contracts now re-exports it). The middleware throws
  `RateLimitExceededError`; the REST matrix pins `30 → "30"`, `0.2 → "1"` and
  the boolean decision's `"60"`, and `routes/protocol.test.ts` keeps the
  protocol `429` bodies. No `instanceof AuthorizationError` remains.
- **Platform bases.** `application` exports `ObjectStorageError`
  (`ports/media.ts`, beside `ObjectStorage`) and `RuntimeConfigurationError`
  (`ports/infrastructure.ts`); there is no `ports/storage.ts`. The five
  platform classes extend them with unchanged names, constructors, messages
  and export lists.
- **Matrices.** The test-utils matrix has 37 cases (34 + stale, storage and
  runtime configuration); the setup outcome is the existing
  `AccountError:NOT_FOUND` row, and the middleware `429` is pinned by the
  server matrix test. Because test-utils may not import the platforms, the
  totality scan for them is `unmatchedErrorClasses` (exported by test-utils):
  each platform test requires every exported error class to have a matrix
  case for itself or a base below `LaceError`. `HostDatabaseSafetyError` is
  exempt as a CLI host guard. A temporary exported `ProbeError extends
  LaceError` in platform-node failed the test naming it; it was removed.
- **Deviation: CLI setup detector.** The first root run failed three CLI
  packaged cases: `auth bootstrap` recognized a completed setup by the
  message "Setup already completed.", a detector design Context did not list.
  It now tests `instanceof LaceError` with code `NOT_FOUND`, the only failure
  `createSetupToken` raises as not found, and prints its unchanged
  "already completed" diagnostic; the CLI suites passed after the change.

## Results

- **Matrix.** The classified output of the 34 baseline cases is unchanged;
  the matrix adds `StaleSynchronizationError`, `ObjectStorageError` and
  `RuntimeConfigurationError` (each `500 INTERNAL_ERROR`). The REST matrix
  adds the middleware `429` rows and the setup `500` case; no existing REST
  response changed.
- **Exports.** Only additions: domain `CONFIGURATION_SYNC_STALE`,
  `StaleSynchronizationError` (and the type `InternalDomainErrorCode`);
  application `ObjectStorageError`, `RuntimeConfigurationError`; contracts
  `CONFIGURATION_SYNC_STALE`, `InvariantError`; db `staleSynchronizationPlan`,
  `failedSynchronizationGuard`; test-utils `unmatchedErrorClasses`. Both
  platform export lists are identical to the baseline.
- **Titles.** domain, application and contracts equal the baseline. db, server,
  platform-node, platform-cloudflare and cli add only the new cases listed
  above (2, 6, 2, 1 and 2 titles).
- **Root gates** (Node 24.22.1, pnpm 12.3.4): `pnpm typecheck`, `pnpm lint`
  (boundary, admin color and Drizzle checks), `pnpm format:check`,
  `pnpm test` (64 Turbo tasks after the CLI fix; 36 root files with 326
  cases), `pnpm openapi:check` (no OpenAPI change), `pnpm compat:mcp`
  (12 files, 228 cases) and
  `pnpm exec openspec validate rf03f-error-codes-follow-up --type change --strict`
  passed. Raw lists and run output were deleted after comparison.
