## Context

See proposal.md for motivation. Baseline on 2026-10-16: clean `main` at `99a2f99`; `pnpm release:check` passes for alpha.5/template 0.29.0. Alpha.5 has complete preparation receipts from source `1ab14e2`; its active OpenSpec change is complete but unarchived. Accepted main release specs still name alpha.4/template 0.18.0, whereas the completed alpha.5 delta and architecture describe alpha.5. This change explicitly supersedes that candidate selection with alpha.6; neither prior spec drift nor unverified publication is silently treated as authoritative history. Archiving/synchronizing the prior change remains a separately requested operation; any later synchronization must preserve the newer candidate selection.

Changes since alpha.5 are already accepted in `rest-contracts`, `public-sdk`, `published-site-loader`, `media-use-cases` and related runtime specs. The migration directory has no changes since the alpha.5 artifact source. Existing release scripts enforce clean snapshots, exact coordinates, frozen installs, distinct output directories and both Linux platforms.

## Goals / Non-Goals

**Goals:** Deliver one coherent alpha.6 set through existing release machinery, document transport compatibility and obtain fresh evidence from the actual saved artifacts.

**Non-Goals:** Change package boundaries, contracts, storage semantics or the accepted per-draft atomicity of detachment; broaden dependency support; claim real-account deployment readiness from local simulation.

## Decisions

### Select alpha.6 and ownership template 0.30.0 together

Update `release/alpha.json`, public manifests, Node/Cloudflare version modules, Docker defaults, registry requirements, generated dependencies and delivered guides as one set. Advance the generator inventory and upgrade guidance because managed generated files change when release coordinates change. Preserve historical upgrade instructions/fixtures and alpha.5 notes/receipts instead of replacing historical literals globally. Keep root/apps/test-utils private and current toolchain/catalog pins. Use existing release validation and publication order; a new channel abstraction is unnecessary.

Record alpha.1–alpha.4 as published. Alpha.5 is known locally accepted, not established published by this checkout. Read-only registry evidence or owner confirmation can establish additional publication history during apply; absent that evidence, leave its publication status unconfirmed. Never infer publication from numbering or an artifact directory.

### Update release guidance before shipping coordinates

Update architecture release references, alpha release/compatibility documentation, real-application handoff and new alpha.6 notes. Explain required `formatVersion: 1`, tolerant SDK reads with strict required fields and hidden-block safety, and raw endpoint pagination. Coordinated API, SDK, Astro/site and builder adoption is required: an older SDK can miss later pages, and alpha.6 SDK requires a format version absent from older exports. Existing `getBuildExport`/site loaders assemble pages; custom HTTP consumers must follow cursors and handle version conflicts. Preserve first-page conditional reads and pinned-version build failure behavior.

Describe detachment as explicit confirmed draft changes requiring both write permissions. Published use and more than 50 using entries are refused before changes. Each save is guarded and atomic, but the entire operation is not: earlier detached drafts remain after a later conflict; retry rereads usage. No published snapshot or build is changed by detachment. No new DDL exists relative to alpha.5; older-version upgrades still run applicable forward migrations explicitly. Back up matching configuration/database/media before upgrade and document coordinated rollback, without promising automatic downgrades.

### Verify existing behavior at source and artifact boundaries

Run focused release/generator/CLI tests and existing contract, SDK, loader, media/server and SQLite/D1 regressions. Preserve meaningful coverage for multi-page assembly, version changes, tolerant parsing safety, detachment permissions, published-use refusal and partial progress/concurrent edits. Root tests, typecheck, Oxlint, Oxfmt, OpenAPI consistency and strict OpenSpec validation follow. Refresh the existing dependency/license policy audit and report actual findings and existing dispositions.

Exact-artifact journeys use the existing release acceptance harness and saved packages/images, never workspace runtime imports. Add only missing release-specific checks: force a multi-page export (small limit suffices), compare assembled content, exercise a stale cursor after publication, and confirm draft-only media detachment and published-use refusal on Node and local Cloudflare. Source-only fault/concurrency tests remain labeled as such. This is bounded release verification, not a new product feature.

### Freeze source and preserve immutable artifacts

After source gates and review, capture a clean source commit under existing authorization before running `pnpm release:prepare --output .release-artifacts/alpha-6`. An authorized local source commit is required by clean-snapshot tooling; never bypass clean-source eligibility. Prepare fifteen tarballs and API/builder images for linux/amd64 and linux/arm64 with platform smoke checks. Run `release:verify` then `acceptance:release --artifacts .release-artifacts/alpha-6` against the same inventory. Use unique retry directories; retain failures and never mutate a complete set.

Record source fingerprint/revision, inventory SHA-256, archive checksums/image IDs, runtime/platform scope, commands/results and harness revision in readiness.md and a portable alpha.6 receipt. Evidence-only changes after packaging do not relabel the package source. Shipping changes after packaging require a new snapshot and acceptance run. Historical receipts are preserved.

### Keep publication a separate action

Read-only availability and rights checks are evidence, not reservations. Authentication failure does not prevent local preparation; report later authenticated npm/GHCR rights checks explicitly. No credential changes, npm publication, GHCR push, remote release creation or deployment belongs to this change. A later owner publication uses exact verified saved bytes on `next` and existing partial-publication recovery. Historical alpha.4 real-deployment confirmations do not prove alpha.6 deployment readiness.

## Risks / Trade-offs

- Old SDKs can silently consume only the first raw export page → prominent coordinated-upgrade instructions and a forced multi-page artifact check.
- Broad version edits can corrupt historical evidence → update current coordinates selectively and retain prior receipts/fixtures.
- Cross-runtime detachment differs under concurrency → reuse accepted SQLite/D1 contracts and report partial-progress semantics accurately.
- Image builds and consumers can fail despite passing source checks → preserve diagnostics and retry in a distinct directory.
- Registry rights and actual deployments cannot be proven locally → record them as separate owner prerequisites.

## Migration Plan

1. Update release references/notes, coordinates, template upgrade metadata and tests, then pass source and audit gates.
2. Record registry evidence and a reviewed clean source revision; prepare and independently verify a new complete inventory.
3. Run exact-artifact acceptance and record a candid handoff with remaining owner checks.
4. Later authorized publication/deployment uses those saved artifacts, backups and explicit migrations; failures retain immutable versions and restore matching backups where required.
