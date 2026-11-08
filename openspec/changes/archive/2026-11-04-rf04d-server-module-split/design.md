## Context

See proposal.md for motivation. Facts at commit `c63c4686`:

- `packages/server/src` is flat. Production modules: `app.ts` (2,940 lines,
  baselined), `email.ts` (368), `build-site.ts` (47), `import-routes.ts`
  (47), `mcp-settings.ts` (6) and `index.ts` (8). `index.ts` re-exports
  `app.ts`, `email.ts` and `mcp-settings.ts` with `export *` and names
  `IMPORT_ROUTE_ALLOWLIST`, `isImportRoute` and `parseBuildSiteIdentity`
  explicitly. `isBearerManagementRequest` is not public.
- `app.ts` declares, in order: the OpenAPI vendor registration with the four
  `$ref` overrides (179–200), the `hono` `ContextVariableMap` augmentation
  (202–211), the server content-model types `ServerModelBase` …
  `ServerConfig`, `ServerSchema` and `Actor` (213–259), the exported
  capability interfaces (261–294, 376–444), the sensitive-limit types,
  `sensitiveRequestLimit` and `sensitiveRequestSubject` (296–374),
  `AuthorizationError` and the response helpers (446–491), the model
  lookups (493–519), request parsing (`pagination`, `optionalJsonBody`,
  `revision`, `optionalRevision`, `optionalIdempotencyKey`, 521–575),
  `exportSeo` (578–593), `publicPath` (595–608), `buildTokenDto` (610–624),
  the route parameter schemas and `validationHook` (626–639), and the media
  binary helpers (641–717). `createLaceApp` follows (720–2940).
- Inside `createLaceApp`: `onError` (725–732); five global middlewares:
  request id and completion log (734–756), MCP surface gate (767–782), body
  limits (783–815), Bearer import-token resolution (819–830), MCP scope and
  rate limiting (831–884); the MCP, OAuth metadata and `/api/auth/*`
  pass-through routes (886–903); closures over `input` (905–1062): `actor`,
  `adminEntryDto`, `security`, `media`, `publicMediaUrl`, `mediaDto`,
  `usersActor`, `settingsActor`, `email`, `sessionSummary`, the lazily cached
  `accounts`, `currentSessionId`, `deferTask`, the pure `invitationDto`,
  `linkIssueDto` and `invitationIssueDto`, and `noStore`. These are followed
  by the health probes (930–934), 73 `/api/v1` and documentation routes
  (1064–2926) and `notFound` (2928–2937).
- Route registration interleaves areas: setup (1064), `GET /admin/users`
  (1105), `GET /admin/build-site` (1109), session and settings (1126–1177),
  public account flows and self-service (1178–1467), user administration
  (1468–1619), build and import tokens and the import credential
  (1620–1758), site builds (1759–1845), media (1846–2193), content
  (2194–2637), public reads and build export (2638–2890), OpenAPI and docs
  (2892–2926). The `/api/v1/account/mcp-connections` routes, `/api/auth/*`
  and `/api/docs` are registered conditionally.
- The MCP and OAuth protocol bodies are built in four places. `onError` uses
  `/mcp` or `/api/auth/oauth2/*` and returns 503 `server_error` with
  `cache-control: no-store`. The rate limiter uses the same predicate and
  returns 429 `temporarily_unavailable` with `retry-after` and `no-store`. The
  two body-limit branches use the broader local `mcpPath` predicate and
  return 413 `invalid_request` without cache headers. `routes-mcp.test.ts`
  covers the 413 and 429 responses. No test covers the 503 `onError` body.
- Tests are black-box: route companions call `fixture()` from
  `src/test-support/app-harness.ts`, which imports `../index.js`. Some import
  public helpers from `./index.js`. `vitest list` reports 86 cases in 14
  files. `tsconfig.test.json` includes `src/**/*.test.ts`, and the shared
  Vitest config needs no change for subdirectories. `tsconfig.json` compiles
  from `src/index.ts`, so files moved out of `src/` root leave stale copies
  in `dist/` until it is cleaned.
- `apps/api/scripts/generate-openapi.mjs` sorts every object key before
  writing `api-v1.json`, so route registration order does not affect the
  committed document. Its `$ref` component names depend on the vendor
  registration running before the document is generated.

## Goals / Non-Goals

**Goals:**

- `index.ts` is the only root production module. Every other module is in a
  domain directory, has one concern and stays well under 1,000 lines.
