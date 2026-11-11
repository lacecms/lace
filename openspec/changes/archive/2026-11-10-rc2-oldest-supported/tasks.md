## 1. Decision records

- [x] 1.1 Add `docs/adr/0030-rc2-oldest-supported.md` (design D1), mark the support floor of ADR 0029 as superseded by ADR 0030 in its status line and in `docs/adr/README.md`, and index ADR 0030 in `docs/README.md`; verify `pnpm vitest run tests/docs-links.test.mjs tests/architecture-document.test.mjs` passes
- [x] 1.2 Update architecture §22 in `docs/architecture/distribution.md` to name rc2 as the oldest supported schema with links to ADRs 0029 and 0030; verify with `git grep -n "rc1" docs/architecture/distribution.md` returning no support-floor claim

## 2. rc2 upgrade fixtures

- [x] 2.1 Pack `create-lace@0.1.0-rc2` from npm into the scratchpad, verify the tarball against registry integrity `sha512-m2AApGLJODodzLG6MVJM7hW/e+XY25ufxT6klJ5krbPL9s8FxloEZ9KSYbuZ7DvyJVLubuw6MSRHK3yNUAKVLg==`, generate `acceptance-site` with `--starter` and `--starter --cloudflare`, and write `tests/fixtures/template-0.47.0/{default,cloudflare}.json` with provenance (design D2); verify the provenance fields and that the file set matches the rc1 fixture's capture rules
- [x] 2.2 Delete `tests/fixtures/template-0.46.0/` and verify `pnpm vitest run tests/template-fixture.test.mjs` passes for both rc2 variants and the tampering case

## 3. Template 0.48.0

- [x] 3.1 Set `TEMPLATE_VERSION` to `0.48.0` and rewrite `packages/create-lace/templates/.lace/upgrade-instructions.json` with the rc2 → `0.48.0` database and configuration entries (design D3); verify the generator unit tests and `validateUpgradeInstructions` accept it
- [x] 3.2 Replace "Database baseline and upgrading from rc1" in `packages/create-lace/templates/docs/lace-operations.md` with "Database baseline and upgrading from rc2" (design D3); verify `git grep -n -i "rc1" packages/create-lace/templates` returns nothing
- [x] 3.3 Update `packages/create-lace/src/index.packaged.test.mjs` (template version and the rc1 comment) and `packages/cli/src/upgrade-command.packaged.test.mjs` (`Template 0.48.0`), regenerate the six `tests/fixtures/generated-project/*.json` snapshots with `node scripts/generated-project-acceptance.mjs snapshots --update`, then verify `node scripts/generated-project-acceptance.mjs snapshots` and the generator and CLI packaged tests pass

## 4. Documentation

- [x] 4.1 Rewrite `docs/compatibility.md` for rc2 (opening paragraph, release table, "Upgrading from rc2") per design D4; verify no section describes the rc1 database recreation
- [x] 4.2 Replace the rc1 paragraph of `apps/docs/src/content/docs/en/latest/operations/index.md` with the rc2 upgrade path and verify `pnpm docs:check` and `pnpm vitest run tests/docs-publication.test.mjs` pass
- [x] 4.3 Point `docs/alpha-release.md` and `docs/personal-site-guide.md` at rc2 and `#upgrading-from-rc2`; verify `git grep -n "upgrading-from-rc1"` returns nothing outside archives

## 5. Verification

- [x] 5.1 Run `node scripts/generated-project-acceptance.mjs upgrade` (template upgrade journey) against the rc2 fixtures and verify conflict refusal, restored apply, protected user files, new-guide collision refusal and the no-op repeat plan for default and Cloudflare
- [x] 5.2 Run the narrowest affected tests, then root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate rc2-oldest-supported --type change --strict`; verify all pass and record the progress-log row in `docs/refactoring-roadmap.md`
