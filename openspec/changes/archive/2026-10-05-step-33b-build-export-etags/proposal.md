## Why

Session 33B fixes the alpha.2 build failure when Cloudflare compression turns a strong build-export validator into a weak one. The SDK currently rejects that supported HTTP form.

## What Changes

- Accept one version-derived strong `"N"` or weak `W/"N"` validator, with a safe non-negative integer version; retain strict rejection of arbitrary tags, lists and wildcards.
- Preserve the received validator in SDK results and subsequent conditional reads; compare versions for build-export `If-None-Match` on both runtimes.
- Keep mutation `If-Match` strong-only and provide bounded, redacted missing/malformed response-header diagnostics.
- Verify contracts, SDK, runtime publication transitions and standard loaders through a real local compressing HTTP proxy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: supported version-derived validator forms and strong-only mutation preconditions.
- `hono-app-factory`: weak comparison for conditional build exports.
- `public-sdk`: validator preservation and actionable safe header diagnostics.
- `published-site-loader`: conditional reuse through response compression.

## Impact

Architecture §§4.5, 6, 12, 13.1–13.4 remain intact. Affects contracts, SDK and regression tests at server, Node, Worker and Astro boundaries. Depends on the existing published-state version and loaders; no migrations, dependencies or credential changes. Sessions 33C–33H and real Pages evidence (33H/34C) are excluded; no production account deployment is required for 33B.