- The module graph is acyclic, type-only imports included, and directories
  follow decision 2.
- Handler bodies, middleware bodies, exported declarations and JSDoc move
  verbatim, apart from imports, the `protocolErrorResponse` call sites
  (decision 6) and the two extracted parsers (decision 5).
- Every request produces the same status, headers, body and log record as
  before.

**Non-Goals:**

- Changing middleware order or semantics, or the route table.
- Narrowing `LaceAppInput` or the capability interfaces.
- Moving server DTO mappers into `@lacecms/contracts`.
- Splitting test files, including `routes-content.test.ts` (1,153 lines;
  tests are exempt from the size limit).

## Decisions

1. **Layout.** Each module imports only from lower directories, from
   earlier rows of its own directory, or from other packages.

   | Module | Contents (source lines in `app.ts` unless noted) | ≈ lines |
   | --- | --- | ---: |
   | `shared/http.ts` | `ServerSchema`, `AuthorizationError`, `invalid`, `parse`, `response`, `errorResponse`, `notFound`, `validationResponse`, `validationHook`, `noStore` (258, 446–491, 634–639, 1062) | 80 |
   | `shared/request.ts` | `pagination`, `optionalJsonBody`, `revision`, `optionalRevision`, `optionalIdempotencyKey`, `publicPath`, the four route parameter schemas (521–575, 595–608, 626–632) | 100 |
   | `shared/content-config.ts` | `ServerModelBase` … `ServerConfig`, `contentModel`, `pageModel`, `globalModel`, `collectionModel`, `exportSeo` (213–256, 493–519, 577–593) | 100 |
   | `shared/account-dtos.ts` | `invitationDto`, `linkIssueDto`, `invitationIssueDto` (1036–1060) | 35 |
   | `shared/protocol.ts` | `isMcpSurfacePath` (former `mcpPath`, 758–766), `isProtocolErrorPath`, `protocolErrorResponse` (decision 6) | 45 |
   | `runtime/build-site.ts` | `git mv build-site.ts` | 47 |
   | `runtime/mcp-settings.ts` | `git mv mcp-settings.ts` | 6 |
   | `runtime/email.ts` | `git mv email.ts` | 368 |
   | `security/sensitive-limits.ts` | `SensitiveRequestOperation`, `SensitiveRequestLimit`, `INVITE_LIMITED_PATH`, `sensitiveRequestLimit`, `sensitiveRequestSubject` (296–374) | 85 |
   | `security/import-routes.ts` | `git mv import-routes.ts` | 47 |
   | `composition/input.ts` | `Actor`, `ActorResolver` … `ServerLogger`, `ReadinessProbe`, `ServerEnvironmentMetadata`, `BuiltAdminResponder`, `LaceAppInput` (259–294, 376–444) | 130 |
   | `composition/route-context.ts` | `ActorContext`, `RouteContext`, `createRouteContext(input)` (decision 4; 905–1034) | 170 |
   | `routes/protocol.ts` | `registerProtocolRoutes`: `/mcp`, two OAuth metadata routes, `/api/auth/*` (886–903) | 40 |
   | `routes/health.ts` | `registerHealthRoutes` (930–934) | 15 |
   | `routes/setup-session.ts` | `registerSetupSessionRoutes`: setup state and admin, admin session, settings status, email test (1064–1103, 1126–1177) | 150 |
   | `routes/accounts.ts` | `registerAccountRoutes`: invitation inspect and accept, password reset, account profile, password, capabilities, MCP connections, sessions (1178–1467) | 320 |
   | `routes/admin-users.ts` | `registerAdminUserRoutes`: user list, invitations, user password reset, session revocation, user update (1105–1108, 1468–1619) | 190 |
   | `routes/credentials.ts` | `registerCredentialRoutes`: build tokens, import tokens, import credential; `buildTokenDto` (610–624, 1620–1758) | 180 |
   | `routes/builds.ts` | `registerBuildRoutes`: build site, site builds, build request, retry (1109–1125, 1759–1845) | 130 |
   | `routes/media-binary.ts` | `EligibleMedia`, cache-control constants, `mediaBinaryEntityTag`, `ifNoneMatchMatches`, `conditionalMediaResponse`, `binaryResponse` (649–717) | 80 |
   | `routes/media-upload.ts` | `mediaByteStream`, `readMediaUpload` (decision 5; 641–647, 1939–1993) | 90 |
   | `routes/media.ts` | `registerMediaRoutes`: admin media, tags, upload, delete, read, metadata, retry deletion, public binary, preview (1846–2193) | 330 |
   | `routes/content.ts` | `registerContentRoutes`: content models, entries, link targets, link impact, draft, publish, unpublish, revert, duplicate, delete (2194–2637) | 490 |
   | `routes/build-export.ts` | `readBuildExportQuery`, `readBuildExportPage` (decision 5; 2845–2872) | 60 |
   | `routes/public.ts` | `registerPublicRoutes`: globals, pages, collections, by-path, build export (2638–2890) | 240 |
   | `routes/docs.ts` | OpenAPI vendor registration (179–200), `registerDocsRoutes`: `/api/v1/openapi.json`, `/api/docs` (2892–2926) | 80 |
   | `app/create-app.ts` | `ContextVariableMap` augmentation, `createLaceApp`: `maxBodyBytes` check, `onError`, five middlewares, `routeContext`, registrations (decision 3), `notFound` | 280 |
   | `index.ts` | `packageName`, explicit re-exports (decision 7) | 40 |

   File names do not repeat their directory. A helper used by one module
   moves with it. A helper used by several modules becomes a module export
   that the entry does not re-export. Exact imports follow what each moved
   body references. The requirement is the direction and acyclicity rules,
   not a per-module import list.

   The `ContextVariableMap` augmentation stays with `createLaceApp`, the
   module that the entry re-exports, so it stays in the declaration graph of
   `dist/index.d.ts` as it is today. The OpenAPI vendor registration
   is a module side effect in `routes/docs.ts`. `create-app.ts` imports that
   module, so the registration still runs whenever the package entry loads.
   The unchanged `api-v1.json` hash, including the four `$ref` names, proves
   it.

