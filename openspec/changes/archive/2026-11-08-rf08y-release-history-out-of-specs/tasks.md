## 1. Baseline

- [x] 1.1 Record the concatenated requirement titles of the five affected capabilities before the change (for the title diff in 5.2).

## 2. Internal documents

- [x] 2.1 Rewrite `docs/compatibility.md`: keep toolchain baseline, runtime ranges, CI versions, compatibility bridge, minimum requirements, refresh policy and public contract policy; move the build-export paging rules into a current section with `formatVersion` 2; replace the alpha release line and every alpha/rc1/CE/SM upgrade or adoption section with a release table that starts at rc1 and one "Upgrading from rc1" section.
- [x] 2.2 Before deleting the CE8A section, confirm `docs/rich-text-authoring.md` describes link `target`/`rel` and code blocks; add missing sentences there.
- [x] 2.3 Rewrite `docs/alpha-release.md`: drop alpha evidence narratives, the alpha.4/alpha.5 registry checks, the alpha.7 OCI recovery note, the alpha.5/alpha.6 acceptance import and the receipt retirement sections; keep current preparation, publication, finalization and cleanup procedures with rc examples.
- [x] 2.4 Repoint links to removed anchors (`docs/`, `README.md`, `CHANGELOG.md` links excluded only if they point at a released entry's own text) and update `docs/README.md` entries if a description changes.

## 3. Public documentation

- [x] 3.1 `apps/docs` operations page: replace the alpha.6/alpha.7/alpha.8 sections with current upgrade and rollback guidance from rc1 and current MCP limits (separately consented publication; no unpublication or deletion).
- [x] 3.2 `apps/docs` Node deployment, API reference and reference index: remove alpha targets and alpha-numbered notes.
- [x] 3.3 `apps/docs` Astro integration: remove the "Upgrade Gallery v3 to v4" and "v4 to v5" sections and other pre-rc1 adoption steps; keep the copied-component guidance for gallery video items.

## 4. Generated guides

- [x] 4.1 Remove alpha-era notes from `packages/create-lace/templates/docs/*.md` and `templates/README.md` (alpha.1/alpha.2 prerequisites, template `0.7.0`/`0.15.0` notes, the alpha.7 image upgrade section, alpha.2 Cloudflare notes) without changing command sequences.
- [x] 4.2 Update `packages/create-lace/src/index.packaged.test.mjs` where it pins removed alpha prose, and add a check that generated guides name no alpha release.
- [x] 4.3 Regenerate the six generated-project snapshots with `node scripts/generated-project-acceptance.mjs snapshots --update` and confirm only managed guide digests changed.

## 5. Verification

- [x] 5.1 Run `pnpm --filter create-lace test`, the packaged generator tests, `vitest run tests/docs-links.test.mjs tests/consumer-guides.test.mjs tests/release-model.test.mjs`, and `pnpm docs:check`.
- [x] 5.2 Compare requirement titles before and after: every removed title has a named replacement and no current-behavior title is missing.
- [x] 5.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate rf08y-release-history-out-of-specs --type change --strict`.
- [x] 5.4 Add the RF8Y entry to the roadmap log in `docs/refactoring-roadmap.md`.
