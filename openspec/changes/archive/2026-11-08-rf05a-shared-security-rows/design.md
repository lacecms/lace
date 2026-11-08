## Context

- See proposal.md *Why*. Neither platform package is declared in
  `scripts/source-layout.json` yet (RF5B), so the boundary checker allows a
  `src/security/` directory without a header or direction rule; the
  no-subdirectory-barrel rule of AGENTS.md still applies by convention.
- `packages/application/src/ports/security.ts` already splits the boundary:
  `SecurityService extends UserProfileReader, AccountSecurityPort, SessionSecurityPort, TokenSecurityPort`,
  and `security.type-test.ts` asserts the three command ports are disjoint.
  Setup is split across ports: `isSetupComplete` and `bootstrap` are account
  methods, `createSetupToken` is a token method.
- Verbatim duplicates (observed): `role`, `user`, `profile`, `invitation`,
  `session`, `buildToken`, `normalizedEmail`, `isUniqueViolation`,
  `INVITATION_COLUMNS_SQL`, `ACTIVE_INVITATION_SQL`, `setupExpiryMs` and the
  `limits` table. The only textual difference is `user().disabled`
  (`row.disabled === 1` on Node, `Number(row.disabled) === 1` on D1).
- Platform-local by nature: Node `digest`/`tokenSecret`/`randomBytes`/
  `timingSafeEqual`/`createHmac`; D1 `hex`, `digest`, `base64Url`,
  `randomHex`, `tokenSecret`, `constantTimeEqual`, the shared `TextEncoder`,
  `SETUP_COMPLETED_SQL` (account `bootstrap`, `isSetupComplete`; token
  `createSetupToken`), `USER_COLUMNS_SQL` (account only) and the private
  `statement()` binder (all ports).
- Consumers of the adapter classes: `runtime.ts` and `worker.ts` construct
  them with `(connection | database, now)`; both `security-contract.test.ts`
  files construct them through the package entry;
  `scripts/fixtures/oauth-mcp/compat.test.mjs` imports
  `packages/platform-cloudflare/dist/d1-security.js` by path.
- `packages/test-utils/src/security-contract/rate-limits.ts` asserts literal
  limits and `retryAfterSeconds` for `setup`, `auth`, `reset` and `invite`.

## Goals / Non-Goals

**Goals:** one owner for every verbatim security row helper and policy value;
each adapter file implements one port; observable behavior, SQL text,
statement order and atomicity are byte-for-byte unchanged; the platform export
lists and the `d1-security.js` dist path are unchanged.

**Non-Goals:** sharing write logic or the repeated "invalidate OAuth grants,
import tokens and sessions" statement trio; changing the composite
`SecurityService` input of `createLaceApp`; typing the baselined contract
tests.

## Decisions

### D1. Shared rows live in `packages/db/src/security/rows.ts`

`db` already owns the security SQL shared by both runtimes
(`security/api-tokens.ts`, `security/oauth.ts`) and depends on
`@lacecms/application` and `@lacecms/domain`, which the mappers need
(`actorDisplayName`, `unixMilliseconds`, the record types). The `security`
directory already depends only on `shared`, so no direction changes.

Public names follow `importTokenMetadata`: the helper is named after the
value it returns, because generic names (`role`, `user`, `session`) would be
ambiguous on the `@lacecms/db` entry.

| Local name | Shared name |
| --- | --- |
| `role` | `securityRole` |
| `user` | `managedUser` |
| `profile` | `userProfile` |
| `invitation` | `invitationRecord` |
| `session` | `sessionRecord` |
| `buildToken` | `buildTokenMetadata` |
| `normalizedEmail`, `isUniqueViolation`, `INVITATION_COLUMNS_SQL`, `ACTIVE_INVITATION_SQL` | unchanged |

`managedUser` uses `Number(row.disabled) === 1`: better-sqlite3 returns an
integer column as a JavaScript number without `safeIntegers`, so the Node
result is identical, and the form tolerates a driver returning a string or
bigint. Rejected: a platform-neutral `security-rows` package (one more
member for ten helpers) and placing the mappers in `application` (they read
SQL column names, which application must not know).

### D2. Policies are application constants beside their port

