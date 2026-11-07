## Context

See proposal.md (Why). Measured at commit `ea198c38`:

- **`packages/domain/src`**
  - `index.ts`: 882 lines.
  - `seo.ts`: 168 lines; imports `Brand` from `./index.js`.
  - `build-status.ts`: 112 lines; imports the reason type from
    `build-diagnostics.ts`.
  - `build-diagnostics.ts`: 71 lines.
  - `index.type-test.ts`: 26 lines.
  - `index.test.ts`: 681 lines, 23 listed titles, `@ts-nocheck`.
  - Inside `index.ts`, private helpers (`fail`, `nonEmptyString`, `cloneJson`)
    are shared by brand constructors, block copies and the entry lifecycle.
- **`packages/auth/src`**
  - `index.ts`: 221 lines. It re-exports six modules and defines the Better
    Auth boundary.
  - `mcp-oauth.ts` (235), `mcp-actor.ts` (124), `mcp-boundary.ts` (213),
    `mcp-consent.ts` (358), `oauth-guard.ts` (277), `import-actor.ts` (85),
    `client-address.ts` (37) and `trusted-origins.ts` (13).
  - `index.test.ts`: 169 lines, 4 listed titles, `@ts-nocheck`.
  - Cycle: `mcp-consent.ts` imports the `McpProviderFactory` and `McpProvider`
    types from `mcp-boundary.ts`, which imports `createMcpConsentBoundary`.
- **Exports.** Both packages export only `.`. Their packaged export tests pin
  the runtime export lists.
- **Typing exposure.** Removing the directive reports 61 errors in the domain
  test and 28 in the auth test:
  - TS2345/TS2322: fixtures passed as loose objects or plain strings for
    brands;
  - TS18046/TS18047/TS18048: unknown or possibly-null results;
  - TS7006: untyped callback parameters;
  - TS2739: incomplete fixture objects.

## Goals / Non-Goals

**Goals:**

- Each package follows §6: entry-only root, domain directories, no barrels and
  an acyclic module graph including types. The RF4X layout check enforces it
  through new `scripts/source-layout.json` entries.
- Both legacy cycles and both typecheck exceptions leave their baselines.
- Runtime keys, declaration export names, packaged export tests and every
  listed test title stay identical.

**Non-Goals:**

- See proposal Non-goals: no export, error-code or cross-package moves, and no
  other packages.

## Decisions

### 1. Domain modules and direction

Bodies and JSDoc move verbatim, except imports.

| Module | Moves from `index.ts` |
|---|---|
| `shared/brands.ts` | `Brand`, the eight branded id/time types, their constructors (`actorId` … `unixMilliseconds`) |
| `shared/errors.ts` | `DomainErrorCode`, `DomainError` |
| `shared/failures.ts` | `fail`, `nonEmptyString`, `cloneJson` (internal; not re-exported) |
| `access/actors.ts` | `Role`, `Permission`, `DelegatedAuthority`, `Actor`, `attenuateActor`, `auditActor` |
| `access/permissions.ts` | `defaultRolePermissions`, `permissionsFor`, `hasPermission`, `requirePermission` |
| `access/errors.ts` | `AccountErrorCode`, `AccountError`, `RateLimitExceededError` (owner decision) |
| `media/metadata.ts` | `MediaStatus`, `MediaFocalPoint`, alt/caption limits, `MediaTextKind`, `normalizeMediaText`, `normalizeMediaTag(s)`, `isMediaFocalCoordinate`, `isMediaSha256`, `MediaMetadata` |
| `builds/status.ts` | `git mv build-status.ts` |
| `builds/diagnostics.ts` | `git mv build-diagnostics.ts` |
| `builds/state.ts` | `SiteBuildState`, `PublishedState` |
| `builds/export-errors.ts` | `BuildExportVersionChangedError`, `BuildExportCursorError` |
| `content/routes.ts` | the model route types, `isSingletonKind`, `normalizePagePublicPath`, `normalizeCollectionPublicRoute`, `resolveCollectionPublicPath`, `resolveContentPublicPath`, `contentPublicPath`, `PublishedRoute`, `assertPublicPathAvailable` |
| `content/blocks.ts` | `BLOCK_POSITION_STEP`, `ContentBlock`, `ContentBlockInput`, the block copy helper, `BlockOrderError`, `assertOrderedBlockPositions`, `BlockPositionPlan`, `planBlockPosition`, `normalizeBlockPositions` |
| `content/collection-queries.ts` | `CollectionQueryValidationError` |
| `content/seo.ts` | `git mv seo.ts`; `Brand` from `../shared/brands.js` |
| `content/entries.ts` | snapshot and entry types, `DraftMediaReference`, `CompleteDraftMutation`, `createContentEntry`, `saveCompleteDraft`, `publishContentEntry`, `requirePublishedSnapshot`, `assertEntryCreationAllowed`, `assertCollectionEntryOperation`, `unpublishContentEntry`, `RevertContentDraftInput`, `revertContentDraft`, `requireMutableDraft` |

**Direction:** `shared ← access, media, builds ← content`. Expected edges:

- `access → shared`
- `media → shared`
- `builds → shared`
- `content → shared, access`; snapshots carry `Actor`

`scripts/source-layout.json` lists each directory's allowed set in full. The
measured graph decides whether `content` needs `media` or `builds`. An edge
outside the stated direction stops implementation for a design update.

