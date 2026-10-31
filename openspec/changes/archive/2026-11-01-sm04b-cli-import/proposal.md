## Why

Moving an existing site to Lace today means retyping every page and uploading
every image by hand. SM4A added the server side (import tokens, media hashes,
exact slug lookups); this session adds the `lace import` command and its
portable package format, so a converter can produce one directory that loads
into any installation and can be rerun safely.

## Roadmap unit

Session **SM4B** of step SM4 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md).
Depends on SM4A (`sm04a-import-credentials`, archived 2026-11-01) and SM3A
(media tags). SM4C (acceptance journeys on local Node and Worker, the import
guide and generated-project notes) is a separate session.

Owner decisions (2026-11-01):

1. **Edit protection.** The state file records the draft revision each import
   wrote. When a draft was changed after that revision and differs from the
   package, the plan reports a conflict and nothing is written unless
   `--overwrite` is given. Without a state record the entry is a normal update.
2. **Offline check.** `--validate-only` validates the package against
   `lace.config.ts` with no network and no token. `--dry-run` builds the full
   plan against the server and writes nothing.

## What Changes

- **Package format v1.** A directory with `lace-import.json`
  (`formatVersion: 1`, `media[]`, `entries[]`) and the media files it names.
  Media items carry `key`, `file`, optional `alt`, `caption`, `focalPoint` and
  `tags`. Entries carry `key`, `model`, `slug` (required for collections,
  refused for pages and globals), `title` (refused for globals), `fields`,
  `blocks`, optional `seo` and `publish`. Values refer to media as
  `{"$media": "<key>"}` (media fields and the SEO image) and to entries as
  `{"$entry": "<key>"}` (URL fields; becomes `entry:<id>`). Blocks omit keys,
  positions and schema versions, which the CLI derives. A JSON Schema of the
  format ships with the CLI.
- **`lace import <dir>`** with `--url`, `--publish`, `--dry-run`,
  `--validate-only`, `--overwrite`, `--state` and `--json`. The token comes
  only from `LACE_IMPORT_TOKEN`; the URL from `--url` or `LACE_API_BASE_URL`,
  HTTPS required except for loopback hosts.
- **Pipeline.** Validate the package locally against `lace.config.ts` field
  and block descriptors (draft rules, plus publish rules for entries that will
  publish) → check the server's models and versions match → describe the
  credential → look up existing media by hash and entries by slug or
  singleton → print a plan (create / update / unchanged / conflict / publish)
  → upload media and update their metadata → create missing entries without
  entry links → save every changed draft with entry links resolved → publish
  in dependency order. Every error found before the first write stops the run
  with nothing written.
- **Idempotency and resume.** Lookups make the server the source of truth;
  the state file caches key-to-ID mappings and records written revisions. An
  unchanged draft is never saved; an unchanged published entry is never
  republished. Saves use the expected revision; publications use a
  deterministic idempotency key. `429` responses honor `Retry-After` within a
  bounded wait. An interrupted run resumes by rerunning the same command.
- **Shared normalization.** The draft normalization that the content use cases
  apply before saving moves into one pure application function, used by the
  server and by the CLI to decide "unchanged" exactly.
- **Architecture.** `@lacecms/cli` may import `@lacecms/contracts` to validate
  admin REST responses. ADR 0017 records that import is an HTTP client of the
  admin API and never writes a database directly. §6 and §12 are updated
  before code.

## Scope, Dependencies and Non-goals

CLI, a pure application helper, contracts reuse and documentation of the
command reference. Non-goals: acceptance journeys against Node and Worker
installations, `docs/content-import.md` and converter guidance, generated-
project notes (all SM4C); `lace export`; deleting or unpublishing entries or
media that the package no longer lists; importing users, settings, tokens or
block-settings media; uploading files over the 10 MiB limit or formats other
than the accepted image formats; migrating older block schema versions
(package data must use the current version); parallel uploads; server, REST,
schema or template changes.

## Capabilities

### New Capabilities

- `content-import-cli`: the `lace import` command, package format v1 and its
  JSON Schema, local validation, plan, idempotent media and entry writes,
  link resolution, ordered publication, edit protection, state file, retries,
  output and exit codes.

### Modified Capabilities

- `content-use-cases`: draft normalization before save and publish is a pure
  shared application function that clients can apply to predict the saved
  draft.

## Impact

- Packages: `@lacecms/cli` (new import modules, command dispatch, JSON Schema
  file, `@lacecms/contracts` and `valibot` dependencies),
  `@lacecms/application` (extracted `normalizeDraftCandidate`, re-exports used
  by the CLI), `scripts/check-boundaries.mjs` (new `cli -> contracts` edge).
- No REST, OpenAPI, database, migration or template change.
- Docs: `docs/mvp-architecture.md` §6 (dependency direction, CLI scope) and
  §12 (import client note); ADR 0017; CLI README command reference; roadmap
  progress log.
