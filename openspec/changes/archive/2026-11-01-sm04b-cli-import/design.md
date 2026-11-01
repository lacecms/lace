## Context

See proposal.md for motivation and owner decisions. Current state that shapes
the approach:

- SM4A gives the CLI everything it needs on the server: a Bearer import token
  accepted on a fixed allowlist (content models, entry list/create/read/draft
  save/publish, media list/upload/read/metadata update, import-credential
  description), `?slug=` on collection entry lists, `?sha256=` on media lists,
  and a SHA-256 recorded for every new upload.
- Page and global singletons are created by `content sync`; creating a global
  through the API fails with `CONTENT_MODEL_CARDINALITY_CONFLICT`, and a second
  page entry fails with `CONTENT_PAGE_SINGLETON`. The import therefore only
  creates collection entries.
- Draft mode lets required fields and `minItems` be unsatisfied; publish mode
  enforces them. Publication requires every delivered `entry:` link target to
  have a published route; hidden blocks do not block it.
- `ContentUseCases.validateDraft` (`packages/application/src/content-use-cases.ts`)
  runs `validateEntryAggregate`, rebuilds blocks with positions, normalizes SEO
  with `normalizeEntrySeo` and replaces a global's title with its label
  (`globalTitle`). Link and media existence checks follow on the same path.
- `@lacecms/cli` may import only `application`, `config` and `platform-*`
  (`scripts/check-boundaries.mjs`, architecture §6). It loads `lace.config.ts`
  by dynamic import from the working directory (`projectConfiguration` in
  `commands.ts`) and reports results through `presentResult` and
  `failureDiagnostic`.
- The upload rate limit is 30 per minute per user; every response carries
  `Retry-After` on `429`.

## Goals / Non-Goals

**Goals:** a deterministic pipeline whose every pre-write error leaves the
installation untouched; exact "unchanged" detection so reruns are no-ops; no
new server surface; testable modules with a fake HTTP server.

**Non-Goals:** concurrency, partial imports by key filter, automatic retries
other than `429`, converting from any specific CMS.

## Decisions

### D1. The CLI is an HTTP client of admin REST, never a database writer

Import works the same on Node, local Worker and remote Cloudflare, runs every
write through the server's use cases (validation, media verification, link
guards, build requests, audit identity) and needs no database or storage
credentials. ADR 0017 records this. Rejected: writing through the platform
repositories like `content sync` (would bypass media verification and object
storage, and needs remote D1 plus R2 credentials).

### D2. Module layout in `packages/cli/src`

| Module | Responsibility |
| --- | --- |
| `import-command.ts` | argument parsing, usage, settings, orchestration, result presentation |
| `import-format.ts` | Valibot schema of format v1, structural validation with JSON Pointers |
| `import-files.ts` | safe path resolution (`realpath` inside package root, regular file, size), byte reading, MIME detection, SHA-256 |
| `import-references.ts` | descriptor-driven walk over fields, groups, lists, block data and SEO: finds `$media`/`$entry`, reports misplaced ones, rewrites them (placeholder, resolved, or stripped) |
| `import-validate.ts` | local model/block validation through `normalizeDraftCandidate` in draft and publish modes |
| `import-client.ts` | fetch wrapper: origin, Bearer header, `429` handling, response validation with contracts schemas, sanitized errors |
| `import-plan.ts` | lookups, state verification, media/entry/publication plan, conflict and cycle detection |
| `import-apply.ts` | ordered writes and state updates |
| `import-state.ts` | state file read/atomic write (`atomicWrite` from `upgrade-files.ts`) |

`bin.ts` dispatches `argv[0] === "import"` before `parseArguments`, like
`upgrade` and `add block`. `--help` prints `importUsage`.

### D3. Shared normalization in application

Extract the pure part of `validateDraft` into exported
`normalizeDraftCandidate({model, blocks: registry, draft, mode})` returning
`{title, slug?, fields, blocks, seo?}`; `validateDraft` calls it and keeps the
media and link checks. The CLI calls it twice per entry: with placeholder
references (local validation; publish mode for entries that will publish) and
with resolved references (comparison). "Unchanged" is
`canonicalizeJson(candidate) === canonicalizeJson(currentDraft projection)` over
title, slug, fields, blocks (key, position, type, schemaVersion, data,
settings, hidden, anchor, className) and SEO. Application re-exports what the
CLI needs from domain and content (`encodeEntryLink`, `canonicalizeJson`,
`normalizeMediaTags`, `normalizeMediaText`, `isMediaFocalCoordinate`), alongside existing
`detectMediaMimeType` and `MAX_MEDIA_BYTES`. Rejected: a CLI-side copy of the
normalization (silent drift makes reruns save forever) and server-side
"save if changed" (needs a new REST contract).

Placeholders: media references become `import-media-<key>`, entry references
`entry:import-entry-<key>`; both are valid identifiers, and draft validation
does not check existence.

Admin DTOs list every SEO value of an SEO-enabled model with `null`s (and
`noindex: false`), while the normalized candidate omits unset values; the
comparison maps both to one form in which an all-empty group equals no group.

### D4. Contracts dependency

