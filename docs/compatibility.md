# Compatibility baseline

Lace supports `0.1.0-rc1` (ownership template `0.46.0`, npm `next`) and later
releases. Earlier prereleases (`0.1.0-alpha.1`–`0.1.0-alpha.8`) stay published
and immutable but are not supported: their databases, projects and exports
cannot be upgraded in place ([ADR 0029](adr/0029-rc1-baseline.md)).
See [Upgrading from rc1](#upgrading-from-rc1).

## Status

Lace is pre-release. This document records the initial development baseline;
it is not a promise of production support or backward compatibility.

## Exact versions selected and smoke-tested

The versions below were resolved from their authoritative release channels on
2026-09-07. They are selected as exact versions and will be pinned through the
root pnpm catalog and lockfile. The temporary smoke workspace installs this set
together on Node 24.12.0.

| Component | Exact version | Authoritative source |
| --- | ---: | --- |
| Node.js LTS | 24.12.0 | <https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt> |
| pnpm | 12.3.4 | <https://registry.npmjs.org/pnpm/latest> |
| TypeScript | 7.0.2 | <https://registry.npmjs.org/typescript/latest> |
| Turborepo | 2.10.12 | <https://registry.npmjs.org/turbo/latest> |
| OpenSpec | 1.12.0 | <https://registry.npmjs.org/@fission-ai%2Fopenspec/latest> |
| Oxlint | 1.81.0 | <https://registry.npmjs.org/oxlint/latest> |
| Oxfmt | 0.66.0 | <https://registry.npmjs.org/oxfmt/latest> |
| Hono | 4.13.7 | <https://registry.npmjs.org/hono/latest> |
| Valibot | 1.4.2 | <https://registry.npmjs.org/valibot/latest> |
| Drizzle ORM | 0.45.2 | <https://registry.npmjs.org/drizzle-orm/latest> |
| Better Auth | 1.7.3 | <https://registry.npmjs.org/better-auth/latest> |
| Astro | 7.3.1 | <https://registry.npmjs.org/astro/latest> |
| React and React DOM | 19.2.8 | <https://registry.npmjs.org/react/latest> |
| Vite | 8.2.2 | <https://registry.npmjs.org/vite/latest> |
| Wrangler | 4.129.0 | <https://registry.npmjs.org/wrangler/latest> |
| Vitest | 5.0.0 | <https://registry.npmjs.org/vitest/latest> |
| Playwright | 1.63.0 | <https://registry.npmjs.org/@playwright%2Ftest/latest> |
| better-sqlite3 | 13.0.3 | <https://registry.npmjs.org/better-sqlite3/latest> |

The source URLs identify the release channels used for selection. The committed
lockfile, once created, is the reproducible resolution record.

### Smoke result

On 2026-09-07, a disposable pnpm 12.3.4 workspace on macOS arm64 and Node
24.12.0 installed the exact baseline with a frozen lockfile. The check ran the
OpenSpec, Turbo, Oxlint, Oxfmt, TypeScript, Wrangler, Vitest, and Playwright
CLIs, then imported Astro, Better Auth, Drizzle, Hono, React, Valibot, Vite,
Vitest, and Playwright. It also created an in-memory native `better-sqlite3`
database and loaded Drizzle's `better-sqlite3` adapter successfully.

pnpm 12 blocks lifecycle scripts unless they are explicitly allowed. The smoke
workspace used an `allowBuilds` map for `better-sqlite3`, `esbuild`, `pnpm`, and
`workerd`; Step 1 MUST carry forward the least-privilege allowlist before it
adds packages that require these builds. The temporary workspace and its
dependencies are removed after this result is recorded.

## Supported runtime ranges

These are the intended MVP development targets. A range is a support policy,
not evidence that every member of the range is continuously tested.

| Boundary | Supported range | Notes |
| --- | --- | --- |
| Node.js | 24.x LTS, starting at 24.12.0 | Node runs the VPS API, builder, CLI, and local tooling. |
| pnpm | 12.x | Corepack manages the declared pnpm version. |
| SQLite | 3.35 or later | Node uses `better-sqlite3`; Cloudflare D1 compatibility is verified separately in its runtime milestone. |
| Wrangler | 4.x | Cloudflare development and deployment tooling. |
| Browsers | Current and immediately previous stable Chrome, Edge, Firefox, and Safari | Applies to the future admin SPA; browser-flow coverage is introduced with the admin milestones. |

## CI-used versions

Step 1 configures GitHub Actions CI with Node 24.12.0 and pnpm 12.3.4 through
Corepack. CI restores a pnpm-store cache keyed by operating system, those exact
versions, and `pnpm-lock.yaml`; it does not cache `node_modules`.

Every CI run installs with `pnpm install --frozen-lockfile`, verifies that the
lockfile remains unchanged, then invokes the same root quality commands used
locally: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and `pnpm spec:validate`.

### Dependency-boundary compatibility bridge

`dependency-cruiser` is intentionally not installed, configured, or run in
Step 1: version 18.2.0 supports TypeScript releases below the project-pinned
TypeScript 7.0.2 baseline. The root lint command therefore runs a temporary
TypeScript source-level boundary checker. It rejects forbidden architecture
edges, cycles, cross-package source-path access, and Node built-ins in the
portable `content` and `config` packages.

Replace this checker with dependency-cruiser only after a dependency-cruiser
release supports parsing TypeScript 7 without lowering the project's TypeScript
baseline. That migration must retain the same boundary checks and negative
fixture coverage.

## Release line

Lace artifacts are prereleases on the npm `next` channel. One release
definition (`release/alpha.json`) pins the package, generator and API/builder
image version together with the generator's ownership template version;
mixing artifacts from different versions is unsupported.

| Release | Template | Status |
| --- | --- | --- |
| `0.1.0-rc1` | `0.46.0` | Oldest supported release |

The source tree's template (`0.47.0`) belongs to the next release; it is not
published until a release session selects and publishes that candidate. A
version is recorded in `publishedVersions` only after the owner publishes it.

## Minimum requirements and tested versions

Engine declarations state minimums only. The repository root, the generated CMS
`package.json` and every public Lace package declare Node `>=24.12.0`; the root
and generated CMS also declare pnpm `>=12`. Release validation
(`scripts/release-model.mjs`) rejects any other declaration, including the
former `<25`/`<13` upper bounds. Doctor evaluates the consumer project's own
declaration, so a project that keeps an explicit upper bound is still held to it.

A version that satisfies a minimum is **eligible**, not tested. Reproducibility
pins are separate and unchanged by the minimums:

| Pin | Value | Where |
| --- | --- | --- |
| Tested Node | `24.12.0` | CI workflows, `node:24.12.0-bookworm-slim` API/builder images, release preparation |
| Tested pnpm | `12.3.4` | `packageManager` (root and generated CMS), API/builder images |
| Dependencies | exact versions | `pnpm-lock.yaml` and the workspace catalog |

Dependency engine audit (2026-10-06, resolved lockfile metadata): Astro 7.3.1
`>=22.12.0`, better-sqlite3 13.0.3 `>=22`, Wrangler 4.129.0 and Miniflare
`>=22.0.0`, Vite 8.2.2/8.3.0, Oxlint 1.81.0 and Oxfmt 0.66.0
`^20.19.0 || >=22.12.0`, `@aws-sdk/client-s3` 3.1133.0 `>=20.0.0`, OpenSpec
1.12.0 `>=20.19.0`, TypeScript 7.0.2 `>=16.20.0`, Hono `>=16.9.0`, workerd
`>=16`; Better Auth, Drizzle ORM and Turbo declare none; pnpm 12.3.4 declares
Node `>=18.*`. Nothing requires more than Node 24.12.0. Vitest 5.0.0 declares
`^22.12.0 || ^24.0.0 || >=26.0.0`, so Node 25 is eligible for consumers but not
for running this repository's test suite. Engine metadata alone is not runtime
certification.

A newer Node or pnpm major enters the tested matrix only after a recorded check
on that exact version: frozen install of the workspace and a packed generated
consumer, native `better-sqlite3` loading, CLI generation and `lace doctor`,
`pnpm build` of a generated site, and the relevant runtime smoke (Node API
readiness; local Worker bundle and `cf:dev` for Cloudflare). Record the exact
version, platform, date and passing scope here. Adding a tested major does not
change the minimums or the pins above, and it is never real-account
verification.

## Baseline refresh policy

Refreshes must resolve current stable releases from the listed sources, run the
disposable smoke check on the selected Node LTS, update the catalog and lockfile
together, and record the new selection date. Framework major upgrades require
test and migration review, as required by the architecture dependency policy.

## Public contract evolution

The public delivery contract (`/api/v1/public/*` responses and the build
export) evolves under one policy.

- **Compatible (no version change):** adding an optional key, or a key older
  consumers may ignore, to a public response, a public entry, block, global,
  media item or the build export. `@lacecms/sdk` parses responses with
  tolerant schemas that ignore and remove unknown keys, so a site build keeps
  working against a newer API of the same line.
- **Breaking:** removing a key, changing its type, or changing the meaning of
  a value consumers rely on. Such a change requires a new build-export
  `formatVersion` (for the export) or `/api/v2` (for REST responses).
- **Version pairing:** within one major line, the API must be the same or a
  newer minor than the site's `@lacecms/sdk`. A newer SDK may rely on keys an
  older API does not send.
- **Strict by design:** rich-text grammar, block `schemaVersion` matching and
  block data validation do not tolerate unknown values; they are safety and
  rendering contracts. Upgrading block definitions or the rich-text format
  still requires matching site packages.
- **Server output stays strict:** the API validates every public response
  with strict schemas, and the generated OpenAPI document describes them with
  `additionalProperties: false`. External clients generated from that
  document should nevertheless ignore unknown properties, because later
  releases of the same line may add them.
- **Error codes stay open:** `LaceHttpError.code` is typed
  `LaceErrorCode | (string & {})`, so an error code introduced by a newer API
  is reported instead of failing as a contract violation. Code that assigns
  `code` to a `LaceErrorCode` variable must narrow it first.

The build export carries `formatVersion` (currently `2`, with internal-link
manifests). The SDK declares the highest format it supports and rejects a
newer export with `LaceUnsupportedExportFormatError`; the published-site
loader reports it as `invalid_export` with advice to upgrade `@lacecms/sdk`.

### Build-export paging

- `GET /api/v1/public/build-export` returns a first page `{formatVersion,
  version, entries, globals, seo, media, nextCursor?}`; requests with
  `?after=<nextCursor>` return continuation pages `{formatVersion, version,
  entries, media, nextCursor?}`. An optional `limit` (1–100, default 100)
  caps entries per page, and the server also ends a page at a fixed
  stored-JSON byte budget, always delivering at least one entry.
- Sites that use the published-site loader, `getSite()`, `LaceBlocks` or
  `client.getBuildExport()` follow every cursor through the SDK and receive
  one assembled export. Code that reads the raw REST export must follow
  `nextCursor` until it is absent and merge the pages' `entries` and `media`;
  `globals` and `seo` come from the first page.
- A continuation request whose cursor was issued before a publication fails
  with `409 BUILD_EXPORT_VERSION_CHANGED` and details `{expectedVersion,
  actualVersion}`. `client.getBuildExport()` then restarts from the first
  page, at most two traversals in total (`restart: false` disables this). The
  published-site loader disables restarts when
  `LACE_EXPECTED_PUBLISHED_VERSION` is set and reports the conflict as
  `version_mismatch`; without it, exhausted restarts also fail with
  `version_mismatch`, stating that content kept changing during the export.
- `If-None-Match` applies to the first page only; continuation pages ignore it
  and every `200` page carries the strong ETag of its version.
- The page byte budget (4,000,000 stored bytes) is sized for the Workers Free
  plan's 128 MB memory and 50 D1 queries per invocation; staying within its
  10 ms CPU limit is best effort, because one maximal entry can exceed it on
  its own page.

## Upgrading from rc1

The database starts from one baseline migration that replaces every earlier
migration, so a database created by rc1 cannot be migrated:
`lace db migrate` and `lace doctor` report `SCHEMA_UNSUPPORTED` for it and
change nothing ([database migrations](database-migrations.md)).

1. Keep the content you need in your own source files for `lace import`, or
   plan to re-enter it. Back up `lace.config.ts`, site source, package/lock
   files, deployment settings, the database and media objects.
2. Upgrade every Lace engine, CLI, SDK/render/Astro/site package and both API
   and builder images together. Review managed-file conflicts with the
   template upgrade plan and merge user-owned site and deployment changes
   explicitly.
3. Recreate the database. Compose: stop `api` and `dispatcher`, remove
   `.lace/data/lace.sqlite` with its `-wal` and `-shm` files, then run
   `pnpm db:migrate`. Local Cloudflare: remove `.lace/data/cloudflare` and run
   `pnpm cf:db:migrate`. Remote Cloudflare: create a new D1 database, update
   `LACE_D1_DATABASE_ID` and the Worker binding, then run
   `pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`.
4. Run `pnpm content:sync` (or the selected Cloudflare target), then
   `pnpm auth:bootstrap`, complete first-administrator setup and restore the
   content.
5. Rebuild the site and check it on the selected runtime before relying on it.
   Local acceptance is not a real deployment check.

Built-in blocks keep their definition versions and declare no migrations;
build exports use format 2 only. Rollback means returning to the backed-up
rc1 packages, images, configuration, source, database and media together; a
package-only downgrade is not supported.