2. **Directory direction:** `shared ← runtime, security ← composition ←
   routes ← app`. `runtime` and `security` do not import each other.
   Route modules import other `routes/` modules only for their parsing and
   binary helpers (`media-upload`, `media-binary`, `build-export`). A
   registration module never imports another registration module.
   `index.ts` states this on its first line. Alternative rejected:
   `app/` holding `input.ts` and `route-context.ts` beside `create-app.ts`,
   which would make `app ↔ routes` a directory cycle even with an acyclic
   module graph.

3. **Registration order.** `createLaceApp` installs `onError` and the five
   middlewares in their current order, then calls the route modules in this
   order: `protocol`, `health`, `setup-session`, `accounts`, `admin-users`,
   `credentials`, `builds`, `media`, `content`, `public`, `docs`. It then
   installs `notFound`. Within a module, routes keep their source order and
   their conditional guards (`input.auth`, `input.mcpEnabled &&
   input.oauthConnections`, `input.apiDocsEnabled`). Only areas interleaved
   across modules change relative order: `GET /admin/users` and
   `GET /admin/build-site` now come after the session routes. No two
   patterns from different modules can match the same method and path, so
   Hono dispatch is unchanged. The OpenAPI document is key-sorted, so it is
   also unchanged. `docs` stays last because `openAPIRouteHandler` reads the
   app's routes. Decision 8 compares the route tables. Alternative
   rejected: splitting a module's registration into several calls to
   reproduce the original interleaving, which would break the one-module,
   one-area rule for no observable difference.

