# RF4G verification

## Baseline before moves

Clean `dist/` builds (`turbo run build --force`) of `@lacecms/domain` and `@lacecms/auth` passed with Node 24.22.1 and pnpm 12.3.4 at commit `06ae01c3`. The raw lists were retained in the session scratchpad for comparison, then removed after verification. Declaration export names were resolved through the `export *` and `export {…} from` re-exports of the emitted declaration files.

| Package | Runtime keys | Declaration names | Listed titles | Sorted titles SHA-256 |
|---|---:|---:|---:|---|
| domain | 75 | 120 | 23 | be39edbfd9eae13a5d18e5e3e3828794d4d2a95fb851cae11a3015da38e5c172 |
| auth | 25 | 37 | 4 | 255b9da3e1bcf5a4a56263a101188aaa5245ba062e0885ae0cee0514fc6d6df0 |

```json
{
  "packages/domain": {
    "runtime": [
      "AccountError", "BLOCK_POSITION_STEP", "BUILD_SOURCE_PATH_PATTERN", "BlockOrderError",
      "BuildExportCursorError", "BuildExportVersionChangedError", "CollectionQueryValidationError",
      "DomainError", "LaceError", "MAX_MEDIA_ALT_LENGTH", "MAX_MEDIA_CAPTION_LENGTH",
      "MAX_SEO_CANONICAL_LENGTH", "MAX_SEO_DESCRIPTION_LENGTH", "MAX_SEO_TITLE_LENGTH",
      "RateLimitExceededError", "actorId", "assertCollectionEntryOperation",
      "assertEntryCreationAllowed", "assertOrderedBlockPositions", "assertPublicPathAvailable",
      "attenuateActor", "auditActor", "blockKey", "cloneEntrySeo", "contentEntryId",
      "contentModelKey", "contentPublicPath", "contentSnapshotId", "createContentEntry",
      "defaultRolePermissions", "hasPermission", "isCanonicalUrl", "isContentSlug",
      "isMediaFocalCoordinate", "isMediaSha256", "isRetryableSiteBuildStatus", "isSingletonKind",
      "isSiteBuildProviderStage", "isSiteBuildStatus", "isTerminalSiteBuildStatus", "mediaId",
      "normalizeBlockPositions", "normalizeBuildFailure", "normalizeCollectionPublicRoute",
      "normalizeEntrySeo", "normalizeMediaTag", "normalizeMediaTags", "normalizeMediaText",
      "normalizePagePublicPath", "normalizeSeoText", "normalizeTrackedOutcomeReason", "packageName",
      "permissionsFor", "planBlockPosition", "publishContentEntry", "requireMutableDraft",
      "requirePermission", "requirePublishedSnapshot", "resolveCollectionPublicPath",
      "resolveContentPublicPath", "retryableSiteBuildStatuses", "revertContentDraft",
      "safeBuildSourcePath", "saveCompleteDraft", "siteBuildFailureReasons", "siteBuildId",
      "siteBuildProviderStages", "siteBuildStatuses", "siteBuildTrackingPolicy",
      "sourceFailureReasons", "terminalSiteBuildStatuses", "trackedOutcomeReasons",
      "trackedSiteBuildOutcomes", "unixMilliseconds", "unpublishContentEntry"
    ],
    "declarationsBeyondRuntime": [
      "AccountErrorCode", "Actor", "ActorId", "BlockKey", "BlockPositionPlan", "Brand",
      "CollectionContentModelRoute", "CompleteDraftMutation", "ContentBlock", "ContentBlockInput",
      "ContentEntry", "ContentEntryId", "ContentModelKey", "ContentModelKind", "ContentModelRoute",
      "ContentSnapshot", "ContentSnapshotId", "DelegatedAuthority", "DomainErrorCode",
      "DraftMediaReference", "DraftSnapshot", "EntrySeo", "GlobalContentModelRoute",
      "MediaFocalPoint", "MediaId", "MediaMetadata", "MediaStatus", "MediaTextKind",
      "PageContentModelRoute", "Permission", "PublishContentEntryInput", "PublishedRoute",
      "PublishedSnapshot", "PublishedState", "RevertContentDraftInput", "Role",
      "RoutableContentModelRoute", "SeoTextKind", "SiteBuildFailureReason", "SiteBuildId",
      "SiteBuildProviderStage", "SiteBuildState", "SiteBuildStatus", "TrackedSiteBuildOutcome",
      "UnixMilliseconds"
    ]
  },
  "packages/auth": {
    "runtime": [
      "MCP_DISCOVERY_PATHS", "MCP_OAUTH_ROUTE_ALLOWLIST", "MCP_OAUTH_SCOPES",
      "MCP_REGISTRATION_MAX_BYTES", "PROVIDER_ROUTE_ALLOWLIST", "TrustedClientAddresses",
      "createBetterAuthBoundary", "createImportActorResolver", "createMcpActorResolver",
      "createMcpOAuthHttpBoundary", "createMcpOAuthProvider", "createOAuthRequestGuard",
      "importTokenAuthority", "isMcpOAuthRoute", "mcpAuthorizationMetadata", "mcpOAuthUrls",
      "mcpResourceMetadata", "normalizeClientAddress", "normalizeMcpClientRegistration",
      "normalizeMcpScopes", "oauthCredentialHash", "oauthFailure", "packageName", "readOAuthBody",
      "safeOAuthResponse"
    ],
    "declarationsBeyondRuntime": [
      "AuthRouteHandler", "BetterAuthBoundary", "CreateBetterAuthBoundaryInput",
      "ImportActorResolution", "McpActorResolution", "McpOAuthHttpBoundary",
      "McpOAuthProviderInput", "McpProvider", "McpProviderFactory", "OAuthRequestGuard",
      "OAuthRequestGuardInput", "SessionActorResolver"
    ]
  }
}
```

