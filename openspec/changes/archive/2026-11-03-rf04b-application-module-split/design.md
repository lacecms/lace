## Context

See proposal.md for motivation. Facts at commit `b179d896`:

- `packages/application/src` is flat: 19 production modules and 18 test
  files. Production files above 1,000 lines, all in the size baseline:
  `index.ts` (1,211), `configuration-sync.ts` (1,836),
  `content-use-cases.ts` (1,015). Next largest: `configuration-evolution.ts`
  958, `media-use-cases.ts` 703, `accounts.ts` 605.
- `index.ts` declares, in order: brands and their constructors (59–104),
  `CursorPage` (105), entry statuses and sorts (111–141), actor display names
  and `foldAscii` (143–165), content read/command ports with
  `withPublishedProjection`/`publishedProjectionBlockData` (166–418), the
  build-export page budget, types and `selectBuildExportPage`/
  `assertBuildExportPageSize` (419–482), `PublicContentReadPort` (483),
  object storage and image inspection (499–541), logger and cache (542–556),
  build ports (558–715), clock, ids, token hasher (717–730), security records,
  import-token limits and helpers (731–818), `SecurityService` (819–877),
  rate limiting (879–908), permission helpers (910–928, 1204), dispatcher
  outbox types, timing and retry policy (929–1015), media ports (1017–1198).
  It also re-exports every other module with `export *`, plus names from
  `@lacecms/content` and `@lacecms/domain`.
- Every use-case module imports its ports from `./index.js`; `index.ts`
  imports types back from `accounts.ts` (`AccountSecurityPort`), `email.ts`
  (`UserProfileReader`), `internal-links.ts` (`LinkImpactAcknowledgment`)
  and `collection-queries.ts` (`ResolvedCollectionQuery`). Configuration
  cycles: `configuration-sync ↔ configuration-links` (runtime one way, types
  back), `configuration-sync ↔ configuration-evolution`,
  `configuration-evolution ↔ configuration-migration` (constant one way,
  types back), `configuration-evolution ↔ configuration-fields`, and
  `configuration-fields → configuration-sync` (types).
- `SecurityService extends UserProfileReader, AccountSecurityPort` and
  declares 14 more methods: setup (3), user directory (3), build tokens (4),
  import tokens (4). `AccountSecurityPort` (in `accounts.ts`) declares 14:
  invitations (6), resets (2), display name, password, sessions (4).
  `NodeSecurityService` and `D1SecurityService` implement `SecurityService`;
  `server`, `test-utils` and `auth` consume it (`auth` through
  `Pick<SecurityService, "resolveImportToken">`). No member outside
  `application` references `AccountSecurityPort`. `AccountUseCases` calls
  `readUserProfile` and the 14 `AccountSecurityPort` methods only.
- `decideEvolution` (`configuration-sync.ts` 526–887) is one loop whose body
  is an `if/else` chain: `field-type-changed` always refuses; a `breaking`
  `route-changed` refuses only with published entries; any other `breaking`
  change refuses as unsupported; then `field-renamed`, `field-removed`,
  `seo-disabled`, `block-type-removed` and `block-definition-changed` have
  kind-specific branches. Three class/kind-independent passes follow for
  every change: visibility-prune counts, `validated` constraint checks and
  backfills, then the decided change is frozen.
- `vitest list` reports 131 cases in 18 files. The shared Vitest config and
  `tsconfig.test.json` include `src/**/*.test.ts`, so subdirectories need no
  configuration change. `packaged-exports.packaged.test.mjs` pins the
  runtime export keys of `dist/index.js`.

## Goals / Non-Goals

**Goals:**

- `index.ts` is the only root production module; every other module is in a
  domain directory, under 1,000 lines, with one concern.
- The module graph is acyclic, type-only imports included, and directories
  follow `shared ← ports ← use-case directories`.
- Runtime export keys and type export names are identical, except the two
  added port names; bodies and JSDoc move verbatim apart from the decisions
  below.

**Non-Goals:**

- Narrowing security consumers outside `application`.
- Re-splitting modules already under the limit (`media/use-cases.ts`,
  `accounts/use-cases.ts`) or test files.
- A committed intra-package cycle checker (verified by a scratch script, as
  in RF4A).

## Decisions

