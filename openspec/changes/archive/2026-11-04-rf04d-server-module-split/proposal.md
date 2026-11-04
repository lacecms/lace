## Why

`@lacecms/server` keeps the whole HTTP surface in one 2,940-line
`src/app.ts` (commit `c63c4686`): capability interfaces, the sensitive-limit
table, request and response helpers, five global middlewares and 73 route
registrations inside a single `createLaceApp` function. It is the largest
remaining entry in `scripts/oversized-source-baseline.json`, and two handlers
inline transport parsing (media multipart and tag parsing, build-export query
and paging). The MCP and OAuth protocol error bodies are built in four places
with two different path predicates. This is Session RF4D of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md) (Step
RF4, module splits). It applies architecture §6 *Source layout* (ADR 0020)
and the shrinking size baseline from RF4A, after RF4B and RF4C split the
`application` and `contracts` packages the routes import.

## What Changes

- **Domain directories.** `src/index.ts` becomes the only root production
  module: `packageName` and explicit re-exports, with the directory direction
  stated at the top. Code moves verbatim, JSDoc included, into six
  directories: `shared/` (HTTP responses and the authorization error, request
  parsing, server content-model lookups and the export SEO section, account
  DTO mappers, protocol paths and `protocolErrorResponse`), `runtime/`
  (`build-site.ts`, `mcp-settings.ts` and `email.ts`, moved with `git mv`),
  `security/` (sensitive request limits, and `import-routes.ts` moved with
  `git mv`), `composition/` (the `LaceAppInput` capability interfaces and the
  per-app `RouteContext`), `routes/` (route registration modules and their
  parsing helpers) and `app/` (`createLaceApp`).
- **`createLaceApp` keeps construction only.** It validates `maxBodyBytes`,
  creates the Hono app, installs `onError` and the five global middlewares
  (request id and completion log, MCP surface gate, body limits, Bearer
  import-token resolution, MCP scope and rate limiting), calls each
  `register<Area>Routes(app, routeContext)` and installs `notFound`.
- **Route modules.** `routes/{protocol,health,setup-session,accounts,admin-users,credentials,builds,media,content,public,docs}.ts`.
  Each takes the `RouteContext`: the closures over the app input (`actor`,
  `usersActor`, `settingsActor`, `currentSessionId`, `deferTask`, the
  `security`, `media` and `accounts` capability accessors, `publicMediaUrl`,
  `mediaDto`, `adminEntryDto`), plus the email sender and the export SEO
  section computed once per app.
- **Corrections to the roadmap text.** (1) The roadmap's `routes/*.ts`
  list has no owner for the build-token, import-token and import-credential
  routes, the MCP and OAuth pass-through routes, or the health probes. The
  session adds `credentials.ts`, `protocol.ts` and `health.ts`. (2) The
  roadmap puts `response`, `errorResponse` and `noStore` in the
  `RouteContext`. These helpers and the pure DTO mappers do not depend on the
  app input, so they become module imports from `shared/`. The context holds
  only what closes over the input. (3) The roadmap names `media-upload.ts`
  and `build-export.ts` at the package root. Under §6 they live in `routes/`
  beside the routes that use them. The media binary response helpers move
  beside them in `routes/media-binary.ts`.
- **Extracted parsing.** `routes/media-upload.ts` reads the multipart upload:
  file and tag parts, tag validation, and the oversize and malformed-multipart
  mappings. `routes/build-export.ts` parses the build-export query and reads a
  page, mapping a stale cursor to the existing validation error. Both route
  handlers keep their authorization, conditional reads and response
  validation.
- **One protocol error helper.** The `server_error` (503), `temporarily_unavailable`
  (429) and `invalid_request` (413) bodies for MCP and OAuth clients come from
  one `protocolErrorResponse`. Each call site keeps its current status,
  headers and path predicate.
- **Public surface unchanged.** The runtime export keys pinned by
  `packaged-exports.packaged.test.mjs` and the type export names of
  `dist/index.d.ts` stay identical. Helpers that become module exports so
  sibling modules can import them are not added to the package entry.
- **Tests follow their modules.** The route test companions from RF2B move
  beside their route modules with only import-path edits and unchanged case
  titles. `app.test.ts` and `error-matrix.test.ts` move to `app/`, and
  `build-site.test.ts` and `email.test.ts` move to `runtime/`. One
  characterization case is added before any code moves: unexpected MCP and
  OAuth failures keep the protocol `server_error` body. No existing test
  covers that path, and the helper extraction changes it.
- **Guards and documentation.** `packages/server/src/app.ts` leaves
  `scripts/oversized-source-baseline.json` (14 → 13). The roadmap records the
  RF4D layout corrections, the §3 size rows and the progress log.

Non-goals: any change to a route, status, header, body, error code, log
record, rate-limit subject or OpenAPI output; renaming the public
declarations; harmonizing the protocol 413 response with the 429 and 503
cache headers; moving server DTO mappers into `@lacecms/contracts`;
splitting `routes-content.test.ts` (test files are outside the size limit);
new subpath exports; a committed intra-package cycle checker; changes to the
consumer packages.

Dependencies: RF2B (route test companions and `src/test-support/app-harness.ts`),
RF3D (`classifyError` and the error matrix), RF4B and RF4C (the application
and contracts entries the server imports). Independent of RF4E.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure refactor (`skip_specs: true`). The accepted
capabilities whose HTTP code moves keep their requirements unchanged:
`hono-app-factory`, `mcp-oauth-delegation`, `mcp-content-server`,
`account-invitations`, `account-self-service`, `password-recovery`,
`browser-first-admin-setup`, `media-use-cases`, `cloudflare-media-storage`,
`site-build-dispatch`, `build-site-selection`, `content-import-cli`,
`api-documentation-ui`, `bootstrap-user-token-abuse-controls`,
`email-delivery` and `rest-contracts`.

## Impact

- Code: `packages/server/src` reorganized into six directories with
  `index.ts` as the only root production module. Test files move beside
  their modules, and one test case is added.
- Tooling: one entry removed from `scripts/oversized-source-baseline.json`.
- Documentation: `docs/refactoring-roadmap.md` RF4D text, the §3 size rows
  and the progress log. Architecture §6 already states the layout rules.
- Consumers: none at runtime. `platform-node`, `platform-cloudflare` and
  `apps/api` import the package entry, whose runtime keys and type names do
  not change. The committed OpenAPI document (`pnpm openapi:check`) stays
  byte-identical.
- Dependencies: none added or removed.