Every runtime key is also a declaration name, so each package's declaration list is its runtime list plus `declarationsBeyondRuntime`.

Listed titles (sorted; `test.each` lists its template once):

- **domain (23):** accepts only absolute http and https canonical URLs · allows an entry to retain its route while rejecting a different route owner · build diagnostics preserve known reasons and reject unsafe paths · carries the stable media-in-use code for referenced-media refusals · collection route failures use the shared parameter wording · derives each role's permissions from the same frozen policy · enforces page cardinality and resolves public collection paths safely · exports its package identity · keeps published data immutable and isolated from later complete draft saves · normalizes SEO groups and clears empty values · normalizes only ASCII media tags with stable limits and ordering · plans sparse positions and preserves order when normalizing them · publication and revert preserve block envelopes and complete legacy blocks · publication and revert preserve the SEO group · refuses page deletion and duplication · rejects an invalid committed lifecycle · rejects invalid SEO values with JSON pointers under /seo · rejects invalid position %s with bounded ordering diagnostics · site-build statuses form one closed lifecycle with explicit terminal and retry sets · tracked outcomes keep only their own closed reasons and stages are closed · treats a global as a route-less singleton · unpublishes and reverts against the current publication · uses the complete default role-to-permission matrix
- **auth (4):** exports its package identity · import tokens resolve the creator's current role under a write-only ceiling · publication scopes normalize in canonical order and both metadata documents advertise them · publication tokens intersect the consent ceiling and current role

Guard baselines before moves:

- `scripts/source-cycle-baseline.json`: `["packages/auth/src/mcp-boundary.ts", "packages/auth/src/mcp-consent.ts"]` and `["packages/domain/src/index.ts", "packages/domain/src/seo.ts"]` (5 components in total).
- `scripts/test-typecheck-baseline.json`: `packages/auth/src/index.test.ts` and `packages/domain/src/index.test.ts` (139 entries in total; RF4F already removed two after this proposal was written).

## Implementation checks

