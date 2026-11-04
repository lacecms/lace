# Content import (internal)

Maintainer notes for `lace import`. The user guide, format reference and
converter guide are public:
[Import content](../apps/docs/src/content/docs/en/latest/editing-content/import.md).
Accepted behavior lives in `openspec/specs/content-import-cli`; the decisions
are [ADR 0016](adr/0016-import-credentials.md) (import tokens) and
[ADR 0017](adr/0017-content-import-client.md) (import is an admin REST client).

## Invariants

- Import is an HTTP client of the admin REST API. It never opens a database or
  object storage, so every write passes the server's validation, media
  inspection, link guards, build requests and audit identity on Node and on
  the Worker alike.
- It creates and updates; it never deletes, unpublishes, or touches users,
  settings or tokens. The Bearer import token reaches only the fixed admin
  route allowlist.
- "Unchanged" uses the shared `normalizeDraftCandidate`, so the CLI and the
  server must be the same release. The server's model and block versions must
  equal the local `lace.config.ts`.
- The token comes only from `LACE_IMPORT_TOKEN` and never appears in output,
  the state file or diagnostics.
- Conditional fields need no import-specific handling: `--validate-only` and
  the server apply the same `visibility` rules
  ([ADR 0018](adr/0018-conditional-fields.md)). Fill a target only when its
  controller selects it. A hidden value is validated as a draft value, kept in
  the draft and never published, so `--publish` succeeds without hidden
  required fields.

## Sample package

`apps/docs/public/examples/content-import/` is the single sample: the public
page shows its JSON, the docs site serves it for download, and every
verification tier imports it. It targets the starter template configuration.
`tests/content-import-sample.test.mjs` (root suite, CI) validates it with the
built CLI against `packages/create-lace/templates/lace.config.ts` and requires
the guide's JSON block to equal the file. Change the sample, the guide and the
starter configuration together.

## Verification tiers

| Tier | Command | Runs in CI | Covers |
| --- | --- | :---: | --- |
| Sample validity | `pnpm test` (root) | yes | Sample against the starter models; guide equality |
| Packed offline check | `pnpm acceptance:starter` | yes | `pnpm exec lace import --validate-only` with the packed CLI |
| Cross-runtime journey | `pnpm exec vitest run --config vitest.verification.config.mjs --project cross-runtime tests/content-import.acceptance.mjs` (Docker for MinIO) | no | Full matrix below on Node and the local Worker composition |
| Packed Node smoke | `pnpm acceptance:generated` / `acceptance:release` (Docker Compose) | no | Packed CLI imports the sample into the Compose API; rerun unchanged |
| Packed Worker smoke | `pnpm acceptance:cloudflare` | no | Packed CLI imports the sample into `wrangler dev`; rerun unchanged |
| Unit and in-process | `pnpm turbo run test --filter=@lacecms/cli` | yes | Format, references, plan, apply, state, retries, exit codes |

The cross-runtime journey (`tests/content-import.acceptance.mjs`) runs the
built CLI as a process with only `PATH` and `LACE_IMPORT_TOKEN`, against
`openProductRuntime(kind, {config})` with the starter configuration: tokens
issued and revoked through REST, `--validate-only`, a dry run that changes
nothing, a token without publishing refused for `--publish`, the first
`--publish` run (bytes, SHA-256, tags, metadata, resolved links, publication
order, published export, public media bytes), reruns with and without the
state file that change no media, revision or build, an admin edit reported as
`conflict` (exit 2) then `--overwrite`, a revoked token (exit 6) and no token
in any output. Canonical plans, drafts and exports must be equal on both
runtimes.

The packed smokes run last in their journeys (the Cloudflare one after every
export baseline comparison) because the import replaces Home, settings and
navigation drafts.

## Not covered

- Real `429` responses: the upload limit is 30 per minute per user and a test
  would wait a minute. `Retry-After` handling is unit-tested with an injected
  clock.
- Resuming a run killed mid-write against a real runtime: covered in process by
  `import-apply.test.mjs`.
- Remote Cloudflare and VPS installations: part of the release gate, like other
  real-account checks.
