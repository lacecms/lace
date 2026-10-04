## 1. Shared mechanisms and registry bundling

- [x] 1.1 Extract the three-way managed-file decision from `planUpgrade` into `managed-decision.ts` and call it from `planUpgrade`; verify the existing upgrade tests pass unchanged.
- [x] 1.2 Add `packages/cli/scripts/bundle-registry.mjs`, run it from the CLI `build` script, and add the `@lacecms/cli#build` turbo task with `$TURBO_ROOT$/registry/**` inputs; verify `pnpm --filter @lacecms/cli build` produces `dist/registry/` byte-identical to `registry/`.
- [x] 1.3 Implement `blocks-registry.ts` (index/manifest validation, framework lookup, dependency closure with missing/cycle errors); verify with unit tests for a valid bundled registry, an invalid manifest, a missing dependency, and a cycle.

## 2. Site, lock, and map

- [x] 2.1 Implement `blocks-site.ts`: site root realpath and Astro config check, framework selection with reserved/unknown keys, lock parse/validate (unknown keys, escaping paths, `null` map hash, `customBlocks`) and deterministic serialization, installed-package lookup, and config/definitions loading; verify with unit tests including reproducing the committed starter `lace.site.json` bytes.
- [x] 2.2 Implement `blocks-map.ts`: block map rendering (built-in, custom namespace import, sorted), missing-entry snippet, and custom scaffold rendering per field type; verify a test reproduces the committed starter `src/lace/blocks.ts` bytes and a custom scaffold matches the expected hooks.

## 3. Planning and command

- [x] 3.1 Implement `blocks-plan.ts`: per-file decisions via the shared decision plus adoption/restore, item atomicity, version blocking, package requirements, custom-block resolution, `--all` selection with missing renderers, map decision, and lock bytes; verify with unit tests for add, current, adopt, update, remove, preserve, restore, conflict, and version mismatch.
- [x] 3.2 Implement `blocks-command.ts` (parser, apply with compare-and-swap writes in item → map → lock order, `--dry-run`, `--write-new`, text/JSON output and exit codes), wire `add block` into `bin.ts` and help, and add `BlockError` handling plus catalog entries in `diagnostics.ts`; verify with CLI process tests for usage errors, JSON conflict output, and exit codes.
- [x] 3.3 Add CLI integration tests: fresh add into an independent Astro site byte-identical to the starter files, dependency closure, `--all` in a generated project (idempotent, no writes), update of an unmodified file from a newer registry revision, conflicts on a modified component and modified map with `--write-new`, version-range and block-version mismatch, unsupported framework, escaping path, missing Astro config, custom block scaffold, and dry run writing nothing; verify `pnpm --filter @lacecms/cli test` passes.

## 4. Repository verification

- [x] 4.1 Extend the repository block-source tests to assert the bundled CLI registry equals `registry/` and that `lace add block` reproduces the existing-site fixture's block files, then build that site with Astro rendering the added blocks; verify `pnpm exec vitest run tests/block-sources.test.mjs tests/existing-astro-site.test.mjs`.

## 5. Template guidance and docs

- [x] 5.1 Advance the template to `0.10.0`: update `docs/lace-astro-site.md` step 5, `README.md`, and `docs/lace-operations.md` to `lace add block`, add `0.10.0` upgrade instructions (managed guides only, no site changes), and update `TEMPLATE_VERSION`, generated-project fixtures, and version assertions; verify create-lace tests, `upgrade-command.test.mjs`, and `tests/generated-project-acceptance.test.mjs` pass.
- [x] 5.2 Update `docs/mvp-implementation-roadmap.md` (30D completion note) and any doc that still promises a future `lace add block` (`docs/personal-site-guide.md`, `apps/site/README.md`); verify with `grep -rn "future \`lace add block\`"` returning nothing.

## 6. Completion checks

- [x] 6.1 Run root typecheck, `pnpm lint`, `pnpm format:check`, the narrow test suites above, and `pnpm exec openspec validate step-30d-add-block-command --type change --strict`; verify all pass.
