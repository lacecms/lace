## 1. Bind Admin review to one receipt

- [x] 1.1 Update `useLinkImpactReview` to scope explicit consent to the current open review, entry, action and receipt. With the real QueryClient, verify a successful replacement clears consent and announces the change, A → B → A does not restore consent, an unchanged receipt preserves it, and closing and reopening starts unchecked. Verify a coherent replacement with only advisory or no usages needs no URL checkbox.
- [x] 1.2 Validate URL source and location pages against the active receipt before showing the combined review. In the colocated impact tests, verify that mixed receipts restart the list, a late location result cannot join a newer review, same-receipt continuations preserve consent, and loading and retryable read errors block a new submission. Run the typed-reference review tests for the shared location component.

## 2. Verify both destructive dialogs

- [x] 2.1 Capture Delete input at submit. In `DeleteEntryDialog.test.tsx`, use a real QueryClient refresh to replace the displayed links and assert the unchecked box, disabled submit and no API call before reconfirmation. Assert the exact new receipt, draft precondition and any independent typed receipt on submit. Exercise an impact 409 and renewed consent while preserving the other confirmation controls.
- [x] 2.2 Capture Unpublish input at submit and replay that input after a network failure. In `UnpublishEntryDialog.test.tsx`, verify the successful background replacement and impact 409 paths as for Delete. Simulate a lost response followed by a changed review and assert the prior retry sends the original target, snapshot, key and receipt. Verify an impact conflict retires the attempt and a new confirmed request uses the current receipt and a new key. Retain the existing success, focus and stale-publication checks.

## 3. Update guidance and verify

- [x] 3.1 Update `apps/docs/src/content/docs/en/latest/content-modeling/links.md` where it explains the confirmation. Verify the text tells editors to check the latest list again after a background update or submission conflict and explains how to retry a submitted unpublish request after a lost response.
- [x] 3.2 Run the focused Admin impact and dialog tests. Run the existing repository contract case `guards linked target removal with scoped impact receipts and replay-safe unpublication` on Node SQLite and local D1 to verify stale receipts and replay stay consistent across runtimes. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate bind-link-impact-acknowledgment --type change --strict`. Record the results.

### Verification

- The focused Admin run passed 36 tests across six files, including the existing routed entry lifecycle scenarios.
- The removal contract passed in both Node SQLite modes and on local Miniflare D1. The D1 rerun used loopback access after the sandbox denied the listener.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and strict OpenSpec validation passed.