`SENSITIVE_RATE_LIMIT_POLICIES` and the `SensitiveRateLimitPolicy`
(`{ readonly limit: number; readonly windowMs: number }`) type are added to
`ports/security.ts` below `SensitiveRateLimitOperation`; typing the table as
`Readonly<Record<SensitiveRateLimitOperation, SensitiveRateLimitPolicy>>`
makes a new operation a compile error until it has a policy. The object is
frozen. `SETUP_TOKEN_TTL_MS = 60 * 60 * 1000` is added to
`accounts/use-cases.ts` beside `INVITATION_TTL_MS` and
`PASSWORD_RESET_TTL_MS`. The roadmap line "`setupExpiryMs` become one
`Record`" is read as "both move to application"; the setup lifetime is not a
rate-limit policy, so it stays a named constant. Rejected: `shared/limits.ts`
(the `shared` directory may not import `ports`, where the operation type
lives). The rate-limit contract keeps its literal numbers so that it still
detects an accidental edit of the table.

### D3. Each adapter splits into port objects plus a delegating composite

Per platform, `src/security/`:

| Module | Content |
| --- | --- |
| `secrets.ts` | crypto helpers: Node `digest`, `tokenSecret` (identifier generation keeps its inline `randomBytes(16).toString("hex")` so bodies stay verbatim); D1 `hex`, `digest`, `base64Url`, `randomHex`, `tokenSecret`, `constantTimeEqual`, `encoder` |
| `statements.ts` (D1 only) | `bindStatement(database, sql, ...params)` (the former private `statement()`), `SETUP_COMPLETED_SQL` |
| `account.ts` | `NodeAccountSecurity` / `D1AccountSecurity implements UserProfileReader, AccountSecurityPort`: setup completion and bootstrap, profile, users, invitations, password reset and change, display name; private helpers `mutateUser`, `loadInvitation` (and D1 `userByEmail`, `insertUser`, `USER_COLUMNS_SQL`) |
| `session.ts` | `NodeSessionSecurity` / `D1SessionSecurity implements SessionSecurityPort` |
| `token.ts` | `NodeTokenSecurity` / `D1TokenSecurity implements TokenSecurityPort`: setup token, build tokens, import tokens; private `importTokenRow` |

Each port class takes the same `(connection | database, now)` constructor
arguments. Method bodies move verbatim; only `this.statement(...)` becomes
`bindStatement(this.database, ...)` and the shared helpers are imported.

`NodeSecurityService` and `D1SecurityService` stay in `security.ts` and
`d1-security.ts` with their constructors and doc comments, create the three
port objects and implement `SecurityService` by explicit one-line delegating
methods typed from the port (`Parameters<AccountSecurityPort["createInvitation"]>`).
The rate limiters stay in the same files and read
`SENSITIVE_RATE_LIMIT_POLICIES`. The port classes are not exported from the
package entry; the platform export lists stay identical. Module direction:
`security.ts`/`d1-security.ts` → `security/{account,session,token}.ts` →
`security/secrets.ts` (and D1 `security/statements.ts`); port modules never
import each other.

Rejected: mixins or `Object.assign` composition (loses `implements` checking
and changes the class declaration shape); exporting the three classes and
passing them separately to the server (that is RF5C's composition work);
moving the composite into `src/security/` (would change the dist path the
OAuth compatibility fixture imports, and RF5B decides the platform layout).

### D4. Credential routes depend on `TokenSecurityPort`

`registerCredentialRoutes` binds `const security: () => TokenSecurityPort = routeContext.security`
and `buildTokenDto` derives its input from `TokenSecurityPort`. `RouteContext`
itself is unchanged (RF5C splits it). The narrowing is compile-time only.

## Risks / Trade-offs

- [A moved body silently changes statement order or a transaction scope] →
  Moves are cut-and-paste of whole methods; the shared security contract runs
  on SQLite and D1 after each platform split, and the reviewer diff is checked
  with `git diff --color-moved`.
- [Delegation boilerplate in the composites] → About 30 one-line methods per
  platform; accepted because RF5C replaces the composite input with port
  objects and can delete them.
- [`@lacecms/db` and `@lacecms/application` export lists grow] → Intended and
  additive; their packaged export pins are updated in the same task and the
  platform pins prove nothing else moved.
- [Node `disabled` comparison changes form] → Covered by the users contract
  cases that disable and re-enable accounts on Node.

## Migration Plan

None: no schema, data, configuration or operator change. Rollback is a revert.
