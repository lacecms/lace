## Why

`@lacecms/contracts` keeps every transport schema, DTO type, projector,
tolerant variant and error mapping in one 2,994-line `src/index.ts` (commit
`83c0157d`; the roadmap's 3,014 predates RF3D), the largest baselined file
after the server app and two repositories. Its one leaf module,
`content-model-projection.ts`, imports its types back from `./index.js`, so the
package already has a module cycle. The model schema also accepts block
definition metadata only when it lists the allowed block types in the same
order as the model's `blocks` array. This is Session RF4C of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md) (Step RF4,
module splits). It applies the source layout of architecture §6 *Source layout*
(ADR 0020) and the shrinking size baseline from RF4A, after the RF3 shared
vocabulary and the RF3D error model put each contract definition in one place.

## What Changes

- **Domain directories.** `src/index.ts` becomes the only root production
  module: `packageName`, the existing pass-through re-exports from
  `@lacecms/content` and `@lacecms/domain`, and explicit re-exports of concrete
  modules, with its directory direction stated at the top. Declarations move
  verbatim, JSDoc included, into nine directories that follow the REST
  resource groups: `shared/` (JSON values, transport primitives, revision
  preconditions, URL parsing), `errors/` (envelope, issue mapping,
  classification), `content/` (field and block metadata, models and their
  projection, blocks, SEO, entries, entry requests, entry projectors, internal
  links, collection queries, MCP tool arguments), `media/` (queries, metadata,
  projectors), `delivery/` (public reads, build export, their projectors,
  tolerant variants), `builds/` (site builds, build-site URL), `accounts/`
  (users, email-delivery outcomes, invitations and resets, sessions, OAuth and
  consent), `settings/` (status, credentials) and `openapi/` (field OpenAPI
  descriptors, JSON-schema overrides). The existing leaf modules move with
  `git mv`. Directories depend one way and the module graph is acyclic,
  type-only imports included.
- **Correction to the roadmap text:** the roadmap names seven flat files
  (`content.ts`, `media.ts`, `accounts.ts`, `builds.ts`, `settings.ts`,
  `errors.ts`, `openapi.ts`). Since RF4A, §6 requires domain directories, one
  responsibility per file and no cycles. The content group alone has about
  1,000 lines of declarations, and public delivery, the build export, the
  tolerant variants and the shared primitives fit none of the seven names. The
  session uses directories named after those groups, plus `shared/` and
  `delivery/`, and 36 modules. The largest has about 200 lines.
- **Block definitions match by type.** A content model's
  `blockDefinitions` is accepted when it holds exactly one definition per
  allowed block type, in any order. Previously position *i* had to describe
  `blocks[i]`. Behavior that is no longer accepted: duplicate allowed block
  types alongside definitions, which `defineConfig` already rejects and no
  runtime emits. Every server response is still accepted, because application
  projections emit definitions in `blocks` order.
- **Public surface unchanged otherwise.** Every runtime export key and every
  type export name of `@lacecms/contracts` is identical before and after.
  Helpers that become module exports so sibling modules can import them, such
  as `identifierSchema`, `isJsonObject` and `modelSeoSchema`, are not added to
  the package entry.
- **Tests follow their modules.** `index.test.ts` (79 cases) splits into module
  companions, and two cross-module cases stay at the root. Each case moves with
  only its import paths edited, and any `describe` title shared by cases in
  different files is repeated, so every full case name stays the same.
  `tolerant.test.ts` and `field-openapi.test.ts` move beside their modules, and
  `shared-identifiers.test.ts` splits between the entries and model-projection
  companions. Fixtures used by more than one companion move to
  `src/test-support/`. The 96 baseline cases are preserved, and one case is
  added for type-matched block definitions.
- **Guards and documentation.** The `packages/contracts/src/index.ts` entry
  leaves `scripts/oversized-source-baseline.json` (15 → 14). The shared-vocabulary guard updates its four existing owner paths to the moved definitions without weakening its checks. The roadmap
  records the corrected RF4C text, the baseline rows and the progress row.

Non-goals: any other behavior, message, error code, DTO shape or OpenAPI
output change; renaming declarations; removing the `*Source` interfaces that
mirror application types (a recorded duplication target outside RF4); new
subpath exports; a committed intra-package cycle checker; changes to consumer
packages.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: *Shared versioned content DTOs* states that a model's
  block-definition metadata holds exactly one definition per allowed block
  type, matched by type and independent of order.

The accepted capabilities whose contract code moves (`rest-contracts`
otherwise, `public-sdk` tolerant parsing, `mcp-content-server` tool
arguments, `api-documentation-ui` descriptors, `collection-query-options`,
`internal-url-links`, `account-invitations`, `account-self-service`,
`mcp-oauth-delegation`) keep their requirements unchanged.

## Impact

- Code: `packages/contracts/src` reorganized into nine directories with
  `index.ts` as the only root production module; `hasMatchingBlockDefinitions`
  matches by type; test files split and moved.
- Tooling: one entry removed from `scripts/oversized-source-baseline.json`.
- Documentation: `docs/refactoring-roadmap.md` RF4C text, the §3 baseline
  rows and the progress log.
- Consumers: none at runtime. `server`, `mcp`, `sdk`, `cli`, `astro` and
  `apps/admin` import the package entry, whose runtime keys and type names do
  not change. Root `pnpm typecheck` proves type compatibility. The committed
  OpenAPI document (`pnpm openapi:check`) stays byte-identical.
- Dependencies: none added or removed.