**Entry.**

- `index.ts` keeps `packageName` and the `LaceError`, `ContentModelKind` and
  `isContentSlug` re-exports from `@lacecms/content`.
- It uses `export *` for modules whose exports are all public, and explicit
  lists elsewhere. `shared/failures.ts` is never re-exported, so the runtime
  key set stays exact.
- A symbol that currently has no `export` (`SnapshotBase`, the block copy and
  failure helpers) stays non-public: it is exported from its module only when
  another module needs it, and never from the entry.

*Alternative:* one `content/` module per lifecycle command. Rejected, because
the commands share snapshot copies and validation and stay well under the
limit together (about 260 lines).

### 2. Auth modules and the cycle fix

| Module | Source |
|---|---|
| `shared/trusted-origins.ts`, `shared/client-address.ts` | `git mv` |
| `session/better-auth.ts` | everything in `index.ts` after the re-exports: `AuthRouteHandler`, `SessionActorResolver`, `PROVIDER_ROUTE_ALLOWLIST`, `BetterAuthBoundary`, `CreateBetterAuthBoundaryInput`, `createBetterAuthBoundary` |
| `import/actor.ts` | `git mv import-actor.ts` |
| `mcp/oauth.ts`, `mcp/guard.ts`, `mcp/actor.ts`, `mcp/consent.ts`, `mcp/boundary.ts` | `git mv` of `mcp-oauth`, `oauth-guard`, `mcp-actor`, `mcp-consent`, `mcp-boundary` |
| `mcp/provider.ts` | new, types only: `McpProvider`, `McpProviderFactory` and `OAuthRequestGuard`, moved verbatim from `mcp-boundary.ts` |

**Cycle fix.** `consent.ts` and `boundary.ts` import the types from
`provider.ts`, and `boundary.ts` keeps creating the consent boundary.

**Direction:** `shared ← session, import, mcp`. Expected edges:

- `session → shared, mcp` (the Better Auth boundary composes the MCP OAuth
  provider and HTTP boundary)
- `import → shared`
- `mcp → shared`

The declaration records the measured set under the same stop rule as
decision 1.

**Entry.** `index.ts` re-exports the same names: `export *` for the modules it
re-exports today, plus `session/better-auth.ts` and `mcp/provider.ts`.
`OAuthRequestGuard` keeps its public name through the new module.

*Alternative:* merge consent into boundary. Rejected, because it creates a
570-line module with two responsibilities.

### 3. Tests

Companions keep their titles.

**domain:**

| Companion | Titles |
|---|---|
| `index.test.ts` | the package identity |
| `access/permissions.test.ts` | the two role-matrix cases |
| `shared/errors.test.ts` | the media-in-use code case |
| `media/metadata.test.ts` | the media-tag case |
| `builds/diagnostics.test.ts` | the diagnostics case |
| `builds/status.test.ts` | the status-lifecycle and tracked-outcome cases |
| `content/routes.test.ts` | page cardinality and paths, route ownership, collection route wording |
| `content/blocks.test.ts` | sparse positions, invalid positions |
| `content/seo.test.ts` | the three SEO normalization cases |
| `content/entries.test.ts` | immutability, unpublish/revert, page deletion, global singleton, invalid lifecycle, SEO and block-envelope preservation |

`index.type-test.ts` moves to `content/entries.type-test.ts` if its
assertions target the entry lifecycle, or to the module it tests, and it stays
in `type-test`/`typecheck`.

**auth:**

| Companion | Titles |
|---|---|
| `index.test.ts` | identity |
| `mcp/oauth.test.ts` | scope normalization and metadata |
| `mcp/actor.test.ts` | the consent-ceiling case |
| `import/actor.test.ts` | the import-token case |

**Typing.** Every companion is strictly checked. Fixes use typed builders
local to each test file and the existing branded constructors. Where a case
deliberately passes malformed input, it narrows through `unknown` with a
comment naming the invariant under test.

- Production code does not change for typing.
- No shared helper is created unless two companions need it; one would go in
  `src/test-support/`, which is always type-checked.
- If any fix would require a production signature change, implementation
  stops and the change is revised.

### 4. Verification baseline

Recorded before moving anything:

- the sorted runtime keys of each built `dist/index.js`;
- the declaration export names of each `dist/index.d.ts`;
- sorted `vitest list` titles of both packages;
- the 11 consumer packages' `typecheck` results.

After the move, all must be identical. Root gates and the RF4X guards must
pass with the two baseline components and two typecheck entries removed.

## Risks / Trade-offs

- **[Re-export cycles through the entry]** A moved module importing
  `../index.js` would recreate the cycle. → The RF4X layout check rejects
  subdirectory imports of the entry.
- **[`export *` exposes a newly exported internal helper]** → The runtime-key
  and declaration-name comparison fails, and `shared/failures.ts` is
  explicitly excluded from the entry.
- **[Typing reveals a real defect in a test fixture]** For example, a test
  that passes for the wrong reason. → Fix the fixture without changing its
  title or assertion intent, and record it in verification. Stop if an
  assertion's meaning would change.
- **[`git mv` history]** → Unchanged files move with `git mv`; split content
  is new files, as in RF4A–RF4E.

## Migration Plan

Repository-only refactor; rollback is a revert. Later sessions see three
remaining cycle components and 137 typecheck exceptions.
