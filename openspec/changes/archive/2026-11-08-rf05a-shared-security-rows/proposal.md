## Why

Roadmap Step RF5 (runtime deduplication), Session RF5A of
`docs/refactoring-roadmap.md`. The Node and D1 security adapters
(`packages/platform-node/src/security.ts`, 860 lines, and
`packages/platform-cloudflare/src/d1-security.ts`, 984 lines, 16 lines under
the ceiling) carry verbatim copies of the security row mappers, the email
normalizer, the unique-violation check, two invitation SQL fragments, the
setup-token lifetime and the eleven-entry rate-limit policy table (baseline
§3: "security row mappers and SQL constants — verbatim"). A change to one copy
silently diverges the runtimes that architecture §15 requires to stay at
parity. Each adapter is also one class implementing all four security ports,
so the D1 file cannot grow, and the server credential routes depend on the
whole `SecurityService` although they only issue, list and revoke tokens.

## What Changes

- **Shared rows in `db`.** New `packages/db/src/security/rows.ts`, following
  the existing `security/api-tokens.ts` pattern, owns the row mappers
  (`securityRole`, `managedUser`, `userProfile`, `invitationRecord`,
  `sessionRecord`, `buildTokenMetadata`), `normalizedEmail`,
  `isUniqueViolation`, `INVITATION_COLUMNS_SQL` and `ACTIVE_INVITATION_SQL`.
  Both adapters import them; their local copies are deleted. `digest`,
  `tokenSecret`, `randomHex` and the other crypto helpers stay
  platform-local (Node `node:crypto`, D1 WebCrypto).
- **Policies in `application`.** The rate-limit table becomes one exported
  `SENSITIVE_RATE_LIMIT_POLICIES: Readonly<Record<SensitiveRateLimitOperation, SensitiveRateLimitPolicy>>`
  beside the `SensitiveRateLimitOperation` port type, and `setupExpiryMs`
  becomes `SETUP_TOKEN_TTL_MS` beside `INVITATION_TTL_MS` and
  `PASSWORD_RESET_TTL_MS`. Both limiters and both setup-token writers read
  them. Values are unchanged.
- **Adapters split by port.** Each platform gains `src/security/` with
  `account.ts` (`UserProfileReader` and `AccountSecurityPort`), `session.ts`
  (`SessionSecurityPort`), `token.ts` (`TokenSecurityPort`) and a
  platform-local `secrets.ts` for the crypto helpers; D1 adds
  `statements.ts` for its statement binder and the setup-state SQL that the
  account and token ports share. `NodeSecurityService` and
  `D1SecurityService` stay in `security.ts` and `d1-security.ts`, keep their
  constructor signatures and delegate each method to the port object; the
  rate limiters stay beside them. Statement order, transactions, batches and
  SQL text are moved verbatim.
- **Narrow credential routes.** `packages/server/src/routes/credentials.ts`
  types its security dependency as `TokenSecurityPort`.
- **One harmonized mapper.** The Node `user` mapper reads `row.disabled === 1`;
  the D1 copy reads `Number(row.disabled) === 1`. The shared mapper uses the
  D1 form, which is the same result for better-sqlite3 integer columns.
- Non-goals: no SQL, transaction, error or result change; no shared write
  path; no shared content reader (RF5B); no platform `source-layout.json`
  declaration or cycle-baseline change (RF5B); no `RouteContext` split or
  `composeLaceServices` (RF5C); no typing of the baselined
  `security-contract.test.ts` files (RF9E).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Behavior-preserving refactor (`skip_specs: true`): every requirement of
`security-lifecycle`, `d1-security-persistence` and the shared security
contract is unchanged, and the contract cases are the parity guard.

## Impact

- Code: `packages/db/src/security/rows.ts` (+ test) and the `db` entry;
  `packages/application/src/ports/security.ts`,
  `packages/application/src/accounts/use-cases.ts`;
  `packages/platform-node/src/security.ts` and new `src/security/*`;
  `packages/platform-cloudflare/src/d1-security.ts` and new `src/security/*`;
  `packages/server/src/routes/credentials.ts`.
- Public API: `@lacecms/db` gains the ten shared names and `@lacecms/application`
  gains `SENSITIVE_RATE_LIMIT_POLICIES`, `SensitiveRateLimitPolicy` and
  `SETUP_TOKEN_TTL_MS` (additive; packaged export pins updated). The
  `platform-node` and `platform-cloudflare` export lists are unchanged, and
  `dist/d1-security.js` keeps its path for
  `scripts/fixtures/oauth-mcp/compat.test.mjs`.
- Tests: both platforms' `security-contract` suites (every case of
  `packages/test-utils/src/security-contract/`) and `repository-contract`
  run unchanged; the rate-limit contract keeps its literal expectations as an
  independent oracle of the table.
- Architecture: none (§15 parity is preserved, not changed). Roadmap RF5A
  section, the duplication row of §3 and the progress log record the outcome.
- Dependencies: RF4E (split `db`), RF2C (split contract suite), RF9A–RF9B.
  Precedes RF5B and RF5C.
