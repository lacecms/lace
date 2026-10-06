# Keyboard acceptance verification

Verified on 2026-10-06 in the current branch. This change modifies repository test tooling only; the alpha.3 package, template and image artifacts are unchanged.

## Reproduction and correction

The original `pnpm --dir apps/admin test:e2e block-order.e2e.ts --repeat-each=3 --workers=1` reproduced the owner's failure: two runs passed and one failed waiting for `Hero block moved to position 2 of 3.`, receiving `Hero block moved to position 1 of 3.` instead. Installed dnd-kit starts the drag before attaching its keydown listener asynchronously, and sortable movement depends on measured rectangles.

The shared browser helper now checks focused activation and the drag announcement, yields to the deferred listener and waits for stable card geometry before sending exactly one ArrowDown. It still requires move/drop announcements and the callers still assert the resulting order. Failure diagnostics contain only focus, pressed state, recognized Hero announcements and numeric geometry.

## Focused verification

- `pnpm --dir apps/admin test:e2e block-order.e2e.ts --repeat-each=10 --workers=1`: ten consecutive passes, no retries. Each includes pointer and keyboard order, save/reload/publication/export and Astro output.
- `pnpm --dir apps/admin test:e2e block-order-keyboard.e2e.ts --workers=1`: two passes, covering deferred listener/announcement/layout and a nonresponsive move that fails with safe stage/state diagnostics and exactly one arrow event.
- `pnpm exec vitest run tests/field-trial-acceptance.test.mjs tests/alpha-2-feedback-acceptance.test.mjs --maxWorkers=2 --exclude '.release-artifacts/**' --exclude 'tests/fixtures/**'`: four tests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate fix-block-order-keyboard-acceptance --type change --strict`: passed.

Browser/loopback checks ran outside the filesystem sandbox because local listening is restricted there. The first sandboxed e2e and proxy-test attempts failed with `listen EPERM`; the same supported checks passed with local-server access. These sandbox refusals are not product failures.

## Exact-artifact release run

`pnpm acceptance:release --artifacts .release-artifacts/alpha-3` passed on `linux/arm64`, including successful Compose cleanup (exit code 0). Inventory: version `0.1.0-alpha.3`, template `0.17.0`, source revision `5343121d20089bcffcf462a1d5e7bb343c2117de`, fingerprint `6dd76f3a1b15c9318e0d7e8bc58bdddf3d63f182306f437e32f6fef0e4ccfe85`. The complete fourteen-journey receipt is saved in [acceptance-receipt.json](./acceptance-receipt.json).

The packed admin's keyboard reorder completed, followed by insert/duplicate/remove/undo and rejected-order recovery. Every order reached save, reload, publication, export and the served Compose release. The Cloudflare failure/recovery and Pages tracking journeys, weak ETags, all four builder source failures with recovery, credential separation and template upgrades also passed. No local Wrangler connection failure occurred in this run. This is arm64 end-to-end evidence only; the saved both-platform inventory and its artifact identities were not refreshed or published.
