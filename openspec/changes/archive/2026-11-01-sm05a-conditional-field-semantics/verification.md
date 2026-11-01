# SM5A verification

Date: 2026-11-01. Change: `sm05a-conditional-field-semantics`.

## Implemented behavior

- ADR 0018 and architecture §8 *Conditional fields (SM5)*; the LIST2
  paragraph now covers settings only, and the decision summary lists the
  invariant. Roadmap SM5/SM5A marked in progress with the owner decisions.
- `@lacecms/content`: `FieldVisibility` types (targets, select/boolean
  controllers and option literals checked by TypeScript, including unknown
  targets in inferred `field.group` inputs), `normalizeFieldVisibility`
  (shared by groups, forged metadata, blocks, models and contracts),
  `isFieldVisible`, `publishedFieldValues` and `publishedBlockData`.
  `field.group`, `normalizeFieldDefinition`, `defineBlock`, `toFieldMetadata`
  and `toBlockMetadata` carry `visibility` only when declared.
- Validation: `normalizeFieldMap` validates unconditional fields first, then
  visible targets in the selected mode and hidden targets in draft mode,
  keeping declaration order. `validateModelFields`, `validateBlockData`,
  block `validate`, group field values and `validateEntryAggregate`
  (`EntryAggregateModel.visibility`) apply the owner's rules. Hidden values
  and their defaults stay in drafts.
- `@lacecms/config`: model-level `visibility`, structural in projection and
  structure identity; block data rules enter structure while
  `settingsVisibility` stays projection-only; `seoDefaults` rejects
  conditional fields.
- `@lacecms/contracts` and server: model, group and block metadata accept and
  validate `visibility`; OpenAPI gains `FieldVisibility`, referenced by
  content models, group field metadata and block metadata. Model discovery
  (REST and MCP) includes model rules.
- `@lacecms/application`: `field-visibility-added|removed|changed` kinds with
  rename pairing; visibility changes carry baseline and configured rules.
  Recursive field rewrites run whenever either structure declares
  model-level rules. Published rewrites prune every value hidden under the
  configured rules (`prunes` evidence, reported as `affected`), skip hidden
  backfills, check hidden occurrences with draft semantics and refuse
  validated visibility changes whose revealed published occurrences fail
  publication. Published block migrations store the block-data projection.
  Node, D1 and the in-memory test repository pass the configured rules.

## Refinements recorded in the artifacts during apply

- Sync prunes every hidden published value under the configured rules rather
  than only newly hidden ones. This needs no baseline in the repositories and
  also cleans values publication copied before SM5B. A target revealed only
  by a controller default backfill is enforced at the next publication.
- The chain rejection points at the dependent rule (`videoUrl.field`), the
  same as `settingsVisibility`.

## Verification

- `@lacecms/content`: 214 tests (33 new in `conditional-fields.test.mjs`),
  `typecheck` and `type-test`.
- `@lacecms/config`: 76 tests (4 new), `type-test`.
- `@lacecms/contracts`: 155 tests (1 new round-trip/forgery case).
- `@lacecms/application`: 132 tests (8 new in
  `configuration-visibility.test.mjs`, 1 new draft-normalization case).
- Repository contract "prunes newly hidden published values and refuses
  revealed gaps without writes": in-memory SQLite, file-backed SQLite and
  local D1.
- Cross-runtime suite (`vitest.cross-runtime.config.mjs`, 4 files): new
  `tests/conditional-fields.acceptance.mjs` gives identical acceptance, issue
  paths and stored drafts on Node and the local Worker.
- Root `pnpm format:check`, `pnpm lint` (pre-existing warnings only),
  `pnpm typecheck` (38/38), `pnpm test` with pinned Node 24.12.0 (44/44
  tasks), `pnpm build`, `pnpm acceptance:starter`,
  `pnpm acceptance:existing-site`, `pnpm docs:check`, `pnpm openapi:check`
  (artifact staged), `pnpm spec:validate` (85/85) and
  `openspec validate sm05a-conditional-field-semantics --type change --strict`.
- Not run: admin Playwright e2e (no admin change in this session), Docker
  Node Compose and Cloudflare consumer journeys.
