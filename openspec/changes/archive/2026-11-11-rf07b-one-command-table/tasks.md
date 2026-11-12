## 1. Preserve the CLI contract

- [x] 1.1 Before refactoring, capture packaged CLI snapshots of exact top-level and every supported command's `--help` and `-h` output, streams and exit status; verify them against the current binary.
- [x] 1.2 Add characterization cases for each parser's valid flags/positionals, order and defaults, duplicate and unknown flags, missing values, help with extra arguments, JSON failures and sanitized secret sentinels; run the focused tests against the current behavior.

## 2. One parser and command table

- [x] 2.1 Implement shared `parseFlags(argv, spec)` and convert doctor and preflight first, retaining their validation and parser interfaces; run their source and packaged tests and the characterization cases.
- [x] 2.2 Convert the operator, upgrade, add-block and import parsers to the shared parser, retaining each command's validation and existing exported adapters; run focused parser and packaged command tests.
- [x] 2.3 Dispatch all commands through `defineCommand({ name, usage, parse, run })` entries, preserving multiword/interspersed operator parsing, error handling, output streams and lazy imports; run all help snapshots, CLI command suites and RF7A lazy-loading tests.

## 3. Developer commands

- [x] 3.1 Add the wrapper-only private remote migration path using the project-pinned Wrangler for ledger queries and apply with the same verified DB binding; retain ordinary public CLI credential requirements. Test OAuth and token delegation, fresh and supported ledgers, unknown migration refusal before writes, authorization failures, malformed output, installed versions, and sanitized errors using controlled subprocess fixtures.
- [x] 3.2 Route `cloudflare.mjs migrate` through the built CLI and remove `cloudflare-lib.mjs`'s migrate argv parser, preserving wrapper argument grammar, exact state/database selection, placeholder refusal and remote confirmation/CI rules; test invalid, local, remote mismatch, noninteractive and CI delegation with no real remote mutation and verify an isolated local D1 migration. Preserve dev startup's migration and sync behavior.
- [x] 3.3 Route `dev-stack.mjs sync` through the built CLI inside the Compose API container, ensure its image includes the built CLI, and preserve `--check` and exit propagation; test real `pnpm dev:node`, `pnpm content:sync` and `pnpm content:sync -- --check` against isolated development data, including a pending check without writes.
- [x] 3.4 Update affected internal developer guidance only where build prerequisites or commands changed; check that instructions and existing accepted local-development and operator contracts still match the wrappers.

## 4. TypeScript configuration

- [x] 4.1 Merge the identical library/Node bases, rename the browser base to `tsconfig.web.json` with a fetch-types-only comment, update every referencing project and remove CLI lib overrides; verify no stale config references remain and root typecheck passes.

## 5. Integration verification

- [x] 5.1 Run relevant CLI source and packaged tests, Cloudflare wrapper tests and local-development checks; verify help snapshots, lazy loading, safety and output contracts across both runtimes.
- [x] 5.2 Run root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate rf07b-one-command-table --type change --strict`; record results and environmental limits.

## Verification notes

- CLI source: 184 tests; CLI packaged: 180 tests, including help snapshots and lazy loading. Cloudflare adapter: 219 tests; wrapper: 6 tests; Worker packaged smoke: 1 test. Local D1 migration succeeded against a fresh isolated state directory.
- Isolated Compose project: `pnpm dev:node`, repeated pending `content:sync -- --check` (exit 2 and unchanged plan), sync, and clean check passed. The fresh temporary checkout needed its existing workspace dependencies built first; its containers and volumes were removed afterward.
- Root typecheck, lint including boundary checks, Oxfmt check and strict change validation passed. Sandbox denied Docker and workerd access; those checks passed with the necessary outside-sandbox access. Remote Wrangler OAuth/token and provider responses were tested with controlled subprocess fixtures, not a live Cloudflare account.