1. **Layout.** Directories bottom-up; a module imports only from lower
   directories, from earlier rows of its own directory, or from other
   packages. Use-case directories (`content`, `media`, `accounts`, `builds`,
   `outbox`, `configuration`) never import each other.

   | Module | Contents (source) | ≈ lines |
   | --- | --- | ---: |
   | `shared/brands.ts` | `Opaque*`, `Dispatcher*Id`, `Publication*` brands, `opaqueBrand`, constructors (index 59–104) | 50 |
   | `shared/pagination.ts` | `CursorPage` (index 105) | 10 |
   | `shared/limits.ts` | `BUILD_EXPORT_PAGE_BYTE_BUDGET`, import-token lifetime and use-record interval, `DISPATCHER_LEASE_DURATION_MS`, `SITE_BUILD_DEBOUNCE_MS`, the `MAX_*` re-exports from `@lacecms/content` | 40 |
   | `shared/actors.ts` | system/unknown display names, `ActorSummary`, `actorDisplayName` | 25 |
   | `shared/text.ts` | `foldAscii` | 10 |
   | `shared/permissions.ts` | `requireUsersManager`, `requireSettingsManager`, `actorPermissions`, `effectiveActorPermissions`, `requireContentReader` | 35 |
   | `ports/infrastructure.ts` | `Clock`, `IdGenerator`, `Cache`, `OperationalLogger`, `OperationalError`, dispatcher event, lease, claim/complete/retry inputs, `DispatcherLeasePort`, `DispatcherRetryPolicy` | 110 |
   | `ports/links.ts` | internal-link port vocabulary from `internal-links.ts` (`LinkImpactAction` … `ContentLinkReadPort`) | 100 |
   | `ports/content.ts` | entry statuses and sorts, summaries, list/load inputs, collection-query shape (`CollectionQueryFieldType`, `CollectionQueryField`, `CollectionFieldFilter`, `ResolvedCollectionQuery` from `collection-queries.ts`), read and command ports, `PublishedProjection`, idempotency, command results, public reads, build-export page types, `PublicContentReadPort` | 400 |
   | `ports/media.ts` | object storage, `ByteStream`, `MediaMimeType`, image inspection, media read/list/catalog/command ports and inputs, `MediaDeletionDispatchPort` | 260 |
   | `ports/builds.ts` | build request, trigger, queue, command, record, read, work lease, dispatch, tracked check, provider observation and reader | 165 |
   | `ports/security.ts` | `SecurityRole`, `ManagedUser`, build/import token types, account record and result types (from `accounts.ts`), `UserProfileReader` (from `email.ts`), `OpaqueTokenHasher`, `AccountSecurityPort`, `SessionSecurityPort`, `TokenSecurityPort`, `SecurityService`, rate-limit types | 330 |
   | `content/authority.ts` | `content-authority.ts` unchanged | 46 |
   | `content/collection-queries.ts` | `collection-queries.ts` minus the moved types | 200 |
   | `content/internal-links.ts` | `internal-links.ts` minus the moved port vocabulary | 165 |
   | `content/published-projection.ts` | `withPublishedProjection`, `publishedProjectionBlockData` | 45 |
   | `content/use-case-inputs.ts` | `ContentUseCaseDependencies` … `UnpublishContentEntryUseCaseResult` (content-use-cases 105–249) | 150 |
   | `content/draft-normalization.ts` | `duplicateTitle`, `contentModelRoute`, `normalizeDraftCandidate`, their types and private helpers (250–383) | 140 |
   | `content/use-cases.ts` | `ContentUseCases` and its class-only helpers (384–1015) | 640 |
   | `media/image-container.ts` | `image-container.ts` unchanged | 433 |
   | `media/use-cases.ts` | `media-use-cases.ts` unchanged | 703 |
   | `accounts/email.ts` | `email.ts` minus `UserProfileReader` | 195 |
   | `accounts/use-cases.ts` | `accounts.ts` minus the moved port and record types | 490 |
   | `accounts/import-tokens.ts` | `importTokenCapabilities`, `importTokenExpiry` | 25 |
   | `accounts/oauth.ts` | `oauth.ts` unchanged | 112 |
   | `builds/export-pages.ts` | `selectBuildExportPage`, `assertBuildExportPageSize` | 30 |
   | `builds/use-cases.ts` | `site-build-use-cases.ts` unchanged | 38 |
   | `builds/tracker.ts` | `site-build-tracker.ts` unchanged | 151 |
   | `outbox/retry-policy.ts` | default and site-build retry policies, `dispatcherRetryDelay` | 40 |
   | `outbox/dispatchers.ts` | `dispatchers.ts` unchanged | 249 |
   | `configuration/limits.ts` | the four `CONFIGURATION_SYNC_*` constants | 15 |
   | `configuration/types.ts` | structural-change, hint, evidence and scan types (evolution 26–200), migration target/snapshot/finding/evidence types (migration 31–152), plan/change/operation/diagnostic/report/port types (sync 70–355), `ConfigurationSyncLinkRewrite` (named by the apply input at sync 301) | 600 |
   | `configuration/fields.ts` | `configuration-fields.ts` unchanged except imports | 341 |
   | `configuration/evolution.ts` | `configuration-evolution.ts` minus types and constants | 750 |
   | `configuration/migration.ts` | `configuration-migration.ts` minus shared types and constants; `MigrationBudgetContext` stays | 390 |
   | `configuration/links.ts` | `configuration-links.ts` minus its rewrite type | 80 |
   | `configuration/plan-support.ts` | `contentSyncActor`, model copies, `reportedStoredModel`, `diagnostic` and `DiagnosticDetails`, comparators, snapshot counts and descriptions, `incompatible`, `undecidedChange` (sync 356–509) | 160 |
   | `configuration/decisions.ts` | `PlanningContext`, `DecidedEvolution`, `decideEvolution` (decision 5), `versionedBlockChange`, `decideBlockMigration` (sync 511–942) | 450 |
   | `configuration/plan.ts` | baseline and projection checks, `classifyMatchedModel`, `planWithContext`, the exported plan, scan, backfill, content-write, baseline, public-state and check functions, `ConfigurationSyncSnapshotRewrite` (sync 943–1336) | 400 |
   | `configuration/report.ts` | plan JSON/text rendering and `reportConfigurationSynchronization` (sync 1337–1443) | 110 |
   | `configuration/apply.ts` | registry checks, scans, `prepareConfigurationSynchronization`, singleton entries, migration summary, block migrations and `applyPreparedConfigurationSynchronization` (sync 1444–1836) | 400 |
   | `index.ts` | re-exports only, `packageName`, the `@lacecms/domain`/`@lacecms/content` pass-through re-exports | 260 |

   File names do not repeat their directory. A helper used by one module
   moves with it; a helper used by several becomes an exported module member
   that the entry does not re-export (decision 3). Exact imports follow what
   the moved bodies reference; the direction and acyclicity rules, not a
   per-module import list, are the requirement. `index.ts` keeps
   `packageName` because the package identity test asserts it there.

