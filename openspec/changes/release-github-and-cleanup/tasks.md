## 1. Release policy and concise history

- [x] 1.1 Update architecture release policy and the lifecycle documentation for changelog → verified GitHub handoff → explicit cleanup; verify the policy agrees with immutable artifacts, separate publication and actual Node/Cloudflare coverage requirements without selecting a new version.
- [x] 1.2 Add root CHANGELOG.md with concise alpha.5/alpha.6 entries; migrate important detailed upgrade/rollback instructions into permanent compatibility/migration guidance, update inbound links and retire redundant note files. Verify entries cover all important changes/actions, remain readable and short, and no historical dates or evidence are invented. Keep tracked acceptance JSON pending verified remote preservation.

## 2. Shared identity checks and durable acceptance

- [x] 2.1 Extract reusable read-only complete registry verification and per-artifact operation locking, wiring existing preparation/publication/acceptance operations into collision protection. Verify full graph/platform identity, subsets, authorization failures, older versions after next advances, conflicts and unchanged npm/image publication recovery with focused tests.
- [x] 2.2 Persist machine-readable successful acceptance atomically under the selected artifact directory only after test-environment cleanup; add identity-checked import of existing alpha.5/alpha.6 receipts without relabeling them. Verify source/inventory/harness/platform fields, byte preservation, mismatches, test failure and cleanup failure with focused tests; preserve the actual saved artifacts and tracked receipt bytes.

## 3. GitHub release finalization

- [x] 3.1 Add release:github argument handling, unique changelog extraction/link normalization and mutation-free preview using injectable gh operations; verify concise body equality, missing/duplicate entries, correct repository/source/tag selection, permission/network failures and zero preview mutations.
- [x] 3.2 Implement explicit apply through complete registry/acceptance preflight, matching draft creation/resume, allowlisted JSON uploads, remote byte verification and prerelease publication with latest disabled; write finalization receipt. Verify interrupted upload/retry, existing matching release, wrong tag/HEAD, asset/body conflicts, missing remote source and partial publication using fake GitHub/registry operations without any live release creation.

## 4. Scoped post-publication cleanup

- [x] 4.1 Add release:clean preview with explicit artifact/evidence selection, estimated bytes, remote prerequisite results and opt-in acceptance-stack selection. Verify no preview writes/stops, and refusal of root/escape/symlink/overlap/tracked paths and operation collisions using disposable filesystem fixtures.
- [x] 4.2 Implement explicit deletion with freshly verified complete registry/GitHub evidence, outside-target recovery journal, safe interrupted retry and absent-target no-op. Integrate validated named acceptance-stop behavior only when selected. Verify missing/mismatching assets, auth failures, mid-delete failure, changed retry scope, unrelated version/data preservation, invalid acceptance state and stop failure; delete only disposable fixture data in tests.

## 5. Documentation, verification and handoff

- [x] 5.1 Document exact preview/apply commands, authentication, four small public attachments, failure recovery and the later tracked-receipt retirement procedure; verify links and preserve detailed migration/rollback guidance while public notes remain concise. Explicitly distinguish implemented tooling from live publication, document how verified GitHub asset URLs replace tracked receipt links in a later authorized docs change, and do not archive completed OpenSpec changes implicitly.
- [x] 5.2 Run focused release/acceptance/GitHub/cleanup tests, root typecheck, Oxlint, Oxfmt check and strict OpenSpec validation including `pnpm exec openspec validate release-github-and-cleanup --type change --strict`; resolve failures and record coverage. Confirm existing release source/inventory hashes and tracked receipts were not changed by validation and no real publication or release-data deletion occurred.
