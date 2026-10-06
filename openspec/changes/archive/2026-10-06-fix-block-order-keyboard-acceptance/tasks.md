## 1. Keyboard harness synchronization

- [x] 1.1 Correct the acceptance keyboard pickup/move/drop sequence with focused-handle checks, activation/announcement synchronization and a deferred-listener/layout barrier; verify a real browser moves exactly one position in the acceptance card layout while all existing final-order assertions remain.
- [x] 1.2 Use the same synchronization in the admin block-order e2e where appropriate and add bounded failure state (focus, pressed state, announcement and geometry) without content or credentials; verify a deliberately nonresponsive browser interaction still fails with the correct stage and safe diagnostics.
- [x] 1.3 Add focused browser regression coverage for delayed activation/layout and repeated keyboard moves; verify at least ten consecutive corrected interactions and the existing block-order e2e pass without retries that conceal failures.

## 2. Release verification

- [x] 2.1 Run the focused harness tests, then `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate fix-block-order-keyboard-acceptance --type change --strict`; verify every required check succeeds.
- [x] 2.2 Run `pnpm acceptance:release --artifacts .release-artifacts/alpha-3` using the existing inventory; require the complete passed receipt and record verification evidence in this change, preserving artifact identities and explicitly reporting any unrelated runtime blocker.