2. **Types that close loops move down to `ports/`.** The four back edges
   into `index.ts` exist because port signatures use types declared in
   use-case modules. Moving those types (account records and results,
   `UserProfileReader`, the link vocabulary, the resolved query shape) into
   `ports/*` removes every edge from `ports/` to a use-case directory; the
   modules they left import them back. Alternative rejected: placing
   `collection-queries` and `internal-links` below `ports/` — they hold
   content-specific runtime policy and would pull `content/authority.ts`
   down with them. Ports that only one use case consumes stay beside it
   (`MediaDraftDetachPort`, OAuth persistence ports, configuration-sync
   ports in `configuration/types.ts`), because no lower module needs them.

3. **No subdirectory barrels; explicit entry lists.** As in RF4A,
   `index.ts` re-exports concrete files, one commented group per directory,
   with `// Directory dependencies: shared ← ports ← content, media,
   accounts, builds, outbox, configuration.` as its first line. Modules whose
   whole content is public keep `export *`; modules that now export internal
   helpers (`plan-support.ts`, `decisions.ts`, `draft-normalization.ts`
   helpers used by `use-cases.ts`, the configuration modules that lose
   types) are re-exported by explicit name lists. The packaged
   runtime-key test and a declaration-name comparison (decision 8) prove the
   entry lists are complete and add nothing internal.

