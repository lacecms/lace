# Preparing and publishing a Lace alpha

The owner confirmed publication of `0.1.0-alpha.4` packages on 2026-10-10
(recording date, not an independently verified upload timestamp). The release
uses ownership template `0.20.0` and npm channel `next`. Alpha.1 through alpha.4
are recorded in `release/alpha.json` as published and immutable. GHCR manifests
were not separately verified by this documentation update.

The owner also confirmed completion of real VPS/Cloudflare application testing
and recovery/upgrade checks; see the [owner status](./real-application-verification.md#owner-confirmed-status--2026-10-10).
Alpha.5 (`0.1.0-alpha.5`, ownership template `0.29.0`) passed local preparation
and exact-artifact acceptance on 2026-10-14. Those local receipts alone did not
establish publication; the registry check below now confirms public availability. See [alpha.5 notes](./compatibility.md#alpha-5-upgrade-and-rollback).
The selected next candidate is `0.1.0-alpha.7`, ownership template `0.35.0`,
on npm channel `next`. It includes completed image delivery A–D and the VPS
upload proxy fix. Preparation and acceptance never publish. The commands below
target alpha.7. Complete two-platform preparation, independent verification and
exact-artifact acceptance passed on 2026-10-19;
see the [current evidence](../openspec/changes/archive/2026-10-19-prepare-alpha-seven-release/readiness.md)
and [upgrade/rollback guide](./compatibility.md#alpha-7-upgrade-and-rollback).

Read-only registry checks on 2026-10-19 at 18:55 Europe/Rome confirmed all fifteen
alpha.6 npm versions and both GHCR two-platform image indexes are public.
Alpha.1–alpha.6 are recorded as published and immutable. The GitHub alpha.6
prerelease records publication on 2026-10-16. All fifteen alpha.7 npm version
endpoints and both GHCR manifests returned 404. These are availability checks,
not reservations or proof of authenticated publishing rights. Historical
acceptance facts remain attached to their original source and release.

## Coordinates and ownership

The owner confirmed the npm organization `lacecms` and GitHub organization `lacecms` on 2026-09-30. Public npm metadata returned 404 for the unscoped name `create-lace` that day. This does not reserve it; recheck rights immediately before the first publication. npm organization ownership does not grant rights to an unrelated unscoped package.

| Artifact | Coordinate | Contents |
| --- | --- | --- |
| Generator | `create-lace@0.1.0-alpha.7` | Executable, declarations, templates, ownership inventory, MIT license |
| Runtime graph | `@lacecms/*@0.1.0-alpha.7` | Compiled ESM/declarations and complete registry dependency metadata; `platform-cloudflare` also ships the packaged admin |
| API/admin | `ghcr.io/lacecms/api:0.1.0-alpha.7` | Compiled API/admin, dispatcher, explicit migrations, bucket initializer and native runtime |
| Builder | `ghcr.io/lacecms/builder:0.1.0-alpha.7` | Fixed-command service, non-root work/output mounts and pinned build toolchain |

Read-only registry checks on 2026-10-07 returned 404 for alpha.4 for all fifteen npm packages and both GHCR versioned image manifests. This is historical availability evidence, superseded for npm packages by the owner publication confirmation above.
Read-only checks on 2026-10-14 (Europe/Rome) returned 404 for alpha.5 versions
of all fifteen npm packages; this neither reserves them nor establishes rights.
The same read-only check returned 404 for both GHCR alpha.5 image manifests.
The local npm account is unauthenticated (E401), so publishing rights are not
verified; the owner must authenticate and recheck npm/GHCR rights before live
publication. Local artifact preparation does not need publishing credentials.


### Selecting the next version

Choose a prerelease that is not in `publishedVersions` and is unused in the registries, change `release/alpha.json`, every public manifest, generated dependencies and image defaults, the Dockerfile `LACE_VERSION` defaults, versioned guide commands and the block registry's package requirements together, and advance the ownership template version with upgrade instructions. `release:check` names any stale coordinate; it never rewrites files. After the owner publishes a version, append it to `publishedVersions`.

The fourteen scoped packages are `content`, `config`, `domain`, `application`, `auth`, `db`, `contracts`, `server`, `platform-cloudflare`, `platform-node`, `cli`, `sdk`, `render`, and `astro`; `render` and `astro` were first published with `0.1.0-alpha.2`. The inventory lists their dependency-safe publication order, followed by the generator. Root, applications and test-utils remain private. The admin is shipped inside the API image; generated projects have no editable admin source.

Both runtime images support `linux/amd64` and `linux/arm64` only when both platform builds and smoke checks pass. Local image IDs are not registry manifest digests. Initial preparation saves one archive per runtime/platform and records its ID and checksum. The public version tag is assembled from those tested platform images during publication.

## Prerequisites

- Node `24.12.0` and project-pinned pnpm `12.3.4` for preparation; consumer packages declare the minimum Node `>=24.12.0` (and generated projects pnpm `>=12`) without upper bounds.
- Git, tar, Docker with buildx and the ability to run both Linux platforms (native or emulated), plus enough disk for build layers and four saved images.
- Public dependency/network access for frozen installs and image base/toolchain downloads. Build does not need npm or GHCR publishing credentials.
- A clean reviewed source commit for release-eligible preparation. Registry credentials and local runtime data must remain outside tracked release inputs and build contexts.

## Local preparation

The checked-in `release/alpha.json` is the version/coordinate definition. The validator rejects mismatched manifests, templates, image defaults and private/missing runtime dependencies. It does not rewrite files to hide drift.

```sh
pnpm install --frozen-lockfile
pnpm release:check
pnpm release:plan
pnpm release:prepare --output .release-artifacts/alpha-7
pnpm release:verify --output .release-artifacts/alpha-7
```

`release:plan` is the mutation-free dry-run plan; it does not build or need Docker. `release:prepare` builds the public graph in an isolated source snapshot, packs inspected archives in a disposable workspace, tests an isolated package consumer with test-only overrides, builds/loads both image platforms locally, exercises migrations/configuration/admin/native runtime and builder health, and saves the tested image archives. It does not build the reference Astro site against a live CMS during package compilation.

The output contains `inventory.json`, `status.json`, `packages/*.tgz`, `images/*.tar`, a source snapshot and temporary inspection/build trees. `inventory.json` records definition, source commit/fingerprint, versions, archive SHA-256, image platforms/IDs and checks. Only a successful full set from clean source has both `complete: true` and `publicationEligible: true`. This source-integrity flag does not mean that exact-artifact acceptance has passed or that anything is published. Verification recomputes every artifact checksum without rebuilding.

For development previews:

```sh
pnpm release:packages --preview --output .release-artifacts/packages-preview
pnpm release:images --preview --platforms linux/arm64 --output .release-artifacts/images-preview
pnpm release:prepare --preview --output .release-artifacts/full-preview
```

`--preview` is always publication-ineligible, even if the working tree happens to be clean. Package-only and platform-subset runs are explicitly incomplete. Output destinations are exclusive: never merge runs or overwrite a prepared directory. On failure, `status.json` reports failure and no complete inventory is advertised. Correct the cause and retry in a new destination. Each snapshot is isolated, and local image tags include its fingerprint to avoid overlapping preparations replacing one another's tags. Do not publish a working-tree preview; repeat full preparation from the final reviewed commit.

Run exact-artifact acceptance against the clean prepared inventory before publication:

```sh
pnpm acceptance:release --artifacts .release-artifacts/alpha-7
pnpm --filter @lacecms/platform-node test
pnpm --filter @lacecms/platform-cloudflare test
pnpm --dir apps/api test
pnpm --filter create-lace test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm spec:validate
```

`acceptance:release` requires a complete publication-eligible inventory and verifies all archive checksums. It runs the extracted generator and installs exactly those tarballs in a temporary project, then loads the saved images and checks immutable IDs, platform and provenance labels. The full journey uses the host's corresponding Linux platform (arm64 or amd64). Both-platform preparation smoke results remain in the inventory; one consumer run does not claim two-platform end-to-end coverage.

Since Session 32B the same command is the complete onboarding feedback regression suite for the candidate. After the journeys below it checks that the packed generator reproduces the reviewed byte-stable snapshots and runs, with only the inventory's generator, archives and image IDs: the static-site preview of a generated `--cloudflare` project, the dev/manual/automatic publication visibility journey, the existing-Astro consumer (connection guide, `lace add block`, safe rich text, styling hooks, public media, block edits across rerun/update), the packed Cloudflare consumer journey (generated Worker bundle with the packaged admin, local D1/R2, browser setup, hook failure/recovery, restart persistence) and the upgrade of the template `0.4.0` and published-alpha.2 `0.14.0` fixtures to the candidate template (including the database instruction for migration `0003_site_build_outcomes`). Since Session 33H it then runs the alpha.2 field-trial regressions: block reorder/insert/duplicate/remove/undo in the packed admin through save, reload, publication, export and the served Compose release; the packed Astro loader through a compressing proxy that weakens the ETag; builder source diagnostics on the existing-site consumer in Compose production with the loaded images; credential separation with the packed CLI; Pages deployment tracking of the packed Worker against a loopback Pages API stub; and the development, production and Cloudflare guide command contracts. The receipt lists these journeys. Local stubs never stand in for a real Cloudflare account; the owner's real-account checks are listed in the verification record.

Only the temporary installation substitutes relative tarball references/overrides. The delivered templates and archives stay unchanged, and source-workspace resolution is rejected. The runner checks setup/login, all five blocks, media upload/reuse, external media URLs, roles, anonymous/build-token denial, later-draft isolation, a served Compose release, terminal failed build, explicit retry, and database/object/static persistence after service recreation. Failed-build testing temporarily supplies a random invalid build token and accelerates only the disposable outbox's retry availability; production retry count and policy stay unchanged. No renderer or deployment patch is needed.

Shipping scans cover generated files, extracted packages, selected image configurations/exported filesystems, host/static-volume releases and captured tool/service diagnostics using the run's exact credential bytes and complete private-key blocks in text files. Intentional bootstrap output, local operator `.env`, installed dependencies and persistent auth database are excluded from shipping scans. Errors redact credential values. The final receipt reports source fingerprint, versions, package checksums and selected image IDs; retain it alongside the inventory. Temporary containers, volumes and consumer files are removed on success/failure; `LACE_ACCEPTANCE_KEEP_TEMP=1` is a diagnostic option that retains sensitive local operator state and must not be used for shared release evidence.

See [step-34a-verification.md](./archive/step-34/step-34a-verification.md) for the current local verification and [step-33h-verification.md](./archive/step-33/step-33h-verification.md) for the immutable alpha.3 baseline, [step-32b-verification.md](./archive/step-32/step-32b-verification.md) for `0.1.0-alpha.2` and [step-25c-verification.md](./archive/step-25/step-25c-verification.md) for the first alpha. Node/D1/Worker checks remain local regression coverage. The alpha remains experimental: the vulnerability/license audit and local fault-injection/backup drills remain sessions 34B/34C; real VPS and Cloudflare deployments belong to the separate owner verification plan. No acceptance command publishes artifacts.

## Owner-operated npm publication

Sign in locally with your own npm account, verify publishing access to `@lacecms`, and recheck the generator name:

```sh
npm login
npm whoami
npm view create-lace maintainers --json
```

An E404 means currently unpublished, not reserved. If it exists and you lack publishing permission, stop and revise the generator name and onboarding commands through OpenSpec. Do not silently fall back to another name. For existing release versions, check published integrity/maintainers before doing anything further.

Publish from the repository root using the clean, acceptance-verified artifact directory:

```sh
pnpm release:publish:npm --artifacts .release-artifacts/alpha-7
```

This is a **live publication**. The script verifies the complete inventory and all archive checksums, checks every selected registry version before publishing anything, and publishes the exact saved tarballs in inventory order with `--access public --tag next`. It never repacks source directories and never moves `latest`. Authentication uses your local npm configuration (`npm login`).

To inspect the npm publication without publishing, explicitly add `--dry-run`:

```sh
pnpm release:publish:npm --artifacts .release-artifacts/alpha-7 --dry-run
```

Omit `--packages` to publish all fifteen packages. To select packages, pass a comma-separated list of full names or short scoped names; inventory order is preserved:

```sh
pnpm release:publish:npm --artifacts .release-artifacts/alpha-7 --packages cli,sdk,create-lace
```

Matching published archives are skipped after comparing registry integrity with the saved tarball; a different archive stops the entire selected preflight. Re-running the same command resumes missing packages and ensures `next` points to the selected version. All missing packages are submitted consecutively in inventory order, without waiting for registry processing between uploads. Only after the entire batch has been sent does the script verify each version and its `next` tag against npm. npm may process an accepted upload for several minutes. This final batch verification polls pending versions concurrently for up to ten minutes, tolerates transient metadata errors, and saves each successful submission immediately in `publication-npm-submitted.json`. On timeout, rerun the same command: submitted versions are verified without uploading them again. Keep this journal with the artifact directory. A successful live run writes `publication-npm.json` beside the inventory; dry-runs write no receipt. The preparation inventory stays unchanged. A selected subset's receipt covers only that subset.

Published npm versions are immutable. If a run stops midway, compare existing versions' registry integrity with the saved artifacts, record already-published items and resume only the missing ones. A different archive requires a new prerelease version and a new prepared/verified set. Do not overwrite versions or announce a partially published set.

## Source repository

The source repository is `https://github.com/lacecms/lace`. Package repository metadata, the release definition and both OCI source labels use this address. Artifact sets prepared before the repository moved retain the old address in their embedded metadata; keep their inventories and evidence unchanged and never edit an inventory or retag an image to change provenance. A version that is already published is never replaced: changed artifacts require a new prerelease version, a new prepared set and a new acceptance run.

## Owner-operated GHCR publication

Use your GitHub account with publishing rights in organization `lacecms`. For manual Docker authentication, GHCR accepts a personal access token (classic) with `write:packages`; authenticate locally with `docker login ghcr.io` and keep the token outside the repository. The source label is `https://github.com/lacecms/lace`, matching the repository transferred to organization `lacecms`. A future GitHub Actions workflow would need separately granted organization/package permissions.

Publish the saved API and builder archives for all prepared platforms, then assemble their versioned manifest lists:

```sh
pnpm release:publish:images --artifacts .release-artifacts/alpha-7
```

This is a **live publication**. The script verifies the complete inventory/checksums and checks existing remote platform tags and versioned manifest lists before any local load or remote push. It loads the exact archives, verifies their image IDs and platforms, tags/pushes only missing platform images, and uses `docker buildx imagetools create` with verified remote digests to publish each multi-platform version tag. It never rebuilds images and never changes `latest`.

To review the plan without loading, tagging or pushing images, add `--dry-run`. This performs read-only registry checks and needs Docker CLI/Buildx and registry access:

```sh
pnpm release:publish:images --artifacts .release-artifacts/alpha-7 --dry-run
```

Omit `--images` for both images, or select `api`, `builder`, or `api,builder`. Each selected image always includes all inventory platforms:

```sh
pnpm release:publish:images --artifacts .release-artifacts/alpha-7 --images api
```

Re-running resumes missing platform tags and manifests. Existing artifacts must match the recorded config/image identities and expected platforms; conflicts stop publication. Registry authentication/network errors stop the run rather than being treated as missing images. A successful live run writes `publication-images.json` beside the inventory with remote platform/manifest digests and source identity. A selected subset's receipt covers only that subset. Neither publication command proves real deployment success or replaces exact-artifact acceptance.

New GHCR packages default to private. For both organization packages, open their Package settings and explicitly set visibility to Public, then verify anonymous pulling and both platform entries with `docker buildx imagetools inspect <versioned-coordinate>`. Keep the generated publication receipt with its remote manifest/platform digests; local IDs do not substitute for them. Leave `latest` unchanged.

If publication is interrupted, compare any existing platform tag's config/image identity to the inventory before resuming. Do not overwrite a different image at a released tag. Resume missing platform tags and assemble the full version manifest only once both are verified. Announce availability only after npm and both public image manifests are complete; a consumer must be able to use the generated defaults without an engine checkout or registry credentials.

Official references: [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/), [Docker manifest inspection](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/), [Docker manifest creation](https://docs.docker.com/reference/cli/docker/buildx/imagetools/create/), [npm organization packages](https://docs.npmjs.com/creating-and-publishing-an-organization-scoped-package/), [GHCR authentication, visibility and image labels](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

### Recovering OCI index publication

Docker's containerd image store can identify a saved platform image by its OCI
index digest, including a runtime manifest and provenance attestation. Legacy
stores can identify it by its config digest. Publication and independent
verification recognize both forms and verify the exact expected runtime and
attestation graph when a final multi-platform index flattens the inputs.

If alpha.7 stopped with `Published image differs` immediately after uploading
`api:0.1.0-alpha.7-amd64` using the earlier tooling, use the corrected release
scripts with the original `.release-artifacts/alpha-7` directory. Do not rebuild
the images, edit inventory image IDs, remove provenance, or replace the accepted
source/acceptance receipt. First review the read-only plan:

```sh
pnpm release:publish:images --artifacts .release-artifacts/alpha-7 --dry-run
```

It should skip the matching uploaded platform index and report only missing
images/manifests. Once reviewed, the operator can resume the same live command
without `--dry-run`. A different root, config, runtime child or attestation still
causes refusal; do not overwrite that conflict. The saved artifact source remains
`665bd3499b49180a0873881bd9a93bb2722f556a`; later tooling/handoff commits are not
the image source. Repair verification itself does not publish anything.

## GitHub release and cleanup

Reviewed root [CHANGELOG.md](../CHANGELOG.md) entries are the source for short
GitHub Release descriptions: normally 3–6 bullets, naming important changes,
breaking contracts and required upgrade actions. Detailed operational evidence
belongs in four small JSON assets: inventory, acceptance, npm publication and
image publication. Packages stay in npm and images in GHCR.

The lifecycle is prepare → exact-artifact acceptance → npm/GHCR publication →
verified GitHub prerelease → explicit local cleanup. Preparation and dry runs
never publish. Finalization and cleanup default to preview, and neither replaces
real VPS/Cloudflare deployment verification. A partial publication retains the
saved bytes/journals for recovery. Cleanup never edits tracked documentation,
prunes global caches or deletes unrelated releases/development data.

### Preview and finalize GitHub

Commit reviewed CHANGELOG.md and its linked documentation, and make that commit
and the artifact source commit available in the source repository. Authenticate
locally with `gh auth login`, then check `gh auth status`; the account needs
permission to create repository releases/tags and upload assets. Authentication
stays outside artifacts. The tag is `v<inventory-version>` at the exact artifact
source, even if the notes/harness revision is newer.

If CHANGELOG.md exists only in the working tree, preview reports a local
prerequisite to commit it and the linked documentation, then push that notes
commit. This is separate from GitHub authentication; no artifact rebuild is
required because the version tag still selects the saved inventory source.

New `acceptance:release` runs atomically save `acceptance.json` in the artifact
directory only after all journeys and temporary-environment cleanup succeed.
Commit the reviewed acceptance scripts before recording their revision. Existing
reports are not overwritten; preserving temp projects prevents a success receipt.
For an older alpha.5/alpha.6 set, import its original acceptance bytes explicitly.
Supply your retained receipt path; these JSON files are no longer in `docs/`.
The published [alpha.6 acceptance asset](https://github.com/lacecms/lace/releases/download/v0.1.0-alpha.6/acceptance.json)
is available with the other preserved reports on its GitHub Release:

```sh
pnpm release:acceptance:import --artifacts .release-artifacts/alpha-6 --receipt /path/to/original/alpha-6-acceptance.json
pnpm release:acceptance:import --artifacts .release-artifacts/alpha-6 --receipt /path/to/original/alpha-6-acceptance.json --apply
pnpm release:github --artifacts .release-artifacts/alpha-7
pnpm release:github --artifacts .release-artifacts/alpha-7 --apply
```

The commands without `--apply` are previews. The final command is a live GitHub
operation: it verifies every public npm version and both images/platforms,
creates/resumes a matching draft, verifies four JSON assets and publishes the
prerelease without changing latest. It does not publish packages, push images,
repack files, push source commits or move existing tags. The notes body comes
from the corresponding changelog entry; links point to the reviewed notes
revision rather than a moving branch. Matching reruns are idempotent; conflicting
tags, bodies or assets require explicit reconciliation. An interrupted upload
leaves a draft which can resume with the same command. Upload uses the documented
[gh release upload](https://cli.github.com/manual/gh_release_upload) command without
`--clobber`; conflicting existing assets are never deleted or replaced.

Assets are inventory.json, acceptance.json, publication-npm.json and
publication-images.json. Publication assets are complete deterministic public
verification reports generated from fresh registry facts; partial local
publication journals and private diagnostics are never uploaded. Import keeps
historical acceptance bytes unchanged and does not claim a fresh test execution.
A successful finalization writes publication-github.json locally with the URL,
source, notes revision and remote asset hashes. Missing/blocked prerequisites
produce a nonzero exit and never cause publication or deletion. Current next may
have advanced; identity checks use immutable version coordinates.

### Preview and clean local release files

After registry publication and verified GitHub finalization:

```sh
pnpm release:clean --artifacts .release-artifacts/alpha-7
pnpm release:clean --artifacts .release-artifacts/alpha-7 --evidence .release-artifacts/alpha-7-evidence --apply
```

The second command removes those explicitly selected local directories, including
saved tar/image files, only after freshly checking the complete public set and
remote evidence. Preview lists paths, estimated bytes and unmet prerequisites.
Keep a separate archive first if local package/image copies are desired after
publication. No other release directories or global Docker/pnpm caches are
selected automatically. An absent artifact directory is a no-op; it does not
silently delete separately selected evidence.

Add `--acceptance` only when intentionally removing the separate named
`.lace-acceptance` stack. Preview never stops it; apply validates its state and
runs the existing `acceptance:stop` before removing release data. Invalid state,
a failed stop, missing GitHub assets or registry/auth failures prevent deletion.
No `.env`, dev-data, tracked documentation or unrelated temporary project is
cleaned. Symlink escapes, wildcards and repository/artifact roots are refused.

Preparation, acceptance, publication, finalization and cleanup share per-artifact
locks under `.release-artifacts/.locks`. An active or stale lock causes refusal;
inspect the recorded operation/PID and establish that it ended before manually
removing only that lock. Do not remove locks to bypass active work. Interrupted
cleanup keeps a recovery journal under `.release-artifacts/.cleanup`; rerun the
exact same artifact/evidence/acceptance selection to verify remote identities
and remove remaining files. Changed scope or remaining artifact bytes cause
refusal. A successful retry removes its journal.

### Retiring historical tracked receipts

When an older checkout still tracks alpha.5/alpha.6 acceptance JSON, retain it until each
corresponding published GitHub Release exposes its byte-identical acceptance
asset. Verify by downloading the asset and comparing SHA-256 with the tracked
file. Then make a reviewed documentation change: replace receipt links in this
guide and the historical OpenSpec handoff with the verified release asset URL,
and remove that tracked JSON. Record the version/tag and preserved checksum in
the handoff. Local cleanup never performs git rm or rewrites history. Public
release notes now live in [CHANGELOG.md](../CHANGELOG.md); detailed instructions
remain in [compatibility](compatibility.md#alpha-7-upgrade-and-rollback).
