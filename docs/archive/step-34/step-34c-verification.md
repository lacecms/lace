# Step 34C — local operations and owner handoff

Implementation verification in progress, recorded 2026-10-08. Change: `step-34c-local-operations-owner-handoff`. Release alpha.4, ownership template 0.20.0. Neither 34B nor 34C is archived or synchronized by this task.

Source verification passed: the complete `pnpm verify:34c` run at `.lace-acceptance/step-34c-results-jzMtXi` (five phases), 103 focused contract/server/release/guide tests, 405 admin tests, root typecheck/lint/format, OpenAPI/release checks and strict OpenSpec validation. Initial root tests accidentally included historical artifact source trees; the final runner explicitly excludes those trees and has independent reports. Pre-existing lint warnings remain in DB/builder tests; there are no lint errors.

Both runtime paths compare coordinated database/object restores, roles, draft/published state, blocks, references, media hashes, fresh sign-in and static rebuilds. Missing/corrupt objects fail. Auth/build tokens rotate on both paths; MinIO data survives real credentials rotation. Builder/hook/Pages credentials use controlled tests. Detailed boundaries: [local operations](../../../local-operations-verification.md), [traceability](../../../mvp-traceability.md), and [owner plan](../../../real-application-verification.md#post-roadmap-owner-evidence).

Clean candidate preparation, both-platform image smokes and full exact-artifact acceptance are pending. Final source/artifact identities and results will be recorded separately after execution; historical 34B inventories remain immutable. Nothing has been published or remotely deployed. Real VPS/Cloudflare, remote D1 capacity/restore, production rotations, publication and stable approval remain pending.
