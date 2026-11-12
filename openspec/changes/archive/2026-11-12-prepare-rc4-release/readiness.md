# RC4 repository preparation

On 2026-11-12 UTC, [registry preflight](registry-preflight.json) found all sixteen rc3 npm packages, both multi-platform rc3 image indexes, and the GitHub rc3 release and tag at `a9bf204a1ea747b56cc639e6a0dd7992c295c32f`, matching the local tag. All corresponding rc4 coordinates returned 404. This is dated availability evidence, not a reservation; recheck before publication.

The diff from rc3 through `680a4346` contains admin collection controls and navigation polish, an import media `If-Match` correction, acceptance harness fixes and test improvements. The configuration change preserves explicitly configured collection defaults. No SQL migration or new user-owned template source is introduced by that diff. Existing rc2-to-current gallery and synchronization instructions remain relevant. rc2 remains the supported floor; unfinished roadmap units are not release prerequisites.

## Repository verification

- `pnpm release:check` and `pnpm release:plan` passed for rc4 and did not mutate registries.
- Generator source tests passed (43); all six generated snapshots were regenerated twice, matched and verified, including managed hashes.
- Published rc3 generator archive SHA-256 `c4cdee64eda4fa1d7e8e679c7284b0f62dc82d6be0c086456741108ea35577ac` matched npm SHA-512 integrity in the preflight; both retained fixtures came from that archive. Fixture integrity tests passed (6), as did source upgrade tests (88).
- Release-model and related source tests passed (234), including refusal to reuse published rc3; `pnpm docs:check` passed (28 pages and 11 tests).
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate`, and strict validation of this change passed. Typecheck built local workspace dependencies; it did not create release archives or images.

## Remaining owner gates

This is repository-only readiness. No rc4 release archives, images, tag or publication were created. Commit and push the reviewed source, recheck registry availability and rights, then follow `docs/alpha-release.md` to prepare the clean-source release set, verify both image platforms and run fresh exact-artifact acceptance before publication. Real infrastructure deployment verification remains separate. These results do not establish artifact or deployment readiness.
