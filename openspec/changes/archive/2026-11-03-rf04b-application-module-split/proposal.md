## Why

`@lacecms/application` keeps every capability port, brand, limit and
authorization helper in a 1,211-line `index.ts`, and three of its production
files are in the oversized-source baseline (`index.ts` 1,211,
`configuration-sync.ts` 1,836, `content-use-cases.ts` 1,015 at commit
`b179d896`). Every use-case module imports its ports back from `./index.js`,
which re-exports those same modules, and the five `configuration-*` files
import each other's types in both directions, so the package has type-only and
runtime module cycles. `SecurityService` (28 own and inherited command methods
plus the profile read) is one interface that every security consumer must
accept whole. This is Session RF4B of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md) (Step RF4,
module splits); RF4A established the source layout (architecture §6
*Source layout*, ADR 0020) and the shrinking size baseline this session
applies to `application`.

## What Changes

- **Domain directories.** `src/index.ts` becomes the only root module, an
  explicit re-export entry with its directory direction stated at the top.
  Modules move, bodies and JSDoc verbatim, into `shared/` (brands, cursor
  pages, limits, actor display, text folding, permission helpers), `ports/`
  (`infrastructure`, `content`, `links`, `media`, `builds`, `security`),
  and the sibling use-case directories `content/`, `media/`, `accounts/`,
  `builds/`, `outbox/` and `configuration/`. Directories depend one way:
  `shared ← ports ← {content, media, accounts, builds, outbox,
  configuration}`; use-case directories do not import each other, and the
  module graph is acyclic, type-only imports included.
- **Ports by capability.** The port declarations of `index.ts` move to
  `ports/*`. Types that today close a loop through a use-case module move
  down with them: the account record and result types and
  `UserProfileReader` (from `accounts.ts`/`email.ts`), the internal-link port
  vocabulary (from `internal-links.ts`), and the resolved collection-query
  shape (from `collection-queries.ts`). Ports declared next to their only use
  case (`MediaDraftDetachPort`, OAuth persistence ports, configuration-sync
  ports) stay with it.
- **Security port split.** `SecurityService` is split into
  `AccountSecurityPort` (setup completion and bootstrap, user directory,
  invitations, password resets, profile and password changes),
  `SessionSecurityPort` (session listing and deletion) and
  `TokenSecurityPort` (setup, build and import credentials).
  `SecurityService` remains the name runtimes implement and extends
  `UserProfileReader` and the three ports, so its resolved member set is
  unchanged. **BREAKING (type-level, workspace-internal):** the exported
  `AccountSecurityPort` loses its four session methods to
  `SessionSecurityPort` and gains the five setup and user-directory methods;
  no workspace member references it outside `application`.
  `AccountUseCasesInput.security` narrows to the ports `AccountUseCases`
  calls, which every existing caller still satisfies.
- **Configuration cluster.** `configuration/types.ts` takes every plan,
  change, evidence, migration and port type shared by the cluster (breaking
  all type-only cycles), and `configuration/limits.ts` its page-size and
  snapshot constants. `configuration-sync.ts` splits into `plan-support.ts`,
  `decisions.ts`, `plan.ts`, `report.ts` and `apply.ts`; `evolution`,
  `migration`, `fields` and `links` move beside them. `decideEvolution`
  (362 lines) becomes a fixed precedence prelude plus a decision table keyed
  by `StructuralChange.kind`, with identical diagnostics, order and output.
- **Correction to the roadmap text:** `content-use-cases.ts` (1,015 lines) is
  also baselined and must leave the baseline in this session (RF4
  acceptance). It splits into `content/use-case-inputs.ts`,
  `content/draft-normalization.ts` and `content/use-cases.ts`;
  `withPublishedProjection`/`publishedProjectionBlockData` move from
  `index.ts` to `content/published-projection.ts`.
- **Public surface unchanged otherwise.** Every runtime export key and every
  type export name of `@lacecms/application` is identical; the new
  `SessionSecurityPort` and `TokenSecurityPort` are the only added names.
- **Tests follow their modules.** The 18 test files move beside their
  modules with path-only import edits (`./index.js` → `../index.js`); case
  titles, bodies and the 131 listed cases are unchanged. `index.test.ts` and
  `packaged-exports.packaged.test.mjs` stay at the root as package-level
  tests; the packaged runtime-key list does not change because both new
  names are type-only.
- **Guards and documentation.** The three application entries leave
  `scripts/oversized-source-baseline.json`; architecture §15 *Infrastructure
  ports* is rewritten from the real interfaces (it shows a `ReadableStream`
  object read and a `Cache.set` options argument that do not exist); the
  roadmap records the corrections and the progress row.

Non-goals: any behavior, message, error code, DTO or runtime export change;
renaming declarations other than the port split; narrowing
`SecurityService` consumers outside `application` (`auth`, `server`,
`test-utils`, platforms keep their imports); splitting `media/use-cases.ts`
(703 lines) or the 1,369-line `configuration-evolution.test.ts`; a committed
intra-package cycle checker; repairing the stale `.test.mjs` paths in
`scripts/security-resilience-verification.mjs` (pre-existing since RF2,
outside this package's move).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `application-ports-and-commands`: the portable security lifecycle
  requirement additionally states that the security contract is offered as
  separate account, session and token capability ports whose combination is
  the runtime security service, so use cases depend only on the ports they
  call.

The accepted capabilities whose code moves (`content-use-cases`,
`media-use-cases`, `configuration-synchronization`, `schema-evolution`,
`site-build-dispatch`, `outbox-dispatch`, `email-delivery`,
`account-invitations`, `password-recovery`, `account-self-service`,
`mcp-oauth-delegation`, `collection-query-options`, `internal-url-links`)
keep their requirements unchanged.

## Impact

- Code: `packages/application/src` reorganized into eight directories with
  `index.ts` as the only root production module; `SecurityService` composed
  from three ports; `decideEvolution` table-driven; test files moved.
- Tooling: three entries removed from `scripts/oversized-source-baseline.json`.
- Documentation: `docs/mvp-architecture.md` §15, `docs/refactoring-roadmap.md`
  RF4B text, baseline table and progress log.
- Consumers: none at runtime. Workspace members import the package entry,
  whose runtime keys and type names do not change; root `pnpm typecheck`
  proves type compatibility, including `NodeSecurityService` and
  `D1SecurityService` still implementing `SecurityService`.
- Dependencies: none added or removed.