4. **Security port split.** `ports/security.ts` declares, with the existing
   member JSDoc moved verbatim:

   - `AccountSecurityPort`: `isSetupComplete`, `bootstrap`, `listUsers`,
     `updateUser`, `disableUser`, the six invitation methods,
     `issuePasswordReset`, `confirmPasswordReset`, `updateDisplayName`,
     `changePassword` (15);
   - `SessionSecurityPort`: `listSessions`, `deleteSession`,
     `deleteOtherSessions`, `deleteUserSessions` (4);
   - `TokenSecurityPort`: `createSetupToken`, the four build-token and four
     import-token methods (9);
   - `SecurityService extends UserProfileReader, AccountSecurityPort,
     SessionSecurityPort, TokenSecurityPort {}` with its existing JSDoc.

   The combined member set equals today's, so both adapters, `server`,
   `test-utils` and `auth` compile unchanged. `createSetupToken` joins the
   token port because it issues a credential like the build and import
   methods; `bootstrap`, which consumes it, is an account lifecycle command.
   `AccountUseCasesInput.security` becomes `UserProfileReader &
   AccountSecurityPort & SessionSecurityPort` (the methods it calls), which
   every caller passing a `SecurityService` still satisfies.
   Alternatives rejected: keeping `AccountSecurityPort` members as they are
   and adding setup/user ports — five ports instead of the roadmap's three,
   with `AccountUseCases` still needing sessions from a port named for
   accounts; and leaving `SecurityService` as a flat 28-method interface —
   the roadmap's point is that consumers can name the capability they use.

5. **`decideEvolution` as prelude plus kind table.** The per-change body
   keeps its order of effects:

   1. a precedence prelude that runs before any kind handler and mirrors the
      first three branches exactly: `field-type-changed` refuses; a
      `breaking` `route-changed` refuses only when entries are published; any
      other `breaking` change refuses as unsupported and skips the kind
      handler;
   2. `kindDecisions: Readonly<Partial<Record<StructuralChangeKind,
      KindDecision>>>` with one handler each for `field-renamed`,
      `field-removed`, `seo-disabled`, `block-type-removed` and
      `block-definition-changed`; other kinds have no entry and decide
      nothing, as today;
   3. the unchanged shared passes (visibility-prune counts, `validated`
      constraint check, backfill), then the frozen decided change.

   A `KindDecision` receives the change, the model key, the evidence and a
   mutable per-model accumulator (`refuse`, `renames`, `fieldRemovals`,
   `blockRemovals`, `blockMigrations`, `seoRemoval`) and returns the
   `affected` counts and optional `migration` it determined. Diagnostic
   codes, messages, details, push order and result freezing are unchanged;
   the existing configuration-sync, evolution, migration and visibility
   tests are the behavioral oracle. The table is typed with
   `StructuralChangeKind` keys so a misspelled kind fails typecheck.
   Alternative rejected: a full `Record` with a handler for every kind and
   the breaking checks inside each — it duplicates the class precedence in
   five handlers and makes the order of refusals depend on the table.

6. **Verbatim moves, bottom-up, one directory per step.** Each step moves its
   modules with `git mv` where a file keeps most of its content, adds the
   imports the bodies need, updates the entry, and runs the package suite
   before the next step. Non-move edits are limited to: import lines,
   `export` keywords on helpers of decision 3, the security port split
   (decision 4), the `decideEvolution` table (decision 5), the narrowed
   `AccountUseCasesInput.security`, and the entry header. No identifier is
   renamed.

