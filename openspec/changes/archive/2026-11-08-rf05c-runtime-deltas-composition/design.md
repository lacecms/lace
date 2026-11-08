## Context

Observed state after RF5B (commit `8de77caa`):

- **Build claims.** Node `repository/site-builds.ts` `claimSiteBuilds` runs
  select, lease update, build insert and start update inside one
  better-sqlite3 transaction, binds the requested limit (≤ `MAX_PAGE_SIZE`)
  directly and updates the lease with
  `where id = ? and processed_at is null and (locked_at …)`. D1
  `repository/site-builds.ts` selects outside the batch, caps the limit with
  `Math.min(limit, D1_MAX_CLAIMS_PER_CALL)` (20, `d1/database.ts`), and adds
  `and payload_json = ?` to the lease update because the payload it parsed
  was read before the batch. The generic dispatcher `claim`
  (`repository/dispatch.ts`) has the same cap difference (D1 caps, Node does
  not) and no payload guard on either runtime. Callers request 10 (Node
  `SiteBuildDispatcher.runOnce` default) or 1/5 (Worker scheduled constants),
  so the cap never binds today.
- **Revision conflicts.** Node `saveCompleteDraft` and `publish` detect a stale
  revision by `changes !== 1` on the guarded update/insert inside the
  transaction. D1 `publish` pre-checks `entry.draft.revision !==
  expectedRevision` after the replay check, then after the batch disambiguates
  a zero-row snapshot insert: replay → link targets → revision conflict. Node
  `publish` validates link targets *before* its guarded insert, so a stale
  revision on a draft with invalid links is a link failure on Node and a
  revision conflict on D1. Concurrent saves and replays are already pinned
  ("admits exactly one of two concurrent saves at one revision", "replays an
  idempotent publication once…").
- **Publication return path.** D1 builds `publishedEntry(entry, input, role)`
  before the batch because the same batch writes it as the idempotency
  `response_json`; it omits `seo` (`StoredSnapshot.seo` is optional and never
  set there). `unpublish` returns `{draft, id, model}`. Node reloads inside
  the transaction with the synchronous loader and stores the reload as the
  replay. `revertDraft`, `create` and `saveCompleteDraft` reload on both.
- **`mutation_guards` on Node.** Only `repository/configuration-sync.ts`
  touches it: the shared `@lacecms/db` builders
  (`configurationSyncMigrationStatements`, `syncInternalLinkStatements`,
  `COMMIT_SYNC_LINK_GRAPH_SQL`) mark "link graph changed" by inserting a
  dirty token and bump `content_link_state` only if it exists; Node deletes
  the token before the transaction commits.
- **Composition.** `createNodeRuntime` and `createCloudflareRuntime` each
  build the model resolver closure, `ContentUseCases`, `MediaUseCases`,
  `SiteBuildUseCases`, `ContentLinkUseCases`, `OAuthConnectionUseCases`, the
  MCP handler, the import-actor resolver, a verbatim
  `{Node,Cloudflare}RequestRateLimiter`, a default request logger and the
  27-field `createLaceApp` input. Differences are adapters (repository,
  security, limiter, storage, inspector, cache, readiness, email
  `runtimeSender`, auth database), list limits, dispatcher classes and test
  overrides (Node `actors`, `auth`, `rateLimiter`, `storage`, …; Worker
  `clock`, `buildTrigger`, `email`, …).
- **Flags.** `parseMcpEnabled` is shared (`server/runtime/mcp-settings.ts`);
  the `LACE_API_DOCS_ENABLED` check is copied in `platform-node`
  `runtime/runtime.ts` and `platform-cloudflare` `runtime/settings.ts`.
- **Route context.** `composition/route-context.ts` returns `input` (the raw
  `LaceAppInput`, used ~85 times by eleven route modules), actor helpers, a
  `security()` that returns the whole `SecurityService`, and a lazy
  `accounts()` that builds `AccountUseCases` with `Date.now()`. Only
  `routes/credentials.ts` narrows to `TokenSecurityPort`; `@lacecms/auth`
  `createImportActorResolver` takes `Pick<SecurityService,
  "resolveImportToken">`.
- **Boundaries.** `@lacecms/server` may depend on application, contracts and
  auth (`scripts/check-boundaries.mjs`) but lists only application and
  contracts; it may not import `@lacecms/mcp`. Server directory direction:
  `shared ← runtime, security ← composition ← routes ← app`.

## Goals / Non-Goals

**Goals:** every Node/D1 write-path difference is either aligned or listed in
architecture §16 with a contract case pinning its observable result; one
service composition shared by both runtimes; route modules see only actor
resolution and the capabilities they call; one parser per feature flag.

**Non-Goals:** shared write statements beyond the claim SQL; changes to
statement counts or D1 budgets; HTTP, OpenAPI or error-code changes;
dispatcher scheduling changes; splitting test files (RF9C) or typing
baselined platform tests (RF9D–RF9F).

## Decisions

### D1. Claim caps and payload guard live in shared constants

`packages/application/src/shared/limits.ts` (beside
`DISPATCHER_LEASE_DURATION_MS`) gains `MAX_DISPATCHER_CLAIMS_PER_CALL = 20`
and `MAX_SITE_BUILD_CLAIMS_PER_CALL = 10`. `platform-cloudflare`
`D1_MAX_CLAIMS_PER_CALL` becomes `= MAX_DISPATCHER_CLAIMS_PER_CALL` (export
kept; one batch statement per generic claim). Both runtimes bind
`Math.min(limit, MAX_SITE_BUILD_CLAIMS_PER_CALL)` in `claimSiteBuilds` and
`Math.min(limit, MAX_DISPATCHER_CLAIMS_PER_CALL)` in `claim`; Node's
site-build lease update adds `and payload_json = ?` bound to the selected row.

*Found during apply:* the contract case exposed that D1 capped site-build
claims at 20 although each claim adds four statements to one batch, so more
than ten claimable events (reachable only through expired leases; the
partial unique index allows one unlocked pending build event) raised "D1
mutation exceeds its statement budget". Ten claims are 40 statements, exactly
`D1_MAX_BATCH_STATEMENTS`. Production callers request 1 (Worker) or 10 (Node
default), so no caller changes. The limit
validation (`1 … MAX_PAGE_SIZE`, same error messages) is unchanged, so a limit
of 50 is valid and capped, not rejected.

*Alternative rejected:* rejecting limits above 20. It would change the
validated-input contract for callers that pass page-sized limits and gives no
parity benefit.

*Alternative rejected:* removing the payload guard from D1 instead. D1 reads
the payload outside the batch; the guard is what keeps a parsed payload and
the claimed row consistent there. In a Node transaction it is redundant but
free, and identical statement text keeps the two claims reviewable as one.

### D2. Stale publication is a revision conflict first (Node adopts D1)

Node `publish` checks `entry.draft.revision !== input.expectedRevision` inside
its transaction right after the idempotent-replay block and before projection
and link validation, throwing the existing revision-conflict error. The
guarded `insert … where s.revision = ?` and its `changes !== 1` check stay as
the race guard. D1 is unchanged. Precedence on both runtimes: replay (or
fingerprint mismatch) → stale revision → invalid link targets → write.

*Alternative rejected:* D1 adopting Node's order (links first). A stale client
would be told to fix links in a draft it no longer has; the revision conflict
is the actionable answer and is what D1 users already see.

### D3. Publication result: keep the D1 prediction, make it complete

D1 must know the committed entry before the batch, because the idempotency
record that stores it is a statement in that batch; a post-batch reload would
make the stored replay and the returned entry two different values again.
`publishedEntry` therefore copies `draft.seo` (when present) into the
predicted published snapshot. Node keeps its in-transaction reload. The new
contract cases compare `publish` (plain; with SEO; with a conditional
projection), a second-repository replay and `unpublish` against `load` with
`toEqual`. If a case exposes another field, the prediction is fixed, never the
contract.

### D4. `mutation_guards` stays on Node and is documented

Removing it would require Node-specific copies of the configuration-sync link
statements, the opposite of RF5's direction. Architecture §16's runtime-deltas
table records: "Node uses `mutation_guards` only as an in-transaction dirty
token for the shared sync link statements; it never outlives the
transaction." A comment at both Node delete sites points there.

### D5. `composeLaceServices` (new `server/src/composition/services.ts`)

```ts
export interface LaceServicesInput {
  readonly config: ServerConfig;
  readonly repository: LaceRepository; // content, media, public reads, builds, links ports
  readonly security: SecurityService;
  readonly storage: ObjectStorage;
  readonly imageInspector: ImageInspector;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly listQueryLimits: ListQueryLimits;
  readonly logger: OperationalLogger; // error(entry: Record<string, string>)
  readonly email: EmailSender;
  readonly limits: {
    readonly sensitive: SensitiveRateLimiter;
    readonly clientAddress: (request: Request) => string;
    readonly requests?: RequestRateLimiter; // test override; omits `sensitiveLimiter`
  };
  readonly auth: {
    readonly boundary: LaceAuthBoundary; // AuthRouteHandler + actors + optional OAuth `mcp.resolve`
    readonly actors?: ActorResolver; // test override
    readonly importActors: NonNullable<LaceAppInput["importActors"]>;
  };
  readonly mcp?: { // used only when http.flags.mcpEnabled
    readonly createHandler: (content: ContentUseCases) => { readonly fetch: McpFetch };
    readonly connections: OAuthConnectionPort;
  };
  readonly http: {
    readonly flags: RuntimeFeatureFlags;
    readonly publicBaseUrl: URL;
    readonly buildSite: BuildSiteIdentityDto | null;
    readonly readiness: ReadinessProbe;
    readonly environment: ServerEnvironmentMetadata;
    readonly maxBodyBytes: number;
    readonly requestIds: RequestIdGenerator;
    readonly requestLogger?: ServerLogger; // default JSON console logger
    readonly adminAssets?: BuiltAdminResponder;
  };
}

export interface LaceServices {
  readonly content: ContentUseCases;
  readonly media: MediaUseCases;
  readonly links: ContentLinkUseCases;
  readonly builds: SiteBuildUseCases;
  readonly accounts: AccountUseCases;
  readonly oauthConnections?: OAuthConnectionUseCases;
  readonly appInput: LaceAppInput;
}
```

It builds the use cases exactly as both runtimes do today (component names in
operational logs `media`, `deferred` unchanged), the MCP handler and
`OAuthConnectionUseCases` only when `flags.mcpEnabled` and the adapters are
present, the `defer` fallback that logs `{component: "deferred", reason:
"task_failed"}` through `logger`, the request rate limiter, and
`AccountUseCases` with `clock`. The roadmap's seven named inputs are the core;
the grouped `limits`, `auth` and `http` carry what both runtimes already pass
to `createLaceApp`.

- **No new server dependency.** Server cannot import `@lacecms/mcp` and need
  not import `@lacecms/auth`: the runtime passes `createHandler` (wrapping
  `createMcpContentHandler`), the Better Auth boundary and the import-actor
  resolver it builds today. These are authentication adapters, not use cases.
- **Shared helpers.** `server/src/security/request-rate-limiter.ts` exports
  `SensitiveRequestRateLimiter` (the verbatim class from both runtimes, taking
  the fixed-window limiter, clock and `clientAddress`).
  `composition/model-resolver.ts` exports `contentModelResolver(config)` (the
  closure both repositories receive). The JSON console request logger moves to
  `composition/services.ts` as the default.
- **Runtimes.** `createNodeRuntime` keeps database opening, the outdated-schema
  log, `NodeContentRepository`, `NodeSecurityService`, limiter, MinIO storage,
  dispatchers, build trigger, readiness, OAuth persistence, Better Auth, email
  sender and its returned `NodeRuntime` shape (`content`, `media` now come
  from `services`). `createCloudflareRuntime` likewise keeps D1/R2/KV,
  dispatchers, tracker, deploy hook and `CloudflareRuntime`. Both end with
  `createLaceApp(services.appInput)`. Their public input types and returned
  runtime objects keep every field.

*Alternative rejected:* `composeLaceServices` returning the Hono app. Runtimes
and tests need the use cases and the input separately (Node returns `content`
and `media`; harnesses inspect inputs), and `createLaceApp` stays the single
app factory the spec names.

### D6. Feature flags parsed once

`server/src/runtime/feature-flags.ts` exports
`parseRuntimeFeatureFlags(environment: { LACE_API_DOCS_ENABLED?: unknown;
LACE_MCP_ENABLED?: unknown }): { flags: RuntimeFeatureFlags; issues:
readonly { variable: string; reason: "invalid" }[] }`, reusing
`parseMcpEnabled` (kept exported). `parseNodeRuntimeSettings` and
`parseCloudflareSettings` push its issues into their own error lists, so
`NodeEnvironmentError`/`CloudflareEnvironmentError` and their sanitized
messages are unchanged.

### D7. Route context split and narrow ports

`composition/route-context.ts` keeps only the `RouteContext` type; its factory is replaced by:

- `composition/actor-context.ts` — `createActorContext(actors)`: `actor`,
  `usersActor`, `settingsActor`, `currentSessionId`.
- `composition/capabilities.ts` — `createCapabilities(input)`: `content`,
  `links`, `builds`, `media()`, `publicContent`, `config`, `seoSection`,
  `seoModels`, `buildSite`, `environment`, `readiness`, `flags`
  (`apiDocsEnabled`, `mcpEnabled`), `auth`, `mcp`, `oauthConnections`,
  `publicBaseUrl`, `publicMediaUrl()`, `mediaDto`, `adminEntryDto`, `email`,
  `accounts()` (returns `input.accounts` or throws the existing
  `InvariantError("Account flows are unavailable.")`), `deferTask`,
  `sessionSummary`, and narrow security accessors `accountSecurity():
  AccountSecurityPort`, `tokenSecurity(): TokenSecurityPort`,
  `profiles(): UserProfileReader` — each throwing `AuthorizationError` when
  security is absent, as `security()` does today.

`createLaceApp` builds both and calls `registerXRoutes(app, { actors,
capabilities })`; no route module imports `LaceAppInput` or reads `.input`.
The `RouteContext` type becomes `{ actors: ActorContext; capabilities:
Capabilities }`. `LaceAppInput.accounts?: AccountUseCases` is added; the
server app harness builds `AccountUseCases` on host time (as the system
clocks of both runtimes do) when it supplies security, so existing route
expectations are unchanged; `services.test.ts` covers the injected clock.
Without `accounts`, `accounts()` keeps today's errors: `AuthorizationError`
when security is absent, otherwise `InvariantError`. `createImportActorResolver` types its dependency as
`Pick<TokenSecurityPort, "resolveImportToken">`.

The server package header keeps `shared ← runtime, security ← composition ←
routes ← app`: `composition/services.ts` imports `security/` and `runtime/`,
never `app/`; runtimes import `composeLaceServices` and `createLaceApp` from
the entry.

### D8. Architecture, ADR and roadmap first

Apply starts with §15 (composition paragraph), §16 (new "Runtime deltas"
subsection: claims aligned; revision precedence aligned; publication return —
D1 prediction vs Node reload, pinned by contract; `mutation_guards` on Node;
build export `readGroups`; `list`/sync scans runtime-specific; bind chunk 200
vs 100; list-query limits) and an "Amendment (RF5C)" section in ADR 0002. The
roadmap RF5C outcome, §3 rows and progress log follow at the end.

## Risks / Trade-offs

- [New contract cases expose more prediction gaps than `seo`] → D3 rule: fix
  the D1 prediction; budget tests pin that the D1 publish statement count does
  not grow.
- [Seeding 21 outbox events bypasses coalescing] → the case seeds rows with
  the contract's SQL helper using distinct ids and available times, as
  existing dispatch cases seed malformed events.
- [Account flows on Workers composed with an injected test clock now use it]
  → intended (spec scenario); worker tests that combine a fixed clock with
  account flows are updated to expect expiry from that clock.
- [Large mechanical diff across eleven route modules] → routes change only
  destructuring and `input.x` → `capabilities.x`; route tests run unchanged as
  the guard, plus a boundary assertion that no route module imports
  `composition/input.js` types other than `Actor`.
- [Composition input grows wide] → grouped sub-objects keep each runtime call
  site readable; the type is exported so tests construct it once.
