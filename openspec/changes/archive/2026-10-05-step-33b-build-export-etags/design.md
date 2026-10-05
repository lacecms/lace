## Context

See proposal.md. Contracts currently recognize only strong tags; the server already compares numeric versions, and SDK/loader store strings. The same version parser also serves mutation If-Match.

## Goals / Non-Goals

Support compression rewrites with strict numeric validators and safe diagnostics. Retain mutation concurrency behavior, portability and package dependency direction. No schema migration, platform configuration changes or custom fetch workaround.

## Decisions

- Contracts broaden entityTagSchema to an optional uppercase W/ prefix and a safe decimal integer. versionFromEntityTag removes that prefix; entityTagForVersion continues emitting strong tags and rejects unsafe versions. resolveExpectedRevision explicitly rejects weak If-Match. Arbitrary HTTP opaque validators, lists and wildcards remain outside the existing contract.
- The server uses the shared validator and weak numeric comparison; authorization stays first and matching reads skip export loading. A loaded export supplies its own response ETag, avoiding a stale tag if publication advances between version lookup and payload load.
- SDK preserves exact tags, checks 200 tag/payload and 304 tag/prior versions, and diagnoses header failures using a token-redacted, escaped preview capped at 80 characters. Do not include response bodies in these errors. The loader updates its stored tag on successful 304 while reusing its immutable site; failed reads retain the previous state.
- Regression tests cover schemas and mutation isolation, headers on 200/304, auth and publication transitions in real SQLite Node and local D1 Worker compositions, export-load short circuit and publication race, and default fetch behind a gzip HTTP proxy for static and dev loaders. Compression adds W/ at the proxy, reproducing documented Cloudflare behavior: https://developers.cloudflare.com/cache/reference/etag-headers/.
- Reject accepting arbitrary tags, stripping all validation, forcing identity encoding or changing generated loader fetch: these hide contract failures or impose consumer workarounds.

## Risks / Trade-offs

- A proxy may remove ETag entirely → actionable missing-header error rather than guessing a version.
- Malformed headers can echo credentials → redact the configured token before truncation and escape controls; tests inspect errors.
- Real Pages compression depends on account configuration → local wire-level evidence completes 33B; real Pages evidence stays in 33H/34C.

## Migration Plan

No database migration. Ship compatible contract/SDK/server packages together; older strong-only servers still handle strong client reads. Rollback restores the prior package release and its documented compression limitation.
