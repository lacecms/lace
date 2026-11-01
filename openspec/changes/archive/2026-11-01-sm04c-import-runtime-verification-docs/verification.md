# Verification: sm04c-import-runtime-verification-docs

Date: 2026-11-01. Source: `cc74a9e` plus this change's uncommitted working tree.
Node 24.12.0 (pinned for the root suite), pnpm 12.3.4, Docker available.
Workspace source verification only; no release candidate artifacts were built.

| Check | Result |
| --- | --- |
| `pnpm exec vitest run --config vitest.cross-runtime.config.mjs` (Docker MinIO, local D1/R2) | pass: 3 files / 5 tests, including `tests/content-import.acceptance.mjs` on Node and Worker |
| `tests/video-embed.acceptance.mjs` after the fixture `config` option | pass on both runtimes |
| `pnpm exec vitest run tests/content-import-sample.test.mjs` | pass: 3 tests (sample valid, broken copy fails with exit 4, guide JSON equals the file) |
| `pnpm acceptance:starter` | pass, including `import-sample-validate` with the packed CLI |
| `pnpm acceptance:cloudflare` | pass, including `cloudflare-import-first` / `-rerun` against `wrangler dev` |
| `node scripts/generated-project-acceptance.mjs node` (Docker Compose) | pass, including `node-import-first` / `-rerun` |
| `node scripts/generated-project-acceptance.mjs snapshots --update` | six snapshots refreshed; byte-stable on two regenerations |
| `pnpm turbo run test --filter=create-lace` | pass: 5 files / 64 tests |
| `tests/consumer-guides.test.mjs`, `tests/generated-project-acceptance.test.mjs` | pass: 8 tests |
| `pnpm docs:check` | pass: 20 pages, local links and resources (sample files in `dist/examples/content-import`) |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | pass |
| `pnpm test` (root) | pass |
| `pnpm build` | pass |
| `pnpm acceptance:existing-site` | pass |
| `pnpm openapi:check` | pass (no REST change) |
| `pnpm spec:validate`, `openspec validate sm04c-import-runtime-verification-docs --type change --strict` | pass (85 items; change valid) |

## Journey coverage

The cross-runtime journey ran the built CLI as a process (only `PATH` and
`LACE_IMPORT_TOKEN` in its environment) against the starter configuration with
real image inspection, MinIO or R2 storage and rate limiters. On both runtimes:
offline validation; a dry run with no change to media, revisions or builds; a
token without publishing refused for `--publish` (exit 6) with nothing written;
the first `--publish` run (two uploads with matching SHA-256, tags, alt,
caption, focal point and 1200×800 dimensions; two posts created; links resolved
to `entry:<id>` in a URL field, hero data, navigation block list and SEO image;
all five entries published, link targets first; published export and public
media bytes); reruns with and without the state file with an all-`unchanged`
plan and unchanged media, revisions, publications and build history; an admin
edit reported as `conflict` (exit 2) with nothing written, `--overwrite`
restoring the package values, then an unchanged rerun; a revoked token refused
(exit 6); no token in any stdout or stderr. Canonical plans, final drafts and
published exports were equal on Node and Worker.

## Defects

- No `lace import` CLI or server defect was found.
- Pre-existing, fixed here: `scripts/alpha-eight-acceptance.mjs` still created
  a `videoEmbed` block at schema version 1 after SM1 raised the block to
  version 2, so `pnpm acceptance:cloudflare` failed at `cloudflare-alpha-eight-mcp`
  before reaching the import smoke. The fixture now uses version 2.

## Not run

- `pnpm acceptance:generated` (phase `all`) and `acceptance:release`: only the
  `node` phase, which contains the import smoke, was run. Later journeys in the
  full suite now start from a project whose Home, settings and navigation were
  replaced by the sample import; their assertions were reviewed as tolerant
  (for example, at least two published entries) but not executed.
- Real `429` responses, remote Cloudflare and VPS installations (see
  `docs/content-import.md`).