7. **Tests move with their modules, path-only edits.** Test bodies and titles
   are unchanged; imports of `./index.js` become `../index.js` (the tests
   assert the package surface, as the RF2B split intended), and
   `field-filter-capabilities.test.ts` keeps its direct
   `./collection-queries.js` import.

   | Destination | Source |
   | --- | --- |
   | `index.test.ts`, `packaged-exports.packaged.test.mjs` | stay at the root (package-level) |
   | `content/authority.test.ts` | `content-authority.test.ts` |
   | `content/collection-queries.test.ts`, `content/field-filter-capabilities.test.ts`, `content/internal-links.test.ts`, `content/draft-normalization.test.ts`, `content/conditional-publication.test.ts` | same names at the root |
   | `media/use-cases.test.ts`, `media/image-container.test.ts` | `media-use-cases.test.ts`, `image-container.test.ts` |
   | `accounts/use-cases.test.ts`, `accounts/email.test.ts`, `accounts/import-tokens.test.ts` | `accounts.test.ts`, `email.test.ts`, `import-tokens.test.ts` |
   | `builds/site-build.test.ts`, `builds/export-pages.test.ts` | `site-build.test.ts`, `build-export.test.ts` |
   | `configuration/plan.test.ts`, `configuration/evolution.test.ts`, `configuration/migration.test.ts`, `configuration/visibility.test.ts` | `configuration-sync.test.ts`, `configuration-evolution.test.ts`, `configuration-migration.test.ts`, `configuration-visibility.test.ts` |

   `site-build.test.ts` spans use cases, dispatcher and tracker, and
   `conditional-publication.test.ts`/`visibility.test.ts` span several
   modules; each goes to the directory owning its first assertion.
   `vitest list` before and after must report the same 131 titles.

8. **Compatibility and acyclicity checks.** Before the first move, a scratch
   script builds the package and records every export name of
   `dist/index.d.ts` with its meaning (value, type or both) through the
   TypeScript checker, plus the `Object.keys` of `dist/index.js`. After the
   last move it must print the same list plus exactly `SessionSecurityPort`
   and `TokenSecurityPort` (types). A second scratch script reads every
   relative specifier, including `import type`, of the non-test modules,
   reports module cycles and any edge from `shared/` upward, from `ports/`
   to a use-case directory, or between use-case directories, and must
   report none. Results go to `verification.md`; scripts stay in the
   scratchpad, as in RF4A.

9. **Security port type assertions.** A type-only
   `src/ports/security.type-test.ts`, added to `tsconfig.test.json`'s
   `include`, asserts that the keys of `SecurityService` equal the union of
   the four component interfaces, that the three ports are pairwise
   disjoint, and that `new AccountUseCases({...})` accepts a value typed as
   `UserProfileReader & AccountSecurityPort & SessionSecurityPort`. It
   compiles under the package `typecheck` and adds no runtime case, so the
   131-case count holds. Alternative rejected: a runtime test — it would
   change the case count and could not observe type-level membership.

10. **Size baseline and documentation.** The three `packages/application`
    entries leave `scripts/oversized-source-baseline.json` in the step that
    splits each file, so the boundary check passes after every step.
    Architecture §15 is rewritten from the real interfaces: it names the six
    port modules, shows `ObjectStorage` (`get` returns `ByteStream`),
    `Cache` (`get`/`set`/`delete`, no options), `SiteBuildTrigger`,
    `EmailSender`, `Clock`, `IdGenerator` and the dispatcher lease port as
    declared, and states that security is three capability ports combined
    by `SecurityService`; the implementations table and email prose stay.
    The roadmap RF4B text records the corrections (content use cases,
    port membership, the table design), its baseline table drops the
    `configuration-sync.ts` size row in favor of the measured result, and
    the progress log gains a row.

## Risks / Trade-offs

- [A moved type changes a public declaration's emitted shape] → the
  declaration-name comparison and root `pnpm typecheck` across every
  dependent member, including both security adapters and the server
  harness's `Partial<SecurityService>`.
- [The kind table changes refusal order or details] → the prelude keeps the
  class precedence, handlers push in loop order, and the 59 configuration
  cases (sync 9, evolution 33, migration 9, visibility 8) run unchanged;
  `cross-runtime` and repository contract suites exercise sync end to end.
- [ES module evaluation order breaks a top-level value] → `contentSyncActor`,
  retry policies, statuses and sorts are frozen literals without calls into
  other package modules; the acyclic graph removes the only way a
  partially-initialized binding could be read.
- [`AccountSecurityPort` shape change surprises an external consumer] → it is
  pre-1.0, not referenced outside `application`, and recorded as
  **BREAKING** in the proposal; consumers that need the old set use
  `AccountSecurityPort & SessionSecurityPort`.
- [`configuration/types.ts` becomes a new grab-bag] → it holds only
  declarations shared by two or more configuration modules or used by a
  configuration port; a type used by one module stays with it.

## Migration Plan

Pure source reorganization inside one package; no data, configuration or
deployment migration. Rollback is reverting the change's commit.
