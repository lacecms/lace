## 1. Split characterization coverage

- [x] 1.1 Move the six direct parser cases to a typed source test, importing source modules; compare all twelve expected results with the existing snapshots and retain duplicate, unknown and missing-value checks. Assert the default project directory without an absolute developer-specific snapshot; run the focused source test.
- [x] 1.2 Retain all seven built-CLI subprocess sanitization cases in the packaged test, including exit status, JSON and both output streams; remove the old parser imports, cases and obsolete snapshot only after verifying the new source expectations cover them, then run the focused packaged test after building.

## 2. Verify

- [x] 2.1 Run the CLI source test in an isolated clean checkout or equivalent safe environment without `dist`, and run the CLI packaged suite against the built output; record results and any limits.
- [x] 2.2 Run root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate rf07b-command-parsing-source-tests --type change --strict`; record results and review the diff for unchanged product behavior.

Verification: the isolated source test passed all 6 cases without CLI `dist`; it used the existing workspace dependency installation. All 174 CLI packaged tests passed outside the sandbox, where Miniflare can open local sockets. Root typecheck, lint, format check and strict change validation passed. Product code was unchanged.
