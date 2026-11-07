## 1. Baseline and documentation

- [x] 1.1 Record in `verification.md`:
  - the SHA-256 of `apps/api/openapi/api-v1.json` and the build output of
    `pnpm openapi:generate`;
  - runtime keys and declaration names of `content`, `domain`, `contracts`,
    `application`, `db` and `config`;
  - sorted `vitest list` titles of those packages and of `apps/admin`;
  - the copy locations from design Context, re-confirmed with `git grep`.

  Verify the raw lists exist in the session scratchpad.
- [x] 1.2 Update the roadmap RF3E text with the correction (the upload tag
  input bound of 200 is specified, not drift) and the domain ownership of tag
  and display-name rules. Verify the docs link guard passes.

## 2. Owners

- [x] 2.1 Add the content owners from design decision 1:
  - `FIELD_KEY_PATTERN`/`SOURCE`, `BLOCK_TYPE_PATTERN`/`SOURCE`,
    `MODEL_KEY_PATTERN`;
  - page, draft media-reference and link-resolve limits;
  - `VIDEO_EMBED_PROVIDERS`.

  Export them from the content entry. Verify `pnpm --filter @lacecms/content
  typecheck` and `test` pass, and the packaged export test lists exactly the
  added names.
- [x] 2.2 Add the domain owners: the media-tag constants in
  `media/metadata.ts`, and `access/display-name.ts` with `normalizeDisplayName`
  moved verbatim from application. Add the contracts re-exports for the
  admin. Verify the domain, application and contracts tests pass and the
  application keeps `DISPLAY_NAME_MAX_LENGTH`/`normalizeDisplayName` as
  aliases.

## 3. Replace copies

- [x] 3.1 Point every field-key, block-type and model-key copy from design
  Context at the owners:
  - content internals, config, application sort, contracts (including
    OpenAPI strings via `*_SOURCE`), db and admin editor form;
  - the admin router uses `MODEL_KEY_PATTERN`.

  Verify the package suites pass, and `pnpm openapi:generate` output is
  byte-identical to the baseline at this step.
- [x] 3.2 Point the media-tag, title, display-name, draft media-reference,
  link-resolve and video-provider copies at the owners, keeping the db and
  application public aliases. The server upload tag part uses
  `MAX_MEDIA_TAG_INPUT_LENGTH`. The public collection route uses
  `collectionPathFailure` (design decision 2a). Verify:
  - the package suites pass and OpenAPI is still byte-identical;
  - a new server case returns `422` at `/slug` for a 101-character slug.
- [x] 3.3 Add `pageLimitQuerySchema`, and use it for the entry-list and
  media-list query schemas. Make `pagination()`, MCP arguments, db, both
  platform repositories and the sdk use `MAX_PAGE_SIZE`/`DEFAULT_PAGE_SIZE`.
  Regenerate OpenAPI. Verify:
  - the JSON diff against the baseline shows only the two `limit` patterns;
  - a server test requesting `limit=101` and `limit=500` on both lists returns
    `422` at `/limit`, while `limit=100` and an omitted limit pass;
  - Node and D1 repository contracts pass.

## 4. Filters, admin support and config keys

- [x] 4.1 Add `test-utils` filter parity cases covering every filter kind and
  operation, including the 50-value `in` bound, inverted ranges, empty text
  operands, unknown options and presence operators. Run them against the
  current application validation and the admin `collection-query.ts`. If any
  result differs, stop and report it to the owner. Otherwise record agreement
  in `verification.md`.
- [x] 4.2 Add content `FIELD_PRESENCE_OPERATIONS` and
  `fieldFilterValueFailure`, and make the application and the admin delegate
  with unchanged pointers and messages. Verify the parity cases pass against
  both, the application and admin suites pass, and capability discovery and
  OpenAPI are unchanged.
- [x] 4.3 Add the `groupedControl` and `characterCount` columns and the
  filter-kind control table to `fieldTypeSupport`, and replace the admin
  subsets. Verify the admin unit suite and typecheck pass, and listed titles
  are unchanged.
- [x] 4.4 Replace the config display-only key lists with one table. Verify
  config tests, including the canonical root-fixture snapshot and every hash
  assertion, pass unchanged.

## 5. Helpers and mirrors

- [x] 5.1 Replace the predicate `isRecord` copies in application, admin and
  platform-cloudflare. Add the JSON-validator parity test (design decision 6)
  and delegate contracts `isJsonValue` only if the sets are equal; otherwise
  record the difference. Verify the affected suites pass.
- [x] 5.2 Make the mirror checks total, following design decision 7:
  `Source` enumeration, two-way keys with optionality, and nested
  `seo`/`seoDefaults`/`usage[]`. Add a type self-test whose deliberate breaks
  fail with `@ts-expect-error`. Verify `pnpm --filter @lacecms/test-utils
  typecheck` and `test` pass, and that temporarily adding an unchecked
  `ProbeSource` export to contracts fails the enumeration test (then restore).

## 6. Guard, docs and gates

- [x] 6.1 Extend `tests/shared-vocabulary.test.mjs` with the design decision 8
  detectors and symbol-keyed exemptions. Add scratch-copy negative cases for
  each detector. Verify the guard passes on the repository and fails on each
  scratch copy naming the file.
- [x] 6.2 Update `docs/verification.md` or the relevant public reference if it
  states list limits. Add the RF3E progress row to the roadmap, and move the
  §3 duplication rows. Verify the docs guards pass.
- [x] 6.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test`, `pnpm openapi:check` and `pnpm exec openspec validate
  rf03e-shared-grammars-limits --type change --strict`. Verify:
  - all pass;
  - listed titles equal the baseline plus the new parity, page-limit,
    enumeration and guard cases.

  Record the results and delete raw passed-run output.
