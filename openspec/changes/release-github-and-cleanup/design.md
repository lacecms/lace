## Context

See proposal.md. Existing `release-publish.mjs` checks saved artifact hashes, supports subsets/recovery and writes `publication-npm.json` and `publication-images.json`; a receipt alone can cover only a subset. `verifyInventory` requires the saved tar/image files, while acceptance currently prints its JSON result without persisting a portable report automatically. GitHub has no Releases (read-only check in this conversation). `.lace-acceptance` is a separately named development acceptance stack with validated `state.json` and an existing safe stop/remove operation.

Architecture sections 22/25 and accepted `alpha-release-artifacts` require provenance, immutable artifacts and separate publication. Completed alpha.5/alpha.6 changes refine the older main candidate wording but remain unarchived. This change adds lifecycle requirements without selecting a new candidate or rewriting either prepared set. The owner has now explicitly approved concise notes, GitHub evidence and cleanup.

## Goals / Non-Goals

**Goals:** Keep reviewed release prose short, preserve exact provenance/evidence on GitHub and make local cleanup explicit, bounded and recoverable.

**Non-Goals:** Changes to runtime packages or Node/Cloudflare behavior, a new release version, automatic live publication/deletion during implementation, retroactive deployment claims, image archive duplication on GitHub, or automatic removal of tracked documentation.

## Decisions

### One short changelog entry supplies the public description

Use English, matching existing repository documentation. Select a unique `## <version>` entry from root `CHANGELOG.md`; the entry body is the GitHub description after resolving relative links to the reviewed repository revision. Prefer 3–6 bullets / 60–120 words, with single sentences and explicit upgrade actions. These are editorial targets, not a truncating validator. Include only relevant changes; do not add empty categories or automatic PR/contributor boilerplate. Missing/duplicate entries are errors.

An illustrative alpha.6 entry is:

> - Build exports are paginated and version-bound; the SDK assembles pages and handles publication conflicts.
> - Public SDK reads accept additive API fields while retaining required-field and rendering safety checks.
> - Media used only by drafts can be detached and deleted with confirmation; published references remain protected.
> - Upgrade API, SDK, site and builder together. Custom export clients must follow cursors; no new database migration is required since alpha.5.

Keep detailed Node/Cloudflare migration, recovery and rollback guidance in existing permanent compatibility, database and operations docs. Migrate alpha.5/alpha.6 notes there and into concise entries with accurate status/date; do not manufacture historical release dates. GitHub-only prose was rejected because source review and offline upgrade context matter; duplicated independently edited prose was rejected because it drifts.

### Reuse registry verification without triggering publication

Keep npm/image publication commands separate. Extract shared read-only identity checks from existing tooling as needed, with injectable operations for tests. Check every immutable npm version/integrity and image platform/config identity plus versioned manifest, not just receipt count or `next` (which may have advanced). Validate public availability and treat authorization/network failures as unknown, never as absence or success. No new service/library dependency is required.

`release:github --artifacts <directory>` previews; `--apply` explicitly finalizes. Resolve the GitHub repository from the inventory source URL, verify repository access and the remote availability of the exact source commit, and refuse mismatching tags. Do not push an unpushed commit or substitute HEAD. Use the installed authenticated `gh` CLI with structured input/files and no token logging. Create/resume a matching draft, upload missing allowlisted assets, download/hash them for verification, then publish as prerelease with latest disabled. Never replace a conflicting published release or force a tag. Store release URL/tag/source/asset hashes in a local finalization receipt. Failure after remote draft creation leaves a recoverable draft and the original artifacts.

### Small public JSON reports replace per-version docs receipts over time

The four public asset names are `inventory.json`, `acceptance.json`, `publication-npm.json` and `publication-images.json`. Keep full tarballs in npm, images in GHCR and private/raw logs local; do not upload environment files, operator IDs/secrets or an arbitrary evidence directory. Validate the report schema/source/version and use a public-field allowlist. Existing alpha.5/alpha.6 acceptance JSON is already intended as portable evidence; preserve its exact bytes during import and expose the correct source/harness/runtime distinction.

