## Why

`@lacecms/domain` and `@lacecms/auth` are the two shared packages with several
concerns that no roadmap session adopts into the architecture §6 domain layout.

- **domain.** `packages/domain/src/index.ts` is 882 lines, against a
  1,000-line ceiling. It mixes seven concerns: branded identifiers, errors,
  actors and permissions, media metadata, content routes, block ordering and
  the entry lifecycle. It also forms the module cycle `index.ts ↔ seo.ts`
  (`seo.ts` imports `Brand` from the entry).
- **auth.** It keeps nine flat modules for two unrelated concerns: Better Auth
  session handling, and MCP OAuth with import-token actors. It forms the cycle
  `mcp-boundary.ts ↔ mcp-consent.ts`, because consent imports provider types
  from the boundary that constructs it.

Both cycles are frozen in `scripts/source-cycle-baseline.json` (RF4X). Each
package also keeps one `@ts-nocheck` test in
`scripts/test-typecheck-baseline.json`.

This is the new Session RF4G of `docs/refactoring-roadmap.md` (Step RF4),
recorded after the RF4X audit. It follows RF4F. It applies §6 *Source layout*,
ADR 0020 and the RF4X guards.

## What Changes

**domain layout.** `src/index.ts` becomes the only root production module,
with explicit re-exports. Bodies and JSDoc move verbatim into these
directories:

| Directory | Modules | Contents |
|---|---|---|
| `shared/` | `brands.ts` | brands and constructors |
| | `errors.ts` | `DomainErrorCode`, `DomainError` |
| | `failures.ts` | internal failure helpers |
| `access/` | `actors.ts` | |
| | `permissions.ts` | |
| | `errors.ts` | `AccountError`, `AccountErrorCode`, `RateLimitExceededError` (owner decision 2026-11-04) |
| `media/` | `metadata.ts` | |
| `builds/` | `status.ts`, `diagnostics.ts` | moved with `git mv` |
| | `state.ts` | |
| | `export-errors.ts` | |
| `content/` | `routes.ts` | |
| | `blocks.ts` | includes `BlockOrderError` |
| | `collection-queries.ts` | `CollectionQueryValidationError` |
| | `seo.ts` | moved with `git mv` |
| | `entries.ts` | |

- Directory direction: `shared ← access, media, builds ← content`.
- The `index ↔ seo` cycle disappears because `seo.ts` takes `Brand` from
  `shared/brands.ts`.

**auth layout.** `src/index.ts` becomes the only root production module.

| Directory | Modules | Contents |
|---|---|---|
| `shared/` | `trusted-origins.ts`, `client-address.ts` | |
| `session/` | `better-auth.ts` | the Better Auth boundary, route allowlist and resolver types, now in `index.ts` |
| `import/` | `actor.ts` | |
| `mcp/` | `oauth.ts`, `guard.ts`, `actor.ts`, `consent.ts`, `boundary.ts` | |
| | `provider.ts` | new, types only: `McpProvider`, `McpProviderFactory`, `OAuthRequestGuard` |

- Directory direction: `shared ← session, import, mcp`.
- The consent/boundary cycle disappears because both import the provider types
  from `mcp/provider.ts`.

**Guards.**

- `packages/domain` and `packages/auth` join `scripts/source-layout.json`, and
  their entries carry the `// Directory dependencies:` header.
- Their two components leave `scripts/source-cycle-baseline.json`; three
  remain.

**Tests typed and moved (owner decision 2026-11-04).**

- `domain/src/index.test.ts` (681 lines, 23 listed titles) and
  `auth/src/index.test.ts` (169 lines, 4 listed titles) split into companions
  beside their modules, with every title preserved.
- `domain/src/index.type-test.ts` moves beside its module.
- The companions are type-checked: both entries leave
  `scripts/test-typecheck-baseline.json` (139 → 137, after RF4F's 141 → 139). Removing the directive
  today reports 61 errors in domain and 28 in auth, mostly argument and
  assignment fixtures and possibly-undefined access.

**Correction to the earlier audit.** `packages/platform-node/src/client-address.ts`
is not a copy of the auth module. It imports `normalizeClientAddress` from
`@lacecms/auth` and adds only the Node trusted-proxy policy (`node:net`
`BlockList`, `X-Forwarded-For`). There is no duplicate to remove, so the
owner's request to remove it in RF4G has nothing to act on, and the module
stays in platform-node.

## Non-goals

- Any runtime, type or export change. Value export lists, declaration export
  names and `packageName` stay identical, and the existing packaged export
  tests stay unchanged.
- Splitting `platform-*`, `cli`, `sdk`, `render` or `create-lace`. Breaking
  the remaining admin, cli and platform-node cycles.
- Moving error classes between packages, renaming exports, or changing error
  codes. That is RF3E scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving move (`skip_specs: true`). The RF4X
`workspace-governance` requirements already cover the declared layout,
cycle baseline and typecheck baseline that this change updates.

## Impact

- **Roadmap.** Implements the new Session RF4G after RF4F. The roadmap gains
  the session text and the §3 progress. Architecture §6 already describes how
  a package adopts the layout.
- **Code.** `packages/domain/src/**` and `packages/auth/src/**` (moves only).
  `scripts/source-layout.json`, `scripts/source-cycle-baseline.json` and
  `scripts/test-typecheck-baseline.json` change entries only.
- **Consumers.** None change, because all eleven workspace consumers of
  `@lacecms/domain` and the consumers of `@lacecms/auth` import package
  entries.
- **Dependencies.** None added.