4. **`RouteContext` holds only what closes over the input.**

   ```ts
   interface ActorContext {
     readonly req: { readonly raw: Request };
     get(key: string): unknown;
     set(key: string, value: unknown): void;
   }
   interface RouteContext {
     readonly input: LaceAppInput;
     readonly email: EmailSender;
     readonly seoSection: ExportSeoDto;
     readonly seoModels: ReadonlySet<string>;
     actor(context: ActorContext): Promise<Actor>;
     usersActor(context: ActorContext): Promise<Actor>;
     settingsActor(context: ActorContext): Promise<Actor>;
     sessionSummary(actor: Actor): Promise<Response>;
     currentSessionId(context: ActorContext): Promise<string | null>;
     deferTask(context: { readonly executionCtx: { waitUntil(task: Promise<unknown>): void } }): DeferTask;
     security(): SecurityService;
     media(): MediaUseCases;
     accounts(): AccountUseCases;
     publicMediaUrl(): (mediaId: string) => string;
     mediaDto(value: MediaView): ReturnType<typeof toMediaMetadataDto>;
     adminEntryDto(actor: Actor, entry: …): Promise<…>;
   }
   ```

   `sessionSummary` closes over `security()` and is used by both setup/session
   and account routes, so it belongs in the context rather than either route
   registration module. This preserves the prohibition on imports between
   registration modules.

   `createRouteContext(input)` is called once per `createLaceApp` call. It
   moves the closure bodies verbatim, including the lazily cached
   `AccountUseCases`, so each app still builds at most one instance. The
   MCP and rate-limit middlewares in `create-app.ts` use the same
   `routeContext.actor`, so the actor stays cached on the Hono context.
   Each `register<Area>Routes(app: Hono, routeContext: RouteContext)` starts
   by destructuring the members it uses
   (`const { input, actor, security } = routeContext;`), so the handler
   bodies move without edits. `response`, `errorResponse`, `noStore`, the
   request parsers and the pure DTO mappers are module imports. This
   corrects the roadmap's list: those helpers have no per-app state, and
   routing them through the context would hide their real dependency.
   Alternative rejected: passing `input` alone and rebuilding the closures in
   each module, which would duplicate `actor` caching and the
   `AccountUseCases` cache across modules.

5. **Extracted parsing keeps the error precedence.**

   - `readMediaUpload(request): Promise<{ readonly body; readonly filename;
     readonly tags } | Response>` runs the current multipart loop. It throws
     the same `invalid(...)` errors for unknown, duplicate or non-file parts,
     returns the tag `validationResponse` when tag validation fails, and
     maps `MaxFileSizeExceededError` to `PAYLOAD_TOO_LARGE` and
     `MultipartParseError` to the `/file` validation response. The upload
     route resolves the actor first, as today, calls `readMediaUpload`,
     returns a `Response` result unchanged, and only then calls
     `media().create`. An unavailable media capability is still reported
     after a malformed body. Today the `try` also wraps `media().create`. That
     call cannot throw either parser error class, because `application` does
     not depend on the parser, so narrowing the `try` changes no outcome.
   - `readBuildExportQuery(url)` rejects a repeated query parameter, then
     parses `buildExportQuerySchema`. `readBuildExportPage(publicContent,
     query)` calls `exportBuildContentPage` with the default page size and
     maps `BuildExportCursorError` to the `/after` validation error. The
     route keeps build-token verification before both, and keeps the
     `If-None-Match` validation, the first-page 304, the page ETag and the
     strict response validation.