Write future successful acceptance reports atomically to the selected artifact directory after the journeys and temporary environment cleanup succeed. Tie them to inventory SHA-256, source/fingerprint, harness revision, actual platform and results. Do not emit success on cleanup failure or relabel old receipts as newly executed tests. Support importing the existing tracked receipts into their existing inventory directories with identity checks; an import is evidence migration, not a new acceptance run.

Tracked alpha.5/alpha.6 receipts stay until an explicitly authorized GitHub publication has preserved their bytes and repository links can be updated. Implementation can complete with this conditional retirement documented and tested; it does not secretly publish historical releases to remove files. Notes can migrate now after every permanent instruction/link has a replacement. Completed OpenSpec receipts retain their historical facts; update links carefully and do not archive changes implicitly.

### Explicit cleanup with remote evidence as its deletion gate

`release:clean --artifacts <directory>` previews; `--apply` removes only that selected child of `.release-artifacts`. Optional repeatable `--evidence <directory>` selects related local evidence directories under the same allowed root; do not infer ownership merely from an `alpha-6-*` filename. Optional `--acceptance` explicitly selects the named acceptance stack. Full remote artifact/release/evidence verification is required before any selected release deletion. Missing authentication blocks deletion, not unrelated development work.

Resolve and validate paths with lstat/realpath, reject root/escapes/symlink ancestors/overlap and tracked paths, and repeat checks before mutation. Never delete `.env`, `dev-data`, global caches, Docker images or unrelated temporary projects. Preserve the existing named-stack validation and stop/remove behavior; invalid state and failed stop retain `.lace-acceptance`. An ordinary release cleanup leaves a running acceptance stack alone.

Use a shared per-artifact operation lock across preparation/publication/acceptance/finalization/cleanup, outside the directory being deleted. A preview does not write locks. Live cleanup takes the lock and repeats prerequisites before deleting. Keep a bounded cleanup journal outside the target, recording its exact source/inventory digest, remote evidence and selected paths. Delete metadata last. After partial deletion, verify remaining local files and freshly recheck remote identities against the journal, rather than requiring already-deleted archives or trusting an unrelated new inventory. A completed retry removes the journal; a fully absent target is an explicit no-op. Conflicting/stale locks require inspection and are not silently removed.

Deleting everything on script exit was rejected because a failed/partial publication needs saved bytes and journals. Keeping only local receipts was rejected because cleanup would erase the sole evidence. Generic glob cleanup and automatic tracked-file deletion were rejected because they can remove unrelated work and break historical links.

## Risks / Trade-offs

- Short notes omit necessary actions → review against compatibility changes; never truncate to satisfy a word count.
- Local receipts claim more than published subsets → freshly verify the full immutable registry graph and required remote assets.
- Source commit differs from documentation HEAD → tag the artifact source, record harness separately and normalize links to a reviewed revision.
- Cleanup races active work or fails midway → shared lock, bounded journal, repeat validation and idempotent resume.
- Existing receipts lack a matching GitHub Release → keep them until an authorized verified migration; do not claim success by deleting them.

## Migration Plan

1. Update architecture release policy and lifecycle guide; add concise alpha.5/alpha.6 changelog entries and relocate detailed instructions/links without changing historical acceptance facts.
2. Add durable acceptance reports/import, shared verification/locking, GitHub finalization and cleanup with injected failure tests.
3. Run focused regressions and root quality gates. Exercise live filesystem deletion only on disposable fixture directories and GitHub/registry operations through fakes; preserve all actual alpha artifacts and tracked receipts during validation.
4. On a later explicit publication request, finalize the selected GitHub prerelease with verified reports. Retire tracked receipts through a reviewed docs change only after verified remote preservation; use explicit cleanup afterward. Rolling back tooling does not reverse published immutable releases; restore documentation from Git if needed.
