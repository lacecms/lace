## 1. Baseline and documentation

- [x] 1.1 Record in `verification.md`:
  - the REST error matrix output of `server/app/error-matrix.test.ts`;
  - the test-utils error matrix;
  - sorted `vitest list` titles of `domain`, `application`, `contracts`, `db`,
    `server`, `platform-node`, `platform-cloudflare` and `cli`;
  - runtime keys and declaration names of `domain`, `application` and both
    platform packages;
  - the failure sites from design Context, re-confirmed with `git grep`.

  Verify the raw lists exist in the session scratchpad.
- [x] 1.2 Update the roadmap RF3F text with the corrections:
  - the stale code is internal, not `409`;
  - setup outcomes use `AccountError("NOT_FOUND")`;
  - add the setup `500` difference to the §5 CHANGELOG list.

  Verify the docs link guard passes.

## 2. Stale synchronization

- [x] 2.1 Add `CONFIGURATION_SYNC_STALE` and `StaleSynchronizationError` to
  domain (design decision 1). Make every stale site throw it with its current
  message: application, db, Node and D1 repositories, test-utils store.
  Verify:
  - domain, application and db tests pass;
  - a new repository-contract assertion on the existing stale-plan cases checks
    `code === "CONFIGURATION_SYNC_STALE"` on Node SQLite and D1.
- [x] 2.2 Switch `platform-node/src/content-sync.ts` and `cli/src/commands.ts`
  to the code test. Verify:
  - their tests print rerun guidance for a stale plan whose message is
    reworded in a test double;
  - they print no guidance for a `CONTENT_INVALID_STATE` failure whose message
    contains "stale".

## 3. Setup and pass-through

- [x] 3.1 Replace the setup and lookup `Error`s in both security adapters
  with `AccountError("NOT_FOUND")` or `InvariantError` (design decision 2),
  and remove the setup route's catch-all. Verify:
  - both platform `security-contract` suites pass and assert the codes;
  - server setup tests still return the identical `404` envelope for unknown
    token, completed setup and foreign email;
  - a new server case with a failing setup port returns `500 INTERNAL_ERROR`;
  - admin `SetupAdminForm` tests pass unchanged.
- [x] 3.2 Change the four pass-through guards to `instanceof LaceError`.
  Verify with new db and platform-node unit cases that an `InvariantError` and
  an `AccountError` keep their codes through each guard, and that the
  existing suites pass.

## 4. Contracts and server

- [x] 4.1 Make the precondition and media-precondition parsers throw
  `ContractValidationError`, and narrow the two server wrappers to that
  class. Verify:
  - contracts tests for each malformed header pass with the new class;
  - server precondition tests keep their messages and pointers;
  - a new server case shows an unrelated failure in the same handler reaches
    the classifier as `500`.
- [x] 4.2 Replace the server's plain `Error`s with `InvariantError`, switch
  any `instanceof AuthorizationError` decision to a code test, and make the
  rate-limit middleware throw `RateLimitExceededError` on non-protocol paths.
  Verify:
  - the REST matrix test, extended with the middleware `429` (`30 → "30"`,
    `0.2 → "1"`), passes;
  - protocol-path `429` bodies are unchanged in `routes/protocol.test.ts`.

## 5. Platform bases and matrices

- [x] 5.1 Add `ObjectStorageError` and `RuntimeConfigurationError` to
  application ports. Make the five platform error classes extend them with
  unchanged names, constructors and messages. Verify:
  - platform tests and packaged export tests pass with identical export lists;
  - a media binary request with an unavailable object still returns the
    existing `500` envelope.
- [x] 5.2 Extend the test-utils error matrix and its totality scan (design
  decision 7). Verify the matrix tests pass, and a temporary unlisted
  `LaceError` subclass exported from `platform-node` fails the totality test
  naming it (then restore).

## 6. Gates

- [x] 6.1 Add the RF3F progress row to the roadmap, and record the setup
  `500` difference in the change verification. Run root `pnpm typecheck`,
  `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm openapi:check`,
  `pnpm compat:mcp` and `pnpm exec openspec validate
  rf03f-error-codes-follow-up --type change --strict`. Verify:
  - all pass;
  - listed titles equal the baseline plus the new cases;
  - the REST matrix differs from the RF3D baseline only by the new setup and
    middleware rows.

  Record the results and delete raw passed-run output.