6. **`protocolErrorResponse`.** `shared/protocol.ts` exports:

   ```ts
   type ProtocolErrorCode = "invalid_request" | "server_error" | "temporarily_unavailable";
   /** Paths whose clients read OAuth-style `{ error }` bodies for failures. */
   function isProtocolErrorPath(path: string): boolean; // `/mcp` or `/api/auth/oauth2/*`
   /** The MCP and OAuth surface the gate and body limits apply to. */
   function isMcpSurfacePath(path: string): boolean; // former `mcpPath`, unchanged
   function protocolErrorResponse(
     error: ProtocolErrorCode,
     status: number,
     headers?: HeadersInit,
   ): Response; // Response.json({ error }, { status, headers })
   ```

   The four call sites keep their predicate, status and headers: `onError`
   (`isProtocolErrorPath`, 503, `noStore`), the rate limiter
   (`isProtocolErrorPath`, 429, `retry-after` plus `noStore`), and both body
   limits (`isMcpSurfacePath`, 413, no headers). The body limits share one
   local `payloadTooLarge(path)` in `create-app.ts`. The null-body 404, 403
   and 503 responses of the MCP gate and `/mcp` route are not error
   envelopes and stay as they are. Alternative rejected: one predicate for
   all four sites, or adding `no-store` to the 413, because either changes
   observable responses.

7. **Entry and export surface.** `index.ts` lists concrete modules in
   commented directory groups. Fully public modules keep `export *`:
   `runtime/email.ts`, `runtime/mcp-settings.ts` and
   `security/sensitive-limits.ts`. All other modules are re-exported by
   explicit lists: `parseBuildSiteIdentity`, `IMPORT_ROUTE_ALLOWLIST`,
   `isImportRoute`, the eight capability interfaces and `LaceAppInput` from
   `composition/input.ts` (not `Actor`), and `createLaceApp`. `index.ts`
   keeps `packageName`, which `index.test.ts` asserts. Internal module
   exports (`Actor`, `ServerConfig`, the helpers, `RouteContext`,
   `isBearerManagementRequest`, the registration functions) are not
   re-exported.

8. **Equivalence evidence.** Baselines recorded before any move and
   compared after the split:

   - runtime keys of `dist/index.js`, which the packaged test also pins, and
     the exported value and type names of `dist/index.d.ts`, built from a
     clean `dist/`;
   - the route table: the `(method, path)` sequence of `app.routes` for a
     maximal fixture (auth, MCP, OAuth connections and API docs enabled).
     The middleware prefix must be identical, the route multiset must be
     identical, and each module's routes must keep their baseline relative
     order;
   - the SHA-256 of `apps/api/openapi/api-v1.json`, plus `pnpm openapi:check`;
   - the sorted `vitest list` names with file prefixes stripped. The result
     must be the baseline plus the decision 9 case, with case titles
     unchanged;
   - a scratch script that walks relative imports, type-only included, and
     asserts no cycle and no edge against decision 2.

   Scratch outputs are deleted once the result is recorded in
   `verification.md`.

9. **One characterization case first.** Before any code moves,
   `routes-mcp.test.ts` gains *unexpected MCP and OAuth failures keep the
   protocol server_error body*. A throwing `mcp.fetch` on `/mcp` and a
   throwing `auth.fetch` on `/api/auth/oauth2/token` each answer 503
   `{ "error": "server_error" }` with `cache-control: no-store`, and a
   throwing `auth.fetch` on a non-OAuth `/api/auth/*` path answers the REST
   internal-error envelope. The case passes on the unsplit code, so it pins
   the one `onError` branch that decision 6 rewrites and no existing test
   covers. It is the only change to the case count (86 → 87).

10. **Test placement.** Test files move with `git mv`, with only import
    paths edited (`./index.js` → `../index.js`, `./test-support/…` →
    `../test-support/…`):

    | From | To |
    | --- | --- |
    | `app.test.ts` | `app/create-app.test.ts` |
    | `error-matrix.test.ts` | `app/error-matrix.test.ts` |
    | `routes-mcp.test.ts` | `routes/protocol.test.ts` |
    | `routes-session-settings.test.ts` | `routes/setup-session.test.ts` |
    | `routes-accounts.test.ts` | `routes/accounts.test.ts` |
    | `routes-users-invitations.test.ts` | `routes/admin-users.test.ts` |
    | `routes-builds.test.ts` | `routes/builds.test.ts` |
    | `routes-media.test.ts` | `routes/media.test.ts` |
    | `routes-content.test.ts` | `routes/content.test.ts` |
    | `routes-public-export.test.ts` | `routes/public.test.ts` |
    | `routes-import.test.ts` | `security/import-routes.test.ts` |
    | `build-site.test.ts` | `runtime/build-site.test.ts` |
    | `email.test.ts` | `runtime/email.test.ts` |

    `index.test.ts`, `packaged-exports.packaged.test.mjs` and
    `test-support/app-harness.ts` stay. The credential routes have no own
    companion: build tokens stay covered in `accounts.test.ts` and import
    tokens in `import-routes.test.ts`, as RF2B grouped them. Tests keep
    importing public helpers through the entry.

## Risks / Trade-offs

- [A moved handler silently loses a closure, such as `seoModels`, or reads
  a different `accounts()` instance] → `RouteContext` is typed, so a missing
  member fails `typecheck`. `createRouteContext` runs once per app, and the
  route suites run unchanged against the split code.
- [Stale `dist/app.js` and old module copies survive in the published
  `dist/`] → Clean `dist/` before the baseline-comparison build and the
  gate build. The packaged test pins entry keys only, so this is checked
  explicitly.
- [The OpenAPI vendor registration runs after a route is described] →
  `resolver()` defers schema conversion to generation time, which follows
  module evaluation. The unchanged `api-v1.json` hash, including its four
  `$ref` names, proves it.
- [Registration order across areas changes] → Decision 3 limits this to
  non-overlapping patterns. Decision 8 compares the route table.
- [Narrowing the upload `try`] → Decision 5 explains why no outcome changes.
  The media suite covers oversize, malformed multipart, bad tags and an
  unavailable capability.

## Migration Plan

Pure in-package move with no runtime, schema or configuration migration.
Rollback is a revert of the change commit. Consumers do not change.
