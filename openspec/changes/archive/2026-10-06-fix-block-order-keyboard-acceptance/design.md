## Context

See proposal.md for motivation. `scripts/block-order-acceptance.mjs` and `apps/admin/e2e/block-order.e2e.ts` both focus the first Hero handle, press Space, wait for `aria-pressed=true`, then immediately press ArrowDown. The harness waits approximately ten seconds for the move announcement before emitting a generic timeout. Installed dnd-kit `KeyboardSensor.attach()` calls `handleStart()` before registering its keydown listener in `setTimeout`; activation state alone does not prove readiness. Sortable coordinates also depend on measured card rectangles after scrolling. The owner's run establishes the missing move announcement, not which of these conditions caused it.

## Goals / Non-Goals

**Goals:** Make this harness interaction deterministic, keep meaningful keyboard coverage and capture sufficient non-sensitive state to distinguish lost input from a genuine UI failure.

**Non-Goals:** Modify the production drag sensor, reorder semantics, published alpha.3 assets or the unrelated local Wrangler connection behavior.

## Decisions

1. Keep synchronization inside the browser harness. Confirm handle focus, active drag and pickup announcement, then allow deferred sensor attachment and stable geometry to settle before delivering one ArrowDown. Use a browser-side event-loop/frame barrier rather than merely raising timeouts. Verify this on the real UI, including the long-card/scroll layout used by acceptance. Share a small helper between acceptance and e2e if that avoids divergent interaction logic; it must remain outside shipped packages.
2. Keep move and drop announcements and exact final order assertions. Preserve every existing downstream persistence/publication assertion. Do not substitute menu actions or programmatic form updates, repeatedly send ArrowDown until green, or retry the entire scenario blindly: these alternatives would hide keyboard regressions or introduce extra movement.
3. On bounded failure, report the stage, focused-control match, pressed state, current announcement and relevant card geometry. Do not log page HTML, form values, cookies, network headers or environment variables. Include the underlying failure where safe. If synchronization does not resolve the issue, use this state to determine whether another harness correction is warranted; a production defect requires a revised plan.
4. Verify the corrected helper against real browser interactions repeatedly, including delayed activation/layout and a nonresponsive case that must still fail. Follow with the existing admin e2e and the full exact-artifact release run. Record which evidence passed and distinguish unrelated infrastructure failures from successful coverage.

## Risks / Trade-offs

- A barrier could be insufficient for a different cause → confirm repeatable browser evidence and inspect bounded state before claiming the race fixed.
- Extra synchronization could conceal broken keyboard behavior → deliver one move, retain announcements and exact order checks, and verify the failure path.
- Full acceptance can fail at the known local Wrangler stage → report that failure honestly; never turn it into a passed receipt.

## Migration Plan

No database, runtime, package, template or deployment migration is needed. Apply only repository harness changes and verification notes in the current branch, rerun against `.release-artifacts/alpha-3`, and revert those changes to roll back. Existing immutable artifacts retain their identities.
