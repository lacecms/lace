## 1. Portable documentation route

- [x] 1.1 Add a catalog-pinned Scalar Hono integration and exact-version browser CDN URL; implement the optional shared factory input and `/api/docs` route using the live OpenAPI URL, current-origin requests, hash navigation and the design's privacy settings. Verify server tests cover enabled HTML, default/explicit disabled API `404`, request IDs/logging, no frontend fallback, no embedded credentials and unchanged OpenAPI output.

## 2. Runtime configuration and operator entry points

- [x] 2.1 Add exact-string env parsing and forwarding to Node runtime composition. Verify runtime tests cover absent/`false`/`true`, invalid empty/numeric/uppercase values, sanitized startup diagnostics, and an enabled route through Node composition.
- [x] 2.2 Add the same setting to Cloudflare environment/settings and Worker composition. Verify settings and Worker tests cover enabled/disabled behavior, sanitized invalid-environment `503`, API-first asset routing and the existing Worker bundle smoke.
- [x] 2.3 Forward the variable with a `false` default through root development/production Compose and generated project Compose, including any applicable generated dev allowlist. Add opt-in examples to root/generated environment and Worker configuration examples. Verify Compose rendering with safe fixture values and focused generator/template tests preserve disabled defaults and forward `true`.

## 3. Documentation and end-to-end verification

- [x] 3.1 Update Node, Cloudflare and applicable generated operator docs with the env switch, `/api/docs` URL, restart/redeployment instructions, public page access, unchanged JSON endpoint, API permissions and CDN network dependency. Verify all documented names and defaults match both parsers and the route tests.
- [x] 3.2 Start the supported local stack with the flag enabled and verify real browser rendering, search, operation/schema display, a direct same-origin public request and an anonymous protected-operation rejection. Restart with the flag disabled and verify API `404` while JSON still loads. Record results and restore any pre-existing local env setting without exposing credentials; do not substitute HTML-string assertions for browser verification.
- [x] 3.3 Run narrow affected tests, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm exec openspec validate optional-api-docs-ui --type change --strict`. Resolve failures and record passing checks before marking the change complete; archive only on a separate explicit request.


## Verification evidence — 2026-10-18

- All affected package suites passed: `pnpm exec turbo run test --filter=@lacecms/server --filter=@lacecms/platform-node --filter=@lacecms/platform-cloudflare --filter=create-lace -- --maxWorkers=2` (18 successful tasks). Node: 242 tests; Cloudflare: 170 tests. Workerd/Miniflare tests ran with local socket access.
- `apps/api` Worker bundle and full Worker smoke passed (4 tests). After final Scalar privacy configuration, server route suite passed again (54 tests) and bundle suite passed again (3 tests).
- Root `pnpm typecheck` passed (35 tasks plus project config), `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, strict change validation and `git diff --check` passed. Initial typecheck encountered the pre-existing generated release-version freshness/cache issue; refreshing platform builds and rerunning passed.
- Docker Compose config rendering with synthetic fixture settings verified default `false` and explicit `true` in root development, root production and a generated starter project. Generator suite passed (16 tests), including disabled defaults/forwarding.
- The Node Docker dev stack could not pull its existing MinIO image: quay.io returned HTTP 401. No image substitutions or unrelated infrastructure changes were made. Browser verification therefore used the repository's supported `pnpm dev:cloudflare` stack with local D1/R2 and its same-origin gateway at `http://127.0.0.1:8787`.
- Browser verified live methods/examples and response schema, search for `List content models`, direct anonymous setup-state GET returning `200`, and direct admin content-models GET returning `403 AUTHORIZATION_DENIED`. Worker logs confirmed both requests used the local origin; no proxy was configured. The localhost AI Agent default was explicitly disabled after browser inspection; remote fonts, telemetry, persistent auth and MCP are disabled as well.
- Restarted the supported stack with `LACE_API_DOCS_ENABLED=false`: browser displayed the API not-found envelope; HTTP checks confirmed `/api/docs` `404`, `/api/v1/openapi.json` `200` with OpenAPI 3.1.0 and request IDs on both. Stopped the temporary stack and restored the pre-test local env state. No remote Cloudflare deployment, release publication or archive was performed.
