## Why

Owner decision 11 (2026-11-08) makes `0.1.0-rc1` the oldest supported state.
RF8X removed the code paths for older data and projects, but the
specifications and documents still describe past releases: five
release-specific readiness requirements in `alpha-release-artifacts`, about
twenty "Template 0.x delivers …" and "… template upgrade protects ownership"
requirements in `project-generator`, alpha-numbered guidance requirements in
`public-documentation`, and alpha-by-alpha upgrade sections in
`docs/compatibility.md`, `docs/alpha-release.md`, the public operations page
and the generated guides. A reader cannot tell current behavior from history,
and RF8B cannot reorganize specifications that still carry it.

This is roadmap Step RF8, session **RF8Y — Release history out of
specifications and documents**
([refactoring roadmap](../../../docs/refactoring-roadmap.md)), the
specification and document side of decision 11. RF8B follows.

## What Changes

- `alpha-release-artifacts`: the alpha.5, alpha.6, alpha.7, alpha.8 and rc1
  readiness requirements are removed and replaced by one requirement for the
  readiness evidence of any selected candidate. The coordinate requirement
  describes the release definition instead of listing every published alpha.
  Roadmap wording (`25B`, `25C`, "Step 26", "first-alpha", "sixteen for
  alpha.8", "Alpha six is described briefly") becomes release-neutral.
- `project-generator`: the template-version requirements (templates
  `0.7.0`–`0.34.0`, the "next-alpha", credential-example, scenario-guide and
  upload-limit upgrades) are removed. Their current content is restated
  without version numbers in five requirements: the starter configuration and
  site, the deployment files, the delivered guides, the private Cloudflare
  operator file, and upgrade ownership. Two requirements lose alpha or
  roadmap wording.
- `public-documentation`: the alpha.7 image, alpha.8 and rc1 guidance
  requirements are replaced by current-guidance requirements (image delivery;
  presentation, links, collection queries and MCP; upgrade from rc1). Gallery
  video guidance loses the pre-rc1 upgrade path.
- `prepublication-consumer-security`: "alpha.2 field-trial regressions" is
  renamed to "field-trial regressions" (removed and re-added, text unchanged).
- `generated-project-onboarding`: the Cloudflare credential requirement loses
  its alpha.2 upgrade sentence and scenario wording.
- Documents: `docs/compatibility.md` keeps the toolchain baseline, the public
  contract policy, the current build-export paging rules, a release table that
  starts at rc1 and one "Upgrading from rc1" section; alpha and pre-rc1
  feature-adoption sections go. `docs/alpha-release.md` drops alpha evidence
  narratives, the alpha.5/alpha.6 acceptance import and receipt retirement
  sections and the alpha.7 OCI recovery note. The public operations, Node
  deployment, API and reference pages and the Astro integration guide drop
  alpha upgrade sections. The generated guides (template `0.47.0`, not yet
  published) drop alpha-era notes; snapshots are regenerated.
- No code behavior changes. `release/alpha.json` keeps `publishedVersions`
  (published versions stay immutable), the release validator keeps accepting
  `alpha.N` and `rcN` spellings, and `CHANGELOG.md` keeps its entries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: release-specific readiness requirements replaced
  by one candidate-readiness requirement; coordinate, image, publication,
  prose and finalization requirements made release-neutral.
- `project-generator`: template-version requirements replaced by current
  delivery requirements; two requirements lose alpha or roadmap wording.
- `public-documentation`: release-numbered guidance requirements replaced by
  current guidance requirements; gallery video guidance modified.
- `prepublication-consumer-security`: field-trial requirement renamed.
- `generated-project-onboarding`: Cloudflare credential requirement modified.

## Impact

- Specifications: five capabilities above; no requirement about current
  behavior is lost (the removed text is either release history or restated
  under a new title).
- Documents: `docs/compatibility.md`, `docs/alpha-release.md`,
  `docs/README.md` if an entry changes, `apps/docs` pages (operations, Node
  deployment, API reference, reference index, Astro integration), generated
  guides under `packages/create-lace/templates/` and their snapshots in
  `tests/fixtures/generated-project/`; anchors that point at removed sections.
- Tests: the packaged generator test that pins an alpha.1 sentence in the
  operations guide; the documentation link guard.
- Not affected: runtime code, release scripts, `release/alpha.json`,
  `CHANGELOG.md`, the change archive, `docs/architecture/history.md`.
