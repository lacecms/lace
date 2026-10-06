# Session 33B — Build-export ETag acceptance

Completed 2026-10-05 on `codex/step-33-alpha2-field-trial-fixes`.

## Delivered behavior

- Shared validators accept one strong `"N"` or weak `W/"N"` tag with a safe non-negative integer version. The SDK returns and sends the received spelling unchanged. Arbitrary tags, lists, wildcards, malformed prefixes, fractions and unsafe integers remain invalid. Mutation `If-Match` remains strong-only.
- Node and Worker compare the numeric published-state version for conditional reads. Authorized matching reads return an empty `304` without loading the full export. Publication advances the version and the next conditional read returns `200` with new published content. Origin responses emit strong tags; `200` tags derive from the loaded export so an intervening publication cannot cause a header/payload mismatch.
- SDK header errors distinguish missing and malformed ETags, explain the supported forms and next action, and show an escaped preview capped at 80 input characters after token redaction. Export bodies and credentials are omitted. Response validators are checked against the export or prior conditional version.
- Dev revalidation retains the latest successful response validator even when a `304` changes its strength. Failed revalidation retains the previous state for retry. Static loaders still share one export across routes.

## Verification

- Contracts: safe strong/weak parsing and derivation, unsupported headers and mutation precondition isolation.
- SDK: both strengths on `200` and `304`, exact header preservation, missing/malformed diagnostics including controls, long values and echoed tokens, version mismatches and retry after a malformed response.
- Server: weak conditional reads skip export loading; a publication injected between the version lookup and payload load produces an ETag matching the returned version.
- Node composition: an actual HTTP listener with SQLite verifies strong/weak `304`, authorization, invalid tags, weak mutation rejection and `200` after publication with updated content.
- Worker composition: local Miniflare D1 exercises the same conditional/publication and authorization transitions.
- Published-site and Astro loaders: static and dev modes use global fetch through a separate local HTTP origin and gzip proxy. Requests negotiate gzip normally; the proxy compresses actual JSON bytes and changes the `200` tag to weak. Dev calls traverse weak `200` → strong `304` → post-publication weak `200` → strong `304`; static mode reads once and concurrent first calls share one request. No custom fetch or identity-encoding override is supplied.

Commands:

```sh
pnpm --filter @lacecms/contracts test
pnpm --filter @lacecms/sdk test
pnpm exec vitest run packages/server/src/app.test.mjs apps/api/src/node-server.test.mjs packages/platform-cloudflare/src/worker.test.mjs packages/astro/src/index.test.mjs --maxWorkers=2 --exclude '.release-artifacts/**'
pnpm typecheck
pnpm lint
pnpm format:check
pnpm openapi:check
pnpm exec openspec validate step-33b-build-export-etags --type change --strict
```

Local listener and Miniflare tests require permission to bind local sockets when run under the Codex filesystem/network sandbox. These targeted suites contain 138 passing tests in total. Root typecheck, Oxlint/boundary checks, Oxfmt, OpenAPI drift check and strict OpenSpec validation pass.

## Remaining release evidence

A real Cloudflare Pages build using the packaged release and default compression belongs to sessions 33H/34C and was not executed for 33B. The local proxy reproduces the strong-to-weak conversion documented in [Cloudflare ETag behavior](https://developers.cloudflare.com/cache/reference/etag-headers/); it does not establish production account configuration or deployment success.
