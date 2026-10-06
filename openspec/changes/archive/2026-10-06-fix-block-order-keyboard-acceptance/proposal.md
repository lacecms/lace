## Why

The owner's alpha.3 exact-artifact release acceptance fails at `block-order-keyboard-move: keyboard reordering did not respond`. This is a focused acceptance-tooling follow-up to roadmap Step 33, Session 33H, needed to make its keyboard reorder proof reliable without weakening the release gate.

## What Changes

- Synchronize the block-order browser harness with keyboard drag activation and usable layout before sending its move and drop keys, using the installed dnd-kit behavior as evidence.
- Keep the actual keyboard interaction, accessibility announcements, final order checks and save/reload/publication/export/served-release proof.
- Share the corrected interaction with the existing admin block-order e2e where appropriate and report bounded, credential-free drag state when it fails.
- Verify repeated keyboard interactions in a real browser and rerun acceptance against the existing alpha.3 inventory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This repairs tooling that verifies existing requirements; `.openspec.yaml` explicitly skips delta specs.

## Impact

Scope: `scripts/block-order-acceptance.mjs`, a narrowly scoped browser helper if needed, `apps/admin/e2e/block-order.e2e.ts`, focused harness tests and verification evidence. Architecture sections 4.8, 6 and 9 govern the workflow, package boundaries and ordered content. Accepted contracts remain `generated-project-acceptance` (alpha.2 field-trial proof) and `admin-draft-editor` (keyboard reorder and persisted order).

Dependencies: the existing packed alpha.3 inventory, Playwright Chromium and installed dnd-kit; Docker for the full release run. No shipped admin changes, dependency upgrades, template/version changes, artifact refresh, Cloudflare runtime fixes, publication or changes to roadmap scope are included. If real-browser diagnosis identifies a product defect, stop and revise this scope before editing product code. The externally visible outcome is a reliable release check with an actionable failure, retaining the original artifact identities and coverage.