- **domain.** `src/index.ts` is the only root production module (header `shared ← access, media, builds ← content`). Bodies and JSDoc were cut verbatim by line range from the original entry; a script asserted that every non-blank original line landed in exactly one module or stayed in the entry. Only imports changed, plus `export` on `fail`, `cloneJson` (`shared/failures.ts`) and `cloneBlock` (`content/blocks.ts`), which other modules now import; none is re-exported, and `content/blocks.ts` is re-exported through an explicit list. `build-status.ts`, `build-diagnostics.ts`, `seo.ts` and `index.type-test.ts` moved with `git mv`. Largest module: `content/entries.ts`, 305 lines.
- **Deviation from design decision 1.** `nonEmptyString` stays private in `shared/brands.ts` instead of `shared/failures.ts`: it returns `Brand`, and brands import `fail`, so placing it in `failures.ts` would create a `brands ↔ failures` type cycle. Its only callers are the brand constructors.
- **Measured directory edges.** domain: `access → shared`, `media → shared`, `builds → shared`, `content → access, shared` (as designed). auth: `import → shared`, `session → mcp, shared`; `mcp` imports nothing from `shared/`, so its declared set is empty and the entry header reads `shared ← import, session; mcp ← session`. Both are within the stated direction.
- **auth.** Eight modules moved with `git mv`; `mcp/provider.ts` holds `OAuthRequestGuard`, `McpProvider` and `McpProviderFactory` verbatim, and `consent.ts` and `boundary.ts` import them from it. The Better Auth boundary moved verbatim from `index.ts` to `session/better-auth.ts`. Largest module: `mcp/consent.ts`, 358 lines.
- **Guards.** Both packages are declared in `scripts/source-layout.json` (nine packages); `scripts/source-cycle-baseline.json` keeps three components (admin `entities/content`, `cli`, `platform-node`); `scripts/test-typecheck-baseline.json` has 137 entries. `node scripts/check-boundaries.mjs` passes.
- **Exports.** After rebuilding from clean `dist/`, runtime keys and declaration names of both packages are byte-identical to the baseline JSON.
- **Tests.** domain: ten companions (28 cases), `shared/brands.type-test.ts` included through `tsconfig.type-test.json` (`src/**/*.type-test.ts`). auth: four companions (4 cases). Sorted listed titles equal the baseline hashes; no companion carries `@ts-nocheck`; each package has a typed `src/test-support/assertions.ts` (`present`, plus domain `expectDomainError`), used by four and two companions. Typing fixes: complete `OAuthGrant`/`OAuthAuthority` and `ImportTokenMetadata` fixtures; a `Pick`-typed persistence fake (the resolver reads only `authority`); a generic `findOne` fake; legacy blocks typed through `ContentBlockInput` because the lifecycle completes omitted envelope values; `mediaReferences: []` added to draft mutations (the domain does not read it); the caller-mutation case mutates its own `fields` object passed into the draft; the published-as-draft case narrows through `unknown` with a comment. No assertion changed meaning and no production file changed for typing.
- **Consumers.** `turbo run typecheck --filter=...@lacecms/domain` passed (38 tasks, 22 packages); `test:packaged` for both packages passed; `pnpm compat:mcp` passed (12 files, 228 cases). Two root tests pinned old internal paths and were updated: `tests/builder-diagnostics.test.mjs` imports `packages/domain/dist/builds/diagnostics.js`, and `tests/shared-vocabulary.test.mjs` names `packages/domain/src/access/errors.ts` as the owner of `AccountError` and `RateLimitExceededError`. The first root test run failed on exactly these two files; the rerun passed.
- **Correction.** The test-typecheck baseline was already 139 when this change was applied (RF4F archived first), so this change takes it 139 → 137; proposal, design and task 5.2 were corrected.
- **Root gates** (Node 24.22.1, pnpm 12.3.4): `pnpm typecheck` (38 Turbo tasks), `pnpm lint` (22), `pnpm format:check`, `pnpm test` (64 Turbo tasks; 35 root files / 316 cases), the docs link guard and `openspec validate rf04g-domain-auth-layout --type change --strict` passed.
