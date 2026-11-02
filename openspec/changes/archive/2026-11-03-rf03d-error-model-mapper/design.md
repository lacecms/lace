## Context

See `proposal.md` (Why). Error conventions observed on commit `b680bfab`:

| Class | Package | Base | `code` | Classified today (REST) | MCP today |
| --- | --- | --- | --- | --- | --- |
| `FieldConfigurationError` | content `index.ts:664` | `Error` | — | 500 `INTERNAL_ERROR` | 500 |
| `ContentValidationError` | content `:1513` | `Error` | — (`issues`) | 422 `VALIDATION_FAILED` + issues | same |
| `BlockConfigurationError` | content `:2376` | `Error` | — | 500 | 500 |
| `BlockMigrationError` | content `:2915` | `Error` | `missing_step` … (4 lowercase) | 500 | 500 |
| `ConfigurationError` | config `:45` | `Error` | — (`name` read by `apps/api/src/project-config.ts:27`) | 500 | 500 |
| `DomainError` + 4 subclasses | domain `:56-109` | `Error` | `DomainErrorCode` (14) | table `domainErrorStatus`/`domainErrorMessage` (`contracts:2771-2805`); `BlockOrderError` keeps its message; `BuildExportVersionChangedError` adds version details; `CollectionQueryValidationError` → 422 `VALIDATION_FAILED` with its pointer | same |
| `AccountError` | application `accounts.ts:31` | `Error` | `AccountErrorCode` (5) | inline branch in `app.onError` (`server/app.ts:733`) → `transportError(code)` | **500 `INTERNAL_ERROR`** |
| `RateLimitExceededError` | application `accounts.ts:39` | `Error` | — (`retryAfterSeconds`) | inline branch → 429 `RATE_LIMITED` + `retry-after` `max(1, ceil(s))` | **500** |
| `RequestValidationError` | server-local `app.ts:447` | `Error` | — (`issues`) | inline → 422 | n/a |
| `AuthorizationError` | server-local `app.ts:453` | `Error` | — | inline → 403 `AUTHORIZATION_DENIED`; `instanceof` also used by `/setup/admin` (`:1107`) to tell it apart from bootstrap failures | n/a |
| `ArgumentFailure` | mcp-local `index.ts:33` | `Error` | — (`body`) | n/a | its own body (validation, `NOT_FOUND`) |

`classifyError` (`contracts:2855`) cannot recognize the application classes:
ADR 0001 forbids contracts → application. Dependency direction also decides
where a shared base can live: `content` imports nothing internal, `config` and
`domain` import only `content`, contracts imports `content` and `domain`,
server imports only `application`, `contracts` and `auth`
(`scripts/check-boundaries.mjs:14-23`).

Raw `throw new Error(...)` in content and application source (12):

| Site | Kind |
| --- | --- |
| `content/internal-links.ts:23` `encodeEntryLink` | argument |
| `content/schema-path.ts:7,15` `parseSchemaPath`; `:37` `schemaFieldAt` | argument (config catches every throw at `config/index.ts:398-404`) |
| `content/index.ts:3575,3590,3604` canonical JSON without `TextEncoder`/Web Crypto | runtime capability |
| `application/configuration-evolution.ts:645,650` traversal of a validated baseline | invariant |
| `application/media-use-cases.ts:620,623` stored MIME / missing stored object; `:668` catalog reload after a successful write | invariant / infrastructure |

Application also throws `TypeError`/`RangeError` for argument guards (brands,
`importTokenExpiry`, dispatcher retry, tracking timeout, `accountLink`,
`normalizeDisplayName`); tests pin `toThrow(TypeError)`. Those are already
typed and stay.

## Goals / Non-Goals

**Goals:**

- One error base with a stable `code`, owned by the lowest package; every
  portable error class extends it.
- One classifier, one status/message table, used unchanged by REST and MCP;
  the REST matrix equals the baseline.
- No untyped `Error` thrown by content or application.

**Non-Goals:**

- Error classes outside content/config/domain/application/contracts and the
  two transport-local classes (render, sdk, cli, generators, platforms,
  builder, admin).
- A shared `fail` factory (see decision 8).
- Changing any REST envelope, OpenAPI, the `503 server_error` answers for
  `/mcp` and OAuth paths, or the `BuildExportCursorError` route branch.
- Moving files beyond the new `errors.ts`; RF4 splits the modules.

## Decisions

### 1. `LaceError` lives in content; domain and contracts re-export it

New `packages/content/src/errors.ts`:

```ts
/** A portable failure with a stable machine-readable code. */
export class LaceError<Code extends string = string> extends Error {
  public constructor(
    public readonly code: Code,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "LaceError";
  }
}

/** A product guarantee or required runtime capability failed; never exposed. */
export class InvariantError extends LaceError<"INTERNAL_INVARIANT"> { … name = "InvariantError" }
```