The CLI validates every response with the exported contract schemas
(`contentModelListSchema`, `contentEntryListSchema`, `adminContentEntrySchema`,
`mediaListSchema`, `mediaMetadataSchema`, `updateMediaMetadataResultSchema`,
`publishContentEntryResultSchema`, the import-credential schema and the error
envelope) and builds bodies with the request schemas. This adds the edge
`cli -> contracts` (architecture §6, boundary checker). `valibot` becomes a
direct CLI dependency for the format schema, and `@valibot/to-json-schema` a
dev dependency for generating the JSON Schema.

### D5. JSON Schema artifact

`packages/cli/schema/lace-import.schema.json` is generated from the Valibot
format schema by `scripts/generate-import-schema.mjs` and committed; a test
regenerates it in memory and fails on drift, like `openapi:check`. The
package `files` include `schema`, and `exports` maps
`./lace-import.schema.json`. The schema cannot know project models, so it
describes structure only; model validation stays in the CLI.

### D6. Block keys and positions

Blocks without `key` get `b<n>` (1-based position); explicit keys are kept.
Positions are 1-based array indexes (the domain requires positive, strictly
increasing positions); `schemaVersion` is the registry's current version. Stable derived keys keep reruns unchanged and keep internal-link
manifest `sourceKey`s stable as long as block order is.

### D7. Plan algorithm

1. Read credential; read content models and compare kinds, model versions,
   allowed blocks and block versions with the local projection.
2. Media: hash each file; verify a state mapping with `GET media/:id`
   (same `sha256`, status active), else `GET media?sha256=&sort=createdAt&limit=1`.
   Compare supplied metadata with the DTO (tags as normalized sets).
3. Entries: for pages/globals list the model (exactly one item expected); for
   collections list with `?slug=` (0 → create, 1 → match, >1 → error). Verify a
   state mapping by `GET entries/:id` (same model; for collections also the
   same draft slug, otherwise fall back to the slug lookup). Read each matched
   entry's full draft.
4. Resolve entry references with known IDs; compute candidates; classify
   `create/update/unchanged/conflict` (D8).
5. Publication: set P = entries with `publish !== false` under `--publish`
   whose final draft will differ from the published version (no `published`,
   status `changed`, or a planned save). Edges: delivered references from E to
   T where T has no published version. T outside P → error; topological sort
   with keys as tie-breaker; cycle → error with the cycle's keys.
6. Fail with all collected pre-write errors, else print the plan.

### D8. Edit protection with the state file

State shape:

```json
{"formatVersion": 1, "targets": {"https://cms.example.com": {
  "media": {"hero": {"id": "…", "sha256": "…"}},
  "entries": {"about": {"id": "…", "model": "about", "revision": 7}}}}}
```

`conflict` = recorded entry with the same ID, `draft.revision !== recorded`,
and candidate ≠ draft. After each create, save or unchanged confirmation the
record stores the resulting draft revision. Publication does not change it.

### D9. Write order and failure handling

Sequential, one request at a time. Media: `POST /media` (multipart `file` with
the basename, `tags` parts) then, when `alt`, `caption` or `focalPoint` are
supplied, `GET media/:id` for the ETag and `PATCH` with `If-Match`; updates
reuse the GET-then-PATCH path. Entries: creates with stripped candidates, then
saves with `expectedRevision`, then publications with `expectedRevision` and
`Idempotency-Key: lace-import:<entryId>:<revision>` (hex-safe printable ASCII,
within 255 characters; IDs are percent-encoded if needed). Any non-`429`
failure stops the run; the error names the item key and the API code only.
`409` on save or publish advises a rerun.

### D10. Retry-After

Parse integer seconds or an HTTP date relative to the response `Date` or the
local clock; clamp to 1–300 seconds; at most 10 waits per request. The sleep
function and clock are injected for tests.

### D11. Exit codes and diagnostics

Codes map onto existing `EXIT` values: `IMPORT_INVALID`,
`IMPORT_CONFIG_MISMATCH` and missing settings → 4; `IMPORT_CONFLICT` → 2
(same meaning as pending sync: review, then rerun explicitly);
`IMPORT_UNAUTHORIZED`, `IMPORT_RATE_LIMITED`, `IMPORT_FAILED` → 6. `diagnostics.ts`
gains an `import` operation with trusted reason/next-action text per code;
unknown errors use the sanitized fallback.

## Package boundaries

`application` (extracted normalizer, re-exports) ← `contracts` (unchanged) ←
`cli` (new import modules). Server, db, auth and platforms are unchanged except
that `ContentUseCases` calls the extracted function.

## Risks / Trade-offs

- [Normalization drift between CLI build and server version] → both use the
  same application function; config version check rejects mismatched models;
  a CLI older or newer than the server can still differ, so the CLI README
  states that `@lacecms/cli` and the server should be the same release.
- [Large packages and the 30/min upload limit] → sequential uploads with
  bounded `Retry-After` waits; reruns resume.
- [Stripped list elements change list order temporarily] → only on the first
  create; the complete save follows in the same run.
- [Matching existing manually uploaded media by hash overwrites its metadata
  with package values] → shown as `update` in the plan; `--dry-run` reveals it.
- [Bearer token in environment] → never echoed, never written; HTTPS required
  off loopback.
- [Memory: files read fully for hashing] → bounded by 10 MiB per file and read
  one at a time; hashes are cached for the run.

## Migration Plan

No database or template change. The CLI ships the command in the next
release; the README documents it. Rollback is removing the command; nothing
persistent outside the user's state file is created.
