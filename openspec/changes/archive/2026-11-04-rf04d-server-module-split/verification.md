# RF4D verification

## Baseline (before module moves)

- Clean server build: passed at `c63c4686` with the characterization case added.
- Package entry: 17 runtime keys, 17 declaration value exports and 20 declaration type exports. Sorted raw names are saved in the session scratchpad.
- Maximal fixture (auth, MCP, OAuth connections and API docs enabled): 179 ordered method/path entries, including middleware. Raw sequence is saved in the session scratchpad.
- OpenAPI SHA-256: `2d27764152253af8a9616208077f59a64ddd896bdc114f46885bce155825a8d5`.
- `vitest list`: 87 names in 14 files, including the new case. Sorted names with file prefixes stripped are saved in the session scratchpad.
- The new protocol error characterization passed on the original factory and failed when its protocol branch was replaced with the REST error envelope; the original branch was restored.

The temporary raw baseline and comparison outputs were removed after the equivalence checks.

## Post-split equivalence

- Clean rebuild: 17 runtime keys, 17 declaration values and 20 declaration types match the baseline exactly; `dist/` has exactly the 28 source modules and no stale files.
- Maximal fixture: the 179-entry route multiset, five-middleware prefix and relative order within every route module match the baseline.
- The OpenAPI SHA-256 remains `2d27764152253af8a9616208077f59a64ddd896bdc114f46885bce155825a8d5`; `pnpm openapi:check` passes.
- All 87 stripped `vitest list` names match the baseline. The twelve existing test moves contain only import-path changes; the protocol companion additionally contains the characterization case.
- The 28-module graph is acyclic, including type imports, and every relative import follows the documented directory direction and route-helper exception.
- The server suite passed after each extraction (14 files, 139 expanded cases); package typecheck passed after the composition and test moves.

## Final gates

- Root `typecheck`, `lint`, `format:check`, `build`, `openapi:check`, `spec:validate` and strict validation of this change passed. OpenSpec validated all 87 items.
- Full `pnpm test` passed: 64 Turbo tasks including packaged tests, then 35 root test files / 284 tests. The server source suite has 14 files / 139 expanded tests (baseline plus the characterization case).
- The first sandboxed run could not bind the SMTP tests to localhost (`EPERM`). An unsandboxed run passed all 64 Turbo tasks but the root release test required the exact pinned Node version; the final run used Node 24.12.0 and pnpm 12.3.4 with localhost access and passed, reusing the successful Turbo results.