`@lacecms/content` exports both; `@lacecms/domain` re-exports `LaceError`
(the roadmap's location, for domain consumers); `@lacecms/contracts`
re-exports `LaceError` so server and MCP can construct and recognize it.
Each subclass still sets its own `name` after `super`, so `name`-based checks
keep working.

Alternative: `LaceError` in domain as the roadmap says. Rejected: content and
config cannot import domain, so their classes could not extend it.

### 2. Codes per class

| Class | Code |
| --- | --- |
| `ContentValidationError` | `VALIDATION_FAILED` |
| `FieldConfigurationError` | `FIELD_CONFIGURATION_INVALID` |
| `BlockConfigurationError` | `BLOCK_CONFIGURATION_INVALID` |
| `BlockMigrationError` | unchanged `BlockMigrationErrorCode` (`LaceError<BlockMigrationErrorCode>`) |
| `ConfigurationError` | `CONFIGURATION_INVALID` |
| `DomainError` | unchanged `DomainErrorCode` (`LaceError<DomainErrorCode>`) |
| `AccountError` | unchanged `AccountErrorCode` |
| `RateLimitExceededError` | `RATE_LIMITED` |
| `ContractValidationError` (contracts, new) | `VALIDATION_FAILED` |
| `InvariantError` | `INTERNAL_INVARIANT` |

Codes outside the transport code set (`errorCodeSchema`) are internal and
classify as 500. Constructors and public properties are unchanged, so every
existing `new X(...)` call compiles as is.

### 3. Account errors move to domain

`AccountErrorCode`, `AccountError` and `RateLimitExceededError` move verbatim
(plus `extends LaceError`) from `application/src/accounts.ts` to
`domain/src/index.ts`; `accounts.ts` re-exports them so the
`@lacecms/application` export list is unchanged. Contracts can then type the
classifier against them.

Alternative: keep them in application and classify by code only, with a
`satisfies` check in test-utils. Rejected: the classifier would need an
unchecked `retryAfterSeconds` read for the header.

### 4. One total classification table in contracts

```ts
type MappedErrorCode = Exclude<LaceErrorCode, "INTERNAL_ERROR">;
interface ErrorMapping {
  readonly status: ClassifiedError["status"];
  readonly message: string;
  /** Safe per-class additions; only these may read the error. */
  readonly expose?: (error: LaceError) => {
    readonly details?: JsonObject;
    readonly headers?: Readonly<Record<string, string>>;
    readonly message?: string;
  } | undefined;
}
const errorMappings: Readonly<Record<MappedErrorCode, ErrorMapping>> = { … };
```

The table is the union of today's two status tables and two message tables
(the shared `AUTHORIZATION_DENIED` entry is identical in both), plus
`VALIDATION_FAILED` (`422`, "The request did not satisfy the API contract.").
Compile-time checks next to it: `DomainErrorCode`, `AccountErrorCode` and
`"RATE_LIMITED"` each `extends MappedErrorCode`. Three `expose` hooks exist:
`BUILD_EXPORT_VERSION_CHANGED` (version details), `CONTENT_INVALID_STATE`
(`BlockOrderError` message) and `RATE_LIMITED` (`retry-after`:
`String(Math.max(1, Math.ceil(retryAfterSeconds)))`).

`classifyError(error)`:

1. `ContractValidationError` → `validationError(error.issues)`;
   `ContentValidationError` → `validationError(toContentValidationIssues(error))`;
   `CollectionQueryValidationError` → today's pointer issue. (Issue-carrying
   classes are recognized first because their envelope is built from issues,
   not from the table; `CollectionQueryValidationError` keeps its domain code.)
2. `error instanceof LaceError` and `Object.hasOwn(errorMappings, error.code)`
   → `{ status, body: { error: { code, message, details? } }, headers? }`
   from the entry and its `expose` result.
3. Otherwise the existing `500 INTERNAL_ERROR` result.

`ClassifiedError` gains `readonly headers?: Readonly<Record<string, string>>`.
`transportError(code)` returns `{ status, body }` from the same table;
`TransportErrorCode` stays as a named subset. `instanceof LaceError` (not duck
typing on `code`) keeps Node system and driver errors with a `code` property
out of the table.

### 5. Server: `onError` delegates

