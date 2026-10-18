## Why

Lace already generates OpenAPI but offers only raw JSON, making API discovery and manual requests inconvenient. Operators need a browser reference served by Lace that they can explicitly enable through environment configuration.

This is an operator-requested standalone session unit, `optional-api-docs-ui`, outside the numbered editor backlog. It extends architecture §12 (versioned REST contracts and generated OpenAPI) and the portable composition boundary without changing those invariants.

## What Changes

- Add a Scalar API reference at `GET /api/docs`, reading `/api/v1/openapi.json` from the same origin.
- Add `LACE_API_DOCS_ENABLED`: absent or `false` disables the UI; `true` enables it. Reject other supplied values during startup with a diagnostic naming only the variable.
- Support the same setting in Node and Cloudflare and pass a normalized optional boolean to the shared server factory.
- Return the existing API not-found response when disabled, including behind the development gateway and static asset fallback.
- Preserve API authorization for interactive requests and the existing always-available JSON document.
- Document activation, restart/redeployment, public accessibility when enabled, and the browser's pinned Scalar CDN dependency.

## Capabilities

### New Capabilities

- `api-documentation-ui`: Optional server-hosted browser API reference, runtime environment selection, direct API requests, and disabled-route behavior.

### Modified Capabilities

None. Existing `hono-app-factory`, `node-api-composition`, and `cloudflare-worker-composition` behavior remains applicable; the new capability adds an opt-in route.

## Impact

Affected areas: `packages/server` route composition and tests; Node runtime settings/composition; Cloudflare settings/Worker composition; development and generated Compose environment forwarding; env examples and operator documentation. Add a catalog-pinned `@scalar/hono-api-reference` dependency and a browser bundle URL pinned to an exact compatible version. No schema migration, SDK contract change, separate documentation service, or generated-contract duplication.

Non-goals: changing OpenAPI coverage, gating the existing JSON endpoint, documentation-specific login or permissions, automatic sign-in or credential injection, a request proxy, custom themes, offline asset distribution, and release publication. Interactive API requests use existing credentials and permission checks. Implementation depends on the existing OpenAPI endpoint and runtime parsers; it must verify actual browser rendering in the supported local stack.
