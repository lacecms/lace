## 1. Architecture and policy documentation

- [x] 1.1 Update `docs/mvp-architecture.md` before production code:
  - section 12 contract rules: strict server output, tolerant consumer
    parsing, export `formatVersion`;
  - section 22: the public-contract evolution policy.

  Verify the text matches the three delta specs and changes no other
  invariant.
- [x] 1.2 Add a "Public contract evolution" section to `docs/compatibility.md`:
  - additive keys versus breaking changes;
  - the format-version and `/api/v2` rules;
  - API ≥ SDK within one major line;
  - strict-by-design rich text, block versions and block data;
  - guidance for external OpenAPI consumers.

  Also add a next-alpha note: the `formatVersion` requirement and the widened
  `LaceHttpError.code` type. Verify `pnpm format:check` passes for the
  documents.

## 2. Shared contracts

- [x] 2.1 Derive tolerant variants of the public read schemas in
  `packages/contracts/src/index.ts` from the strict definitions, per design D1:
  - focal point, SEO value, public block, entry, media, media dictionary;
  - global, page/global/list responses, export SEO, build export, error
    envelope.

  Keep the existing exported names bound to the strict family, and export a
  frozen `tolerantPublicSchemas`. Verify existing contracts tests pass
  unchanged.
- [x] 2.2 Add `BUILD_EXPORT_FORMAT_VERSION = 1` and the export `formatVersion`
  (strict literal, tolerant positive safe integer), and set it in
  `toBuildExportDto`. Make the tolerant error-envelope `code` a non-empty
  string of at most 128 characters (design D2). Verify with contracts tests:
  - strict accepts only `1`;
  - tolerant accepts `2`;
  - both reject a missing value, `0` and `1.5`;
  - the strict envelope rejects `FUTURE_CONDITION` and the tolerant envelope
    accepts it.
- [x] 2.3 Add strict/tolerant parity tests over representative fixtures for
  every public schema:
  - page, collection list, global and export with SEO, the envelope,
    composites and media.

  For each fixture, verify:
  - both variants yield identical output for strict-valid input;
  - injecting an unknown key into every contract-defined object makes strict
    fail and tolerant return the clean fixture;
  - unknown keys inside `fields`, block `data` and block `settings` survive
    in both variants;
  - a missing required key or a wrong type fails in both variants;
  - a block carrying `hidden` fails both variants, including inside entries,
    globals and the export.

## 3. Server output

- [x] 3.1 Confirm the server keeps parsing every public response, and the
  OpenAPI resolvers, with the strict exports. The export now emits
  `formatVersion: 1` on Node and Worker. Regenerate
  `apps/api/openapi/api-v1.json`. Verify with:
  - server app tests;
  - `apps/api` node-server and worker-smoke tests asserting `formatVersion`;
  - `pnpm openapi:check` (stage the regenerated file).

## 4. SDK and loader

- [x] 4.1 Switch `packages/sdk/src/client.ts` response, collection-page,
  global, export and error-envelope parsing to `tolerantPublicSchemas`, and
  widen `LaceHttpError.code` to `LaceErrorCode | (string & {})`. Verify with
  SDK tests:
  - unknown keys at response, entry, block, media, SEO and export-section
    level are ignored and absent from results;
  - missing or mistyped required values still raise `LaceContractError`;
  - an unknown error code on HTTP 409 yields `LaceHttpError` with that code.
- [x] 4.2 Add `LaceUnsupportedExportFormatError` (a `LaceContractError` with
  `received` and `supported`). Throw it from `getBuildExport` when
  `formatVersion > BUILD_EXPORT_FORMAT_VERSION`, without the body or token in
  the message. Verify with an SDK test for `formatVersion: 2` and for a
  supported export carrying unknown keys.
- [x] 4.3 Map the unsupported-format error to `invalid_export` in
  `createPublishedSiteLoader`, with upgrade guidance and the cause preserved.
  Verify with published-site tests:
  - a format-2 export fails with `invalid_export` and the guidance;
  - other contract errors still propagate unchanged.
- [x] 4.4 Update hand-written export fixtures in SDK, Astro, render, site and
  acceptance tests to include `formatVersion: 1`. Verify the affected package
  test suites pass through `pnpm turbo run test --filter=…`.

## 5. Quality gates

- [x] 5.1 Run the narrow contracts, server, SDK, Astro and `apps/api` tests,
  the cross-runtime product phase (`pnpm exec vitest run --config
  vitest.cross-runtime.config.mjs`) and `pnpm acceptance:starter`. Then run
  root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm
  openapi:check` and `pnpm exec openspec validate
  public-contract-forward-compat --type change --strict`. Record the results
  in `verification.md`.
