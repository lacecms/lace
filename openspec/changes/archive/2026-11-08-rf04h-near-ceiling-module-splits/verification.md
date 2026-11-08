# RF4H verification

- `pnpm build`: 22 tasks passed.
- `pnpm test`: 64 workspace tasks and 36 root test files / 340 cases passed. The initial sandboxed run could not bind `127.0.0.1`; the completed run used local socket access. Two root vocabulary guards were updated to point to the relocated canonical owners before the successful rerun.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: passed. The boundary and Drizzle checks run through lint.
- `pnpm exec vitest run tests/docs-links.test.mjs --maxWorkers=2`: 6 cases passed.
- `pnpm exec openspec validate rf04h-near-ceiling-module-splits --type change --strict`: passed; no delta specs (`skip_specs`).
- Application entry: 142 runtime keys and 395 declaration names unchanged. Content entry: 109 runtime keys and 198 declaration names unchanged. Focused application and content test-title multisets match the pre-change captures (93 and 96 listed titles respectively).
- Test typecheck exceptions: 136 → 132. All production files in application and content are under 1,000 physical lines; the oversized-source baseline is unchanged.
- Existing false-positive configuration assertions now inspect plan validity and actual operations. Select-card validation tests now pass the mode in the fourth argument, as required by the validation API.