`RequestValidationError` is replaced by contracts' new
`ContractValidationError extends LaceError<"VALIDATION_FAILED">`
(`readonly issues: readonly ContractValidationIssue[]`, message "Request
validation failed."). `AuthorizationError` stays server-local, so the
`/setup/admin` `instanceof` keeps distinguishing it, and becomes
`class AuthorizationError extends LaceError<"AUTHORIZATION_DENIED">`.
`app.onError` keeps the `/mcp` and OAuth `503` branch and otherwise returns
`errorResponse(classifyError(error))`; `errorResponse` applies
`classified.headers`. The `AccountError` and `RateLimitExceededError` imports
disappear from server. Direct `transportError(...)` responses (404, 413, the
limiter's own 429) are unchanged.

### 6. MCP: one catch path

`ArgumentFailure` is removed. `argumentsFor` throws
`new ContractValidationError(toContractValidationIssues(result.issues))`;
`get_entry` rejects with `new LaceError("NOT_FOUND", "Entry does not exist.")`;
the tool catch returns `classifyError(error).body`. Headers are ignored.

### 7. Raw errors: arguments are `TypeError`, invariants are `InvariantError`

- `encodeEntryLink`, `parseSchemaPath` (both throws), `schemaFieldAt`:
  `TypeError` with the same message — the application argument-guard
  convention. Config's `catch {}` is unaffected.
- Canonical JSON capability checks, configuration-evolution traversal and the
  three media sites: `InvariantError` with the same message. The media
  messages stay (one test-utils assertion and one application assertion read
  them).

All still classify as 500. The vocabulary guard (decision 9) keeps
`new Error(` out of content and application source.

### 8. `fail` helpers stay local

Content (`${path} ${message}`), config, domain (`code`) and application media
(`failure`) helpers each throw their own subclass with a package-specific
message shape. With a shared base nothing is gained by a factory; RF3B's
deferral closes here with this decision.

### 9. Error matrix, totality and guard

- `packages/test-utils/src/error-matrix.ts` exports `errorMatrixCases`: per
  case a `name`, the exported class it covers, `create(): unknown`, and the
  expected `{ status, code, message, details?, retryAfter? }`. Cases cover
  every `DomainErrorCode` (via `DomainError`), each of the four domain
  subclasses, every `AccountErrorCode`, `RateLimitExceededError` (1.2 s →
  `"2"`), `ContentValidationError`, `ContractValidationError`, the four
  configuration/migration classes, `InvariantError`, a bare `LaceError` with
  an internal code, a plain `Error` and a `TypeError`. Expected values are the
  baseline of task 1.1.
- `error-matrix.test.ts` (test-utils): `classifyError` matches every case; a
  totality test collects every exported class from `@lacecms/content`,
  `domain`, `config`, `application` and `contracts` whose prototype chain
  reaches `Error`, de-duplicates re-exports by identity, and fails naming any
  class without a case.
- `packages/server/src/error-matrix.test.ts`: for every case, the harness's
  `content.loadAdminEntry` throws `create()` and
  `GET /api/v1/admin/entries/:entryId` returns the expected status, body and
  `retry-after` header. Written and passing before the refactor (task 1.2).
- `packages/mcp/src/index.test.ts`: the same cases through `get_entry` return
  `classifyError(create()).body`; the `AccountError` and
  `RateLimitExceededError` cases are recorded as `INTERNAL_ERROR` in the
  baseline and flip in task 5.2.
- `tests/shared-vocabulary.test.mjs`: single owner for `LaceError`,
  `InvariantError`, `AccountError`, `RateLimitExceededError`,
  `ContractValidationError` and `classifyError`; `throw new Error(` /
  `new Error(` flagged in `packages/content/src` and
  `packages/application/src` non-test files, with a fixture.

No Node/D1 repository contract case is added: no storage or runtime adapter
behavior changes, and both runtimes mount the same `createLaceApp` and MCP
handler.

### 10. Documentation

Architecture §12 *Contract rules* gains the error-model bullet (one base with
a stable code in content; one classifier and table in contracts; REST and MCP
share it; unknown → sanitized 500). New `docs/adr/0019-error-model.md` and a
row in `docs/adr/README.md`. Roadmap baseline row "error conventions" moves
from 4 to 1 and records "MCP maps application errors through the shared
classifier".

## Risks / Trade-offs

- [Duplicate installed copies of `@lacecms/content` would break
  `instanceof LaceError`] → the same risk exists today for `DomainError`;
  workspace and published packages pin one version.
- [An internal code later collides with a transport code] → the matrix and
  totality tests fail for any class whose classification differs from its
  case.
- [Moving account errors changes where they are declared] → application
  re-exports them; its packaged export list is checked unchanged.
- [`ClassifiedError.headers` is an additive public type change] → optional;
  existing consumers compile.

## Migration Plan

None: no stored data, envelope or configuration format changes. Rollback is a
revert of the change.

## Open Questions

None.
