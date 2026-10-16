# Release lifecycle verification — 2026-10-16

Implemented concise changelog entries, artifact-scoped acceptance persistence/import,
complete public registry verification, GitHub prerelease finalization and scoped
post-publication cleanup. No runtime package, schema, dependency version or migration
changed. No GitHub Release/tag/asset, npm version or GHCR manifest was created or
modified, and no actual saved release directory or acceptance stack was removed.

## Passing checks

- Focused release/model/images/preparation/publication/lifecycle/cleanup suite:
  7 files / 68 tests at the integration checkpoint.
- Full root suite after anonymous-registry validation: 29 files / 176 tests.
- Final focused lifecycle/cleanup/harness suite after native gh upload and stable
  harness revision guards: 3 files / 22 tests.
- Root typecheck: 35/35 workspace tasks and project configuration passed.
- Root lint: 20/20 tasks and boundary/color checks passed; direct Oxlint on changed
  lifecycle scripts/tests reported no warnings or errors.
- Root Oxfmt check passed; strict OpenSpec validation passed 75 items and the
  release-github-and-cleanup change individually.
- Updated relative documentation links resolve. Changelog alpha.6: 4 bullets / 70
  words; alpha.5: 5 bullets / 86 words, including required upgrade actions.

The first root test attempt was limited by sandbox restrictions on local
Worker/loopback processes. The complete suite passed when rerun with the normal
local-process access; no source assertion was waived or test skipped.

## Evidence preservation

Read-only acceptance import preview for alpha.6 returned would-import with the
existing report SHA-256 03f43b0795b18eb7c2564782e6a347cb3ff5c0ca514bb6cd11f85e19f7248b89.
It independently verified saved archive/image checksums and did not create an
acceptance.json. Eight existing inventory/tracked receipt SHA-256 values match
the pre-change baseline; saved source.json identities match their inventories.
The original alpha.5/alpha.6 tracked receipt bytes remain unchanged until an
explicitly authorized GitHub publication preserves them remotely.

GitHub/registry lifecycle tests use injected fake operations. Destructive cleanup
and acceptance-stop tests operate only on disposable fixture directories. Tests
cover preview non-mutation, complete-publication gates despite a moved next tag,
missing/auth-failing registry reads, wrong or raced source tags, unreviewed notes,
interrupted upload/resume, conflicting/private assets, operation lock collisions,
symlink/root/tracked-path refusal, partial deletion/retry including removal of the
last target, changed retry scope/content, unrelated version preservation and
acceptance state/stop failures. The documented gh release upload adapter is tested
without --clobber and removes its temporary JSON file.

## Operator handoff

Commit/push reviewed notes and source before live GitHub finalization. Import the
existing acceptance report with explicit apply when preparing that handoff, then
preview release:github. Live finalization and release:clean require explicit
--apply; they are not performed as part of implementing the tooling. Both commands
verify immutable public identities independently of local publication receipts.
Cleanup also requires the published GitHub release and byte-identical reports.
Historical receipt retirement remains a later reviewed documentation change after
verified remote preservation. Real VPS/Cloudflare deployment readiness and
OpenSpec archiving/synchronization remain separate owner actions.

## Follow-up: uncommitted changelog diagnostic

Reproduced the owner's exit 128 locally: CHANGELOG.md exists on disk but is
absent from HEAD. The GitHub adapter now detects that condition before git show
and reports the commit/push prerequisite in preview and apply. Other local Git
failures identify the local command/repository state instead of suggesting a
remote authentication problem. Regression tests use a disposable Git repository
with an untracked changelog and confirm zero GitHub mutations and unchanged
working notes. Focused lifecycle/cleanup checks passed 2 files / 23 tests;
root typecheck, lint, direct Oxlint, Oxfmt and strict change validation passed.
No live publication, commit, push or release cleanup was performed.
