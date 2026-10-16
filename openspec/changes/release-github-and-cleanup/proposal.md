## Why

Publishing npm packages and GHCR images currently creates no GitHub Release, while per-version notes, receipts and several gigabytes of local release work accumulate separately. The owner approved a root changelog, matching GitHub release descriptions, small evidence attachments and explicit cleanup, with release prose kept as short and readable as possible without losing important changes or upgrade requirements.

## What Changes

- Introduce root `CHANGELOG.md` as the source for concise version entries and the corresponding GitHub Release body. Prefer 3–6 single-sentence bullets, normally 60–120 words; include user-visible changes, incompatibilities and required upgrade actions, with links for details. Do not pad notes with internal task names, test counts, checksums or routine housekeeping.
- Add `release:github` to plan or explicitly finalize a prerelease for the exact artifact source commit, attaching an allowlisted inventory, acceptance report and npm/image publication receipts. Verify complete remote publication and asset bytes before reporting completion; resume matching drafts safely.
- Add `release:clean` to preview or explicitly remove a selected local artifact directory, optional explicitly selected evidence directories, and an opt-in named acceptance stack. Require verified publication and durable remote evidence before deleting release artifacts.
- Move alpha.5/alpha.6 note content into concise changelog entries and permanent compatibility/migration documentation. Retire tracked acceptance JSON only after its byte-identical report is verified in the corresponding GitHub Release; update references explicitly rather than letting cleanup edit tracked files.
- Generate future acceptance receipts in the artifact directory rather than `docs/`, and document the prepare → accept → npm/GHCR → GitHub → clean sequence.

This is release-operations session ReleaseLifecycle1 after the completed roadmaps, following architecture sections 22/25 and accepted `alpha-release-artifacts`. Publication evidence and cleanup belong together because deletion must depend on a verifiable, durable handoff. Dependencies: existing preparation, exact-artifact acceptance, resumable registry publication and named acceptance-stop tooling. Non-goals: a new Lace version, runtime/product changes, dependency upgrades, new channels, CI publication automation, backfilling every historical release, uploading image archives twice, pruning Docker/global caches, live publication or deletion during implementation validation, or unrequested OpenSpec archiving/synchronization.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: add concise release history, a verified GitHub evidence handoff and explicitly scoped post-publication cleanup without weakening immutable artifact, provenance or partial-publication recovery guarantees.

## Impact

Root `CHANGELOG.md`, package scripts, release/GitHub/cleanup helpers and tests, the acceptance harness receipt writer, `docs/alpha-release.md`, compatibility/migration/owner guidance, architecture release-policy references and links from completed release handoffs. Existing npm/image publication remains separate and uses saved artifacts. Node and Cloudflare package behavior, schemas, migrations and the current alpha.6 inventory remain unchanged. GitHub authentication is supplied outside artifacts; no private logs, environment files or credentials become public attachments.
