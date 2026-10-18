## Context

See proposal.md for motivation and scope. Architecture §12 requires OpenAPI generation from shared contracts. `packages/server/src/app.ts` already serves `/api/v1/openapi.json` and excludes `/api/*` from admin fallback. `apps/api/src/node-server.ts` keeps that namespace local through the development gateway. Worker routing also prioritizes it over assets. Node parses settings in `packages/platform-node/src/runtime.ts`; Cloudflare does so in `packages/platform-cloudflare/src/settings.ts`, with composition in `worker.ts`. Compose explicitly forwards environment settings, so adding a parser alone would not enable the feature for local operators.

## Goals / Non-Goals

Goals: implement one optional portable route with consistent runtime configuration, reuse live contracts, and verify both disabled routing and browser behavior.

Non-goals: see proposal.md. No persistence, transaction, migration, or background-work changes are needed.

## Decisions

1. **Use Scalar's Hono integration in the shared server package.** Add an optional `apiDocsEnabled?: boolean` factory input (absence means disabled), and register `GET /api/docs` only when true, before the final not-found handler. Supply `/api/v1/openapi.json` to Scalar. Retain normal request logging middleware and exclude the presentation route from generated API operations if the generator otherwise includes it. Keep navigation hash-based so nested page routes are unnecessary. A separate frontend service would add deployment overhead; a handcrafted viewer would duplicate established functionality.

2. **Parse exact string booleans at runtime boundaries.** Add the setting to Node settings and Worker environment/settings, forwarding the normalized boolean at composition. Reuse existing sanitized failure conventions. Keep the shared HTTP package independent of process.env and Worker types. Accepting generic truthiness would accidentally enable the page for `false`; accepting a larger boolean vocabulary has no benefit here. Empty strings are invalid; Compose must therefore supply `false` as its default.

3. **Use an exact-version browser CDN bundle.** Pin the integration package in the pnpm catalog and the compatible `@scalar/api-reference` bundle in its configured jsDelivr URL; choose and verify exact versions during apply. The server serves HTML; the browser needs CDN access for rendering. Disable default remote fonts, telemetry, persistent authentication, and optional hosted integrations; configure no request proxy. Use the current origin for API execution and verify it in a browser. Do not interpolate request headers, environment values, credentials, or unescaped metadata into executable page content. Bundling the full browser application into both runtime artifacts would add asset distribution and Worker packaging work beyond this small opt-in feature. This limitation must be prominent in operator docs.

4. **Keep the existing JSON endpoint independent.** It is already anonymous and contains contract metadata. Enabling the UI grants no API permission. Do not add automatic login, inject credentials, or change the published API's authentication contract. Same-origin session behavior must be checked for the chosen pinned viewer; anonymous protected calls must still fail.

5. **Wire supported operator paths.** Forward the variable with a `false` default in root development/production Compose and generated project Compose. Add commented opt-in examples to root/generated environment examples and Worker vars documentation without turning it on in generated projects. Inspect existing template/dev generation paths for any additional explicit environment allowlist and test forwarding there. Document restart/recreation or Worker redeployment. Update `docs/node-api.md`, `docs/cloudflare-worker.md` and relevant generated operator documentation.

## Risks / Trade-offs

- CDN blocked or unavailable → UI cannot render; document the dependency and preserve the machine-readable JSON route. No server request is made to the CDN.
- CDN code executes at the API origin → pin the precise asset version, disable unnecessary external features, and require deliberate operator enablement. Treat upgrades as dependency changes.
- API request target or cookie handling differs across viewer versions → verify public and protected requests in the supported browser workflow before completion.
- Compose drops the variable → verify explicit forwarding in root and generated manifests with safe test environment values.
- New dependency affects Worker packaging → run the existing Worker bundle smoke and package boundary checks.

## Migration Plan

No migration. Deploy updated packages/images with the setting absent or `false` to preserve default behavior. Set `LACE_API_DOCS_ENABLED=true` and restart/recreate the Node service or redeploy the Worker to enable. Disable with `false` and restart/redeploy to restore the standard API `404`. Implementation and validation precede any separately requested release/publication.

## References

- Scalar Hono integration, CDN version pinning: https://scalar.com/products/api-references/integrations/hono
- Viewer configuration, persistence, telemetry, fonts and direct fetch: https://scalar.com/products/api-references/configuration
