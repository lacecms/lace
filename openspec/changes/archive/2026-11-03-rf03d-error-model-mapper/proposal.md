## Why

Lace has four error conventions and two mappers. `DomainError` (domain) carries
a closed `code`; `AccountError` and `RateLimitExceededError` (application)
extend plain `Error`, one with a code and one without; `ConfigurationError`
(config) and the content classes (`FieldConfigurationError`,
`ContentValidationError`, `BlockConfigurationError`, `BlockMigrationError`)
carry no shared base. `classifyError` in contracts cannot see the application
classes, so `packages/server/src/app.ts` maps them inline in `app.onError`,
and `packages/mcp` — which calls only `classifyError` — reports an
`AccountError` or `RateLimitExceededError` as `INTERNAL_ERROR`, contrary to the
accepted `mcp-content-server` requirement that known application failures keep
their shared code. Twelve `throw new Error(...)` sites in content and
application remain untyped. This is Session RF3D of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md), the last
of Step RF3 (shared vocabulary); RF4 then splits `contracts`, `server` and
`application` and should move one error model, not four.

## What Changes

- **One base class in `@lacecms/content`.** New export
  `LaceError<Code extends string = string>` with `readonly code: Code`.
  Correction to the roadmap text: the roadmap places `LaceError` in `domain`,
  but `content` and `config` may not import `domain` (ADR 0001 dependency
  direction), so the base lives in `content` and `domain` re-exports it.
- **Every portable error extends it.** `DomainError` (unchanged codes),
  `ConfigurationError` (`CONFIGURATION_INVALID`), `FieldConfigurationError`
  (`FIELD_CONFIGURATION_INVALID`), `BlockConfigurationError`
  (`BLOCK_CONFIGURATION_INVALID`), `ContentValidationError`
  (`VALIDATION_FAILED`) and `BlockMigrationError` (its existing lowercase
  codes). Class names, `name` properties, constructors, messages and extra
  properties are unchanged.
- **Account errors move down to `domain`.** `AccountError`,
  `AccountErrorCode` and `RateLimitExceededError` are declared in `domain` so
  that contracts can classify them; `RateLimitExceededError` gains the code
  `RATE_LIMITED`. `@lacecms/application` keeps all three names as re-exports.
- **One table-driven classifier.** `classifyError` in contracts recognizes the
  three issue-carrying validation errors, then looks up any `LaceError` code in
  one total table over the transport codes (status and sanitized message,
  merging today's `domainErrorStatus`/`domainErrorMessage` and
  `transportErrorStatus`/`transportErrorMessage`); everything else is `500
  INTERNAL_ERROR`. `ClassifiedError` gains optional `headers`, used for
  `Retry-After`. `transportError(code)` reads the same table.
- **Server and MCP use only the classifier.** The inline `AccountError` and
  `RateLimitExceededError` branches in `app.onError` are removed; server
  request validation throws a new contracts `ContractValidationError`, and the
  server-local `AuthorizationError` extends `LaceError` with the code
  `AUTHORIZATION_DENIED` (server may import only application and contracts,
  so contracts re-exports `LaceError`). MCP drops
  `ArgumentFailure` and maps every tool failure through `classifyError`, so
  account and rate-limit failures stop surfacing as `INTERNAL_ERROR`.
- **No raw errors in content and application.** Argument-contract violations
  (`encodeEntryLink`, `parseSchemaPath`, `schemaFieldAt`) throw `TypeError`
  like the existing application argument guards; invariant and runtime
  failures (canonical-JSON capabilities, configuration evolution traversal,
  stored-media reads and reloads) throw a new content `InvariantError`
  (`INTERNAL_INVARIANT`), which classifies as `500 INTERNAL_ERROR`. Messages
  are unchanged.
- **Matrix, guard and docs.** One error-matrix case table in test-utils, a
  totality test over the public exports of content, domain, config,
  application and contracts, a REST status matrix that equals the recorded
  baseline, an MCP matrix, a vocabulary-guard extension, architecture §12
  *Contract rules*, ADR 0019 *Error model*, and the roadmap baseline row.

Non-goals: error classes of `render`, `sdk`, `cli`, `create-lace`, platforms,
builder and admin (`AdminClientError`); `fail` helpers stay local in each
package (closing the RF3B deferral: with a shared base, a shared factory would
only re-wrap package-specific message prefixes); OAuth and `/mcp` transport
failures that `app.onError` answers with `503 server_error`; the
`BuildExportCursorError` route branch; splitting files (RF4). No REST status,
code, message, details or header changes; no OpenAPI, SQL, migration or
template change.

Depends on RF3B and RF3C (archived); RF2 put every affected suite on source.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: one added requirement — portable errors share one base
  with a stable code and one classifier owns the status/code/message table,
  pinned by a status matrix that equals the recorded baseline.
- `mcp-content-server`: one added requirement — MCP tool errors use the same
  classifier as REST, so account and rate-limit failures keep their shared
  codes.

## Impact

- Architecture: §12 *Contract rules* (error model and single classifier); new
  `docs/adr/0019-error-model.md` and its index row. No dependency-direction
  change: contracts already imports content and domain; test-utils already
  imports content, config, application, contracts and domain; server and MCP
  already list test-utils as a dev dependency.
- Code: `packages/content/src/index.ts` (and `errors.ts` new),
  `internal-links.ts`, `schema-path.ts`; `packages/domain/src/index.ts`;
  `packages/config/src/index.ts`; `packages/application/src/accounts.ts`,
  `index.ts`, `configuration-evolution.ts`, `media-use-cases.ts`;
  `packages/contracts/src/index.ts`; `packages/server/src/app.ts`;
  `packages/mcp/src/index.ts`; new `packages/test-utils/src/error-matrix.ts`
  and tests; `tests/shared-vocabulary.test.mjs`; packaged export lists.
- Public exports: content adds `LaceError` and `InvariantError`; domain adds
  `LaceError`, `AccountError`, `AccountErrorCode`, `RateLimitExceededError`;
  contracts adds `ContractValidationError` and re-exports `LaceError`; test-utils adds the matrix module.
  `ClassifiedError` gains optional `headers`. Every existing export keeps its
  name and value.
- Runtime behavior: REST unchanged. MCP returns the mapped envelope for an
  `AccountError` or `RateLimitExceededError` instead of `INTERNAL_ERROR`.
  `encodeEntryLink`, `parseSchemaPath` and `schemaFieldAt` throw `TypeError`
  (a subclass of `Error`) with the same messages.
- Dependencies: none added.
