## Why

Roadmap Step RF5 (runtime deduplication), Session RF5C of
`docs/refactoring-roadmap.md`, the last backend session of the refactoring
roadmap. RF5A and RF5B shared every row mapper and every identical read, but
three write-path differences between `NodeContentRepository` and
`D1ContentRepository` are still neither aligned nor written down, and both
composition roots (`createNodeRuntime`, 621 lines; `createCloudflareRuntime`,
484 lines) assemble the same use cases, rate limiter, MCP wiring and
`createLaceApp` input by hand. Every new use case or app input has to be added
twice, and the route context still hands every route module the raw
`LaceAppInput` and builds `AccountUseCases` lazily with `Date.now()` instead of
the composed clock.

Reading the write paths for this proposal found one real parity defect: the D1
publication result is an in-memory prediction that omits the draft's `seo`
group, so a D1 publish of an entry with SEO values returns (and stores as the
idempotent replay) a published snapshot without `seo`, while Node — which
reloads — and every later `load` return it.

## What Changes

- **Build claims (Node adopts D1, D1 fixed).** Node's site-build lease update
  carries the same `payload_json` guard as D1, so both runtimes run the same
  claim statements. Shared per-call caps move to application beside
  `DISPATCHER_LEASE_DURATION_MS`: `MAX_DISPATCHER_CLAIMS_PER_CALL = 20` for
  generic dispatcher claims (today `D1_MAX_CLAIMS_PER_CALL`, kept exported
  with that value) and `MAX_SITE_BUILD_CLAIMS_PER_CALL = 10` for site-build
  claims. Apply found that D1 applied 20 to site builds although each needs
  four batch statements, so more than ten recoverable build events exceeded
  the 40-statement budget and the claim failed; ten fits it. Node applies
  both caps.
- **Revision-conflict precedence (Node adopts D1).** A publication whose
  expected revision is stale is refused with `CONTENT_REVISION_CONFLICT`
  before internal-link targets are validated and writes nothing; Node checks
  the loaded draft revision after the idempotent replay and before link
  validation, as D1 already does. Concurrent save and publish conflicts keep
  their existing contract cases.
- **Publication return path (fix D1).** D1 keeps its pre-batch prediction
  (the idempotency record that stores it is written in the same batch), but
  the prediction now carries the draft's `seo`; Node keeps its in-transaction
  reload. New contract cases assert that the entry returned by `publish`
  (plain, with SEO, with a conditional projection), by its idempotent replay
  and by `unpublish` equals a subsequent `load`.
- **`mutation_guards` on Node documented, not removed.** Node uses the table
  only as an in-transaction dirty flag for the shared configuration-sync link
  statements from `@lacecms/db`; the row is inserted and deleted inside one
  transaction and is never visible. Architecture §16 records this.
- **`composeLaceServices` in `packages/server`.** One function receives the
  runtime adapters (repository, security, storage, image inspector, clock,
  ids, list-query limits, operational logger, email sender, sensitive limiter,
  client-address lookup, auth boundary, import-actor resolver, optional MCP and
  OAuth adapters and HTTP settings) and returns the use cases (`content`,
  `media`, `links`, `builds`, `accounts`, optional `oauthConnections`) plus the
  complete `LaceAppInput`. `createNodeRuntime` and `createCloudflareRuntime`
  build adapters, dispatchers and process wiring only, then call
  `createLaceApp(services.appInput)`. The duplicated request rate limiter,
  model resolver and default logger move to server once.
- **Feature flags validated once.** `parseRuntimeFeatureFlags(environment)`
  in server owns `LACE_API_DOCS_ENABLED` and `LACE_MCP_ENABLED` and returns the
  flags plus named issues; the Node and Worker settings parsers call it instead
  of repeating the docs check. Accepted values and diagnostics are unchanged.
- **Accounts composed eagerly.** `composeLaceServices` constructs
  `AccountUseCases` with the composed clock; `LaceAppInput` gains an optional
  `accounts`, and the lazy construction in the route context is removed.
- **Route context split.** `createRouteContext` becomes an actor context
  (actor, users/settings actors, current session id) and a capability context
  (use cases, configuration, public URLs, narrow security ports, defer,
  DTO helpers). Route modules receive both and no longer see `LaceAppInput`.
  Routes and the import-actor resolver depend on `AccountSecurityPort`,
  `TokenSecurityPort` or `UserProfileReader` instead of `SecurityService`.
- **Architecture and roadmap.** §16 gains a "Runtime deltas" table listing
  every remaining intentional Node/D1 difference; §15 names
  `composeLaceServices` as the shared composition step; ADR 0002 is amended
  with the publication return path and conflict precedence. The roadmap
  records the RF5C outcome and marks RF5 done.
- Non-goals: no shared write path or statement-builder convergence beyond the
  claim statements (deferred in the backlog); no change to HTTP routes,
  contracts, OpenAPI, error codes or statement budgets; no change to
  dispatcher scheduling (Node timers, Worker `scheduled`); no new environment
  variable; no typing of baselined platform tests (RF9D–RF9F).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-repository-contracts`: new requirement pinning the runtime
  write-path deltas — publication results equal a subsequent load, a stale
  publication is a revision conflict before link validation, and claims honor
  the shared per-call caps.
- `node-content-repositories`: Node build and dispatcher claims use the shared
  per-call caps and the payload-guarded lease update.
- `d1-content-repositories`: D1 site-build claims return at most ten leases
  per call, within the batch statement budget.
- `hono-app-factory`: runtime-neutral composition gains the shared service
  composition, one feature-flag parser and eager account use cases on the
  composed clock.

## Impact

- Code: `packages/platform-node/src/repository/{site-builds,dispatch,entries}.ts`,
  `packages/platform-cloudflare/src/repository/entries.ts`,
  `packages/application` (claim cap constant), `packages/server/src/composition/*`
  (new `services.ts`, `actor-context.ts`, `capabilities.ts`,
  `model-resolver.ts`; `route-context.ts` keeps only the `RouteContext` type), `packages/server/src/runtime/feature-flags.ts`,
  `packages/server/src/security/request-rate-limiter.ts`, every route module
  signature, `packages/auth/src/import/actor.ts` (narrow port type), both
  runtime composition roots and settings parsers, the server app harness.
- Public API: `@lacecms/server` gains `composeLaceServices`,
  `parseRuntimeFeatureFlags`, `SensitiveRequestRateLimiter`,
  `contentModelResolver`, `jsonRequestLogger` and their input/result types; `LaceAppInput` gains
  optional `accounts`; `@lacecms/application` gains
  `MAX_DISPATCHER_CLAIMS_PER_CALL` and `MAX_SITE_BUILD_CLAIMS_PER_CALL`. Platform export keys are unchanged
  (`D1_MAX_CLAIMS_PER_CALL` kept). Packaged export pins are updated.
- Tests: `repository-contract` on SQLite (file, memory) and D1 with the new
  cases and the updated case-name pin; `security-contract`; server route
  tests; `index.test.ts` and `worker.test.ts`; D1 statement budgets
  unchanged; cross-runtime product suite.
- Architecture: §15, §16, ADR 0002. Specs: the four listed above.
- Dependencies: RF5A and RF5B (done), RF9A–RF9B (done). Unblocks RF8 (§15/§16
  documentation) and RF9D–RF9F (platform test typing).
