## Context

RF8X ([archive](../archive/2026-11-08-rf08x-rc1-baseline/)) made rc1 the
oldest supported state in code: one baseline migration, no built-in block
migrations, export format 2 only, template `0.47.0` with rc1-only upgrade
instructions. The specifications and documents still describe each alpha
release and each template from `0.7.0` to `0.34.0`. RF8Y removes that history
from current documents; the change archive, `CHANGELOG.md` and
`docs/architecture/history.md` remain the record (owner decision 4).

Architecture: §22 (release artifacts) and §25 (documentation ownership) in
`docs/architecture/`; no invariant changes.

## Goals / Non-Goals

**Goals:**

- Every requirement in the five affected capabilities describes current
  behavior; requirements that only described a past release are removed, and
  current content they carried is restated without version numbers.
- `docs/compatibility.md`, `docs/alpha-release.md`, the public pages and the
  generated guides describe rc1 and later only.
- No current-behavior requirement text is lost: each removed requirement names
  its replacement in **Migration**.

**Non-Goals:**

- No runtime, release-script or `release/alpha.json` change. Published
  versions stay in `publishedVersions`, and the validator keeps accepting the
  `alpha.N` spelling for those immutable versions.
- No capability reorganization, roadmap-code cleanup outside touched text or
  the `admin-draft-editor` split (RF8B).
- No public documentation audit beyond release history (RF8C).
- `release:check` currently fails with `Template identity mismatch` because
  RF8X advanced the template to `0.47.0` while `release/alpha.json` still
  selects rc1's `0.46.0`. Selecting the next candidate is a release session's
  decision; RF8Y records it and does not change the release definition.

## Decisions

1. **Remove and restate rather than modify in place.** OpenSpec refuses a
   MODIFIED block that drops or renames a scenario. Requirements whose title or
   scenario names a release are removed and re-added under a new title (the
   RF8X pattern); requirements whose titles alone name a release use RENAMED
   plus MODIFIED, which keeps their position. Alternative considered: editing
   main specs directly — rejected, the delta is the review record.
2. **Consolidate the template history of `project-generator` into five
   current requirements** (starter site, deployment files, guides, private
   Cloudflare operator file, upgrade ownership). The facts come from the
   current templates (`packages/create-lace/templates/`): nine built-in blocks
   registered, `settings` and `navigation` globals, SEO, image configuration,
   proxy and cache rules. Model version numbers, block revisions and template
   numbers are not restated, because they change with every release and are
   checked by snapshots and the registry test.
3. **One candidate-readiness requirement** replaces the five per-release
   readiness requirements in `alpha-release-artifacts`; it keeps their common
   rules (gates, two-platform inventory, independent verification, fresh
   exact-artifact acceptance, evidence identity, no publication during
   preparation, locks).
4. **Generated guides change under template `0.47.0`.** It is not published
   (rc1 = `0.46.0` is the latest published template), so managed guide bytes
   may change without a new template version; the six generated-project
   snapshots are regenerated with
   `node scripts/generated-project-acceptance.mjs snapshots --update`. The
   upgrade-instructions text is unchanged.
5. **`docs/compatibility.md` keeps current facts.** The toolchain baseline,
   runtime ranges, minimum requirements, refresh policy and public contract
   policy stay; the build-export paging rules move out of "upgrade notes for
   the next alpha" into a current section with `formatVersion` 2. Release
   table starts at rc1; one "Upgrading from rc1" section replaces the alpha
   and rc1 upgrade sections. Pre-rc1 feature-adoption sections (CE7A, CE7D,
   CE8A, CE9A, CE9B, CE10, SM5D) go; their current behavior lives in the topic
   notes they already link (`composite-fields.md`, `rich-text-authoring.md`,
   `field-guidance.md`, `form-organization.md`, `internal-url-links.md`).
6. **Anchors.** Links into removed sections (`#rc1-upgrade-and-rollback`,
   `#alpha-*`) are repointed to `#upgrading-from-rc1`; the documentation link
   guard (`tests/docs-links.test.mjs`) and `pnpm docs:check` verify them.

## Risks / Trade-offs

- [A removed requirement carried a current rule not restated elsewhere] →
  every REMOVED entry names its replacement; tasks include a title diff and a
  read-through of each removed block against its replacement.
- [Generated guide edits break scenario command sequences] → only prose is
  removed; the scenario-guide contract tests and the packaged generator tests
  run before completion.
- [Public docs lose rich-text grammar details held only in compatibility.md] →
  verify `rich-text-authoring.md` covers link attributes and code blocks
  before deleting the CE8A section; move the missing sentences there if not.
