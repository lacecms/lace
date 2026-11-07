## Context

See proposal.md (Why). The facts below come from the 2026-11-04 audit at commit
`00e7efe7` and were re-checked while writing this change.

**Boundary checker.** `scripts/check-boundaries.mjs` (472 lines):

- It builds one graph keyed by package name and runs `assertNoCycles` on it.
- `importsIn` is a TypeScript-scanner lexer that already returns specifiers
  from `import type`, side-effect imports, dynamic `import()` and
  `export … from`.
- Tests and `src/test-support/**` are skipped (line 395).
- The oversized-source baseline pattern lives in the same loop: unknown
  oversized file fails, a grown file fails, a stale entry fails.
- Negative cases run against scratch repositories in `tests/boundaries.test.mjs`.

**Typecheck exceptions.** `git grep -l "@ts-nocheck"` under `packages/*/src`
and `apps/*/src` returns 143 files:

- 141 are `*.test.ts`.
- 2 are test-support helpers:
  `packages/content/src/test-support/content-test-helpers.ts` (26 lines) and
  `packages/platform-cloudflare/src/test-support/worker-harness.ts` (128 lines).
- Each file pairs the directive with a `// TODO(rf2): …` reason line.

**Intra-package cycles.** A scratch scan of production modules finds no cycles
and no subdirectory barrels in `content`, `application`, `contracts`, `server`,
`db` and `config`. Strongly connected components elsewhere:

| Package | Component |
|---|---|
| `auth` | `{mcp-boundary.ts, mcp-consent.ts}` |
| `cli` | `{index.ts, diagnostics.ts}` |
| `domain` | `{index.ts, seo.ts}` |
| `platform-node` | `{index.ts, runtime.ts, content-repository.ts}` (three cycles) |

`test-utils/src/repository-contract/index.ts` is a barrel (RF4F scope).
`apps/admin` was not scanned.

**Entry headers.** The six split packages each write the direction in a
different form, for example `// Dependencies:` or `// Direction:`, with braces
and several chains. A script cannot rely on them.

**Verification runners.** These name 21 removed `.test.mjs` paths:

- `scripts/security-resilience-verification.mjs`: phases `security`,
  `repositories` and `provider`.
- `scripts/cross-runtime-verification.mjs`: phases `repositories` and
  `sdk-render-site`.
- `scripts/operations-verification.mjs`: phase `forward-migration-upgrade`.
- `vitest.verification.config.mjs`: project `operations`.

Phases call root `pnpm exec vitest run <paths>` with no package configuration,
so even corrected paths would resolve `@lacecms/*` through `dist/` without
package setup. `assertExecutedTests` rejects an empty, skipped or failed JSON
report. A phase whose paths all vanished (`provider`) therefore fails. A phase
with some surviving paths passes on fewer tests, and a Vitest `include` glob
silently matches nothing.

**Smaller drift.**

- `cross-runtime-verification.mjs:82` defaults `--baseline` to a file RF1B
  deleted.
- `docs/content-import.md:47` names the removed
  `vitest.cross-runtime.config.mjs`.
- `config` and `domain` define `type-test` but their `typecheck` does not run
  it.
- `turbo.json` `test.inputs` omit `lace.config.ts` (read by the
  platform-cloudflare worker tests) and `apps/site/src/fixtures/**` (read by
  astro).
- Packaged tests read `tests/fixtures/**` and `tests/support/**`.
- Oxlint reports 41 warnings: 28 `no-unused-vars` left by the RF4C test split,
  4 `no-new-array`, 5 `no-useless-spread`, 2 `no-control-regex`, 1
  `no-useless-escape` and 1 `no-unsafe-finally`.
- Every member's `lint` script is plain `oxlint <dirs>`.

## Goals / Non-Goals

**Goals:**

- Every §6 layout rule and the test typing rule is checked by `pnpm lint`.
  Legacy violations are frozen in shrinking baselines, as the size limit
  already is.
- `verify:*` phases run exactly the cases `pnpm test` / `test:packaged` run,
  and a renamed test path fails a root test instead of the next manual
  verification.
- One edit-and-review surface per rule: a JSON baseline or declaration diff
  shows every new exception.

**Non-Goals:**

- Typing baselined tests, breaking baselined cycles, admin source resolution,
  and RF3 vocabulary. See the proposal's Non-goals.
- Replacing the lexer with a full TypeScript program or adopting
  dependency-cruiser (deferred by the existing architecture requirement).

## Decisions

### 1. Typecheck exceptions: a file-list baseline inside the boundary checker

`scripts/test-typecheck-baseline.json` is a sorted JSON array of
repository-relative paths. While walking each member's `src/` (including tests
and test-support, which are otherwise skipped), the checker reads the leading
comment block. The rules:

- A file carrying `@ts-nocheck` fails unless it is listed and is a test file.
- A listed path that is missing, no longer carries the directive, or is under
  `test-support/` fails as stale or forbidden.
- Production modules carrying the directive always fail.

*Why here:* the checker already walks every file in `pnpm lint`, owns the
size-baseline semantics, and has a scratch-repository test harness.

*Alternatives:*

- A count-only baseline. Rejected: a split could move the header to new files
  while the count stays flat, and the diff would not show which file gained an
  exception.
- An Oxlint rule. Rejected: no built-in rule matches the directive in a
  baseline-aware way.
- A separate script. Rejected: it duplicates the member walk.

The two test-support helpers are typed in this change rather than listed,
because strict tests importing them otherwise receive `any`. If typing
`worker-harness.ts` requires changes beyond its own file and local fixture
types, implementation stops and the change is revised. The forbidden
test-support rule is not weakened.

### 2. Layout: a JSON declaration is the source of truth; entry headers must agree

`scripts/source-layout.json` maps each adopted package to directory rules:

```json
{
  "packages/content": {
    "shared": [],
    "fields": ["shared"],
    "references": ["shared", "fields"],
    "blocks": ["shared", "fields"],
    "entries": ["shared", "fields", "references", "blocks"]
  }
}
```

The value lists every directory the key may import (transitively closed and
written out, not inferred), so reviewers see the full permission set.

*Initial content:* the six adopted packages (`content`, `application`,
`contracts`, `server`, `db`, `config`), transcribed from their current entry
headers and confirmed against the measured import graph. Where a header lists
fewer edges than the code uses, the code is accepted if it is acyclic and
consistent with architecture §6. The header is corrected rather than the code
moved, because this change is behavior- and layout-preserving.

*Headers:* each entry keeps a human-readable line in one fixed form:

```text
// Directory dependencies: shared ← fields ← references, blocks ← entries.
```

The checker extracts the directory names from the line and requires that set to
equal the declaration's key set. Only the names are compared, not the arrows,
so the prose stays readable while drift (a new directory, a renamed one) fails.

*Alternatives:*

- Parse the arrow grammar from headers. Rejected: the existing headers already
  need braces and multiple chains (`db`), so a grammar would grow ad hoc.
- Infer allowed edges from the current graph. Rejected: it would freeze
  accidental edges and offers nothing to review.
- Per-package config inside each `package.json`. Rejected: it scatters
  workspace-governance data, and the size baseline already sets the
  `scripts/*.json` precedent.

**Checks for declared packages:**

- An import edge between different top-level directories must be declared.
- No `index.*` module below the root.
- The root holds only production modules that a manifest `exports`/`bin`
  target maps to: `./dist/<x>.js` → `src/<x>.ts`.
- No import of the root entry from a subdirectory. This is implied by the
  direction rule, because the root is not a directory key.

Undeclared packages get only the cycle and stale-baseline checks. Each package
adopts the rest in its own layout session by adding a declaration.

### 3. Cycles: per-member file graph with a strongly-connected-component baseline

For every member, relative specifiers are resolved to files using the same
`.js` → `.ts`/`.tsx` and `index` candidates as `resolveAdminImport`, and
Tarjan's algorithm finds strongly connected components.

`scripts/source-cycle-baseline.json` lists each tolerated component as a sorted
array of repository-relative paths. Checks:

- A component with more than one file (or a self-import) passes only if it is a
  subset of a baselined component.
- A baselined component that is no longer a strongly connected cycle in the
  current graph fails as stale. Partial shrinking is allowed by the subset rule;
  a fully broken cycle requires removing the entry.

Type tests (`*.type-test.ts`) count as test files in the new checks, as the
specification's test-file exclusion requires: they import the package entry and
test-support helpers by design. The existing package-boundary loop is
unchanged.

Admin production modules are included in the graph, because §6 applies the
no-cycle rule to admin too. Its layer and slice checks are untouched. Any admin
component found during implementation is baselined and recorded in the
verification note.

*Alternatives:*

- Baseline individual cycle paths. Rejected: the number of elementary cycles
  is unstable (`platform-node` has three in one component) and enumeration
  order is not canonical.
- Fix the four existing cycles now. Rejected: `platform-node` cycles go
  through its public entry and belong to RF5. The others are cheap, but fixing
  them would touch packages whose layout sessions are not yet scheduled, and
  baselining keeps this change behavior-preserving.

### 4. Verification phases run package suites through package configurations

A shared helper used by the three runners builds a phase from an ordered list
of runs:

- **root runs:** `pnpm exec vitest run tests/…`, unchanged for root
  acceptance files and named projects of `vitest.verification.config.mjs`;
- **package runs:**
  `pnpm --filter <member> exec vitest run [--config vitest.packaged.config.mjs] <files…>`
  with the existing JSON reporter flags.

Each run writes `<phase>-<n>.json` under the result directory, and
`assertExecutedTests` applies to every report. Phase names, order and result
directory layout stay unchanged, so recorded evidence keeps its shape. Runs
inside a phase execute sequentially, so a failure stops the phase and leaves
later phases `not-run` as today.

**Path mapping:**

| Phase | Former path | Current file |
|---|---|---|
| `security` (security runner) | `packages/auth/src` and `packages/render/src` (directories) | the whole package `test` suite |
| `security` (security runner) | `platform-node/src/{client-address,host-database-safety,image-inspector,index}` | the same names as `.test.ts` |
| `security` (security runner) | `platform-cloudflare/src/image-inspector` | `.test.ts` |
| `security` (security runner) | `test-utils/src/index` | `.test.ts` |
| `security` (security runner) | `apps/builder/src/runner.test.mjs` | `runner.test.ts` |
| `repositories` (both runners) | `{platform-node,platform-cloudflare}/src/{repository,security}-contract` | `.test.ts` |
| `provider` (security runner) | `platform-cloudflare/src/{deploy-hook,pages-deployments}` | `.test.ts` |
| `provider` (security runner) | `platform-cloudflare/src/worker` | `worker.test.ts`; the asset and internal-link cases now in `worker-assets.packaged.test.mjs` and `worker-internal-links.packaged.test.mjs` (packaged run) |
| `provider` (security runner) | `application/src/index.test.mjs` | the whole `@lacecms/application` source suite; its eight RF2B use-case files replaced the monolith |
| `sdk-render-site` (cross-runtime) | `packages/sdk/src`, `packages/render/src` | package suites |
| `sdk-render-site` (cross-runtime) | `apps/site/src/fixture-build.test.mjs` | `fixture-build.packaged.test.mjs` (packaged run) |
| `forward-migration-upgrade` (operations) | `platform-node/src/migrate` | `.test.ts` |
| `forward-migration-upgrade` (operations) | `cli/src/upgrade-rollback` | `.test.ts` |
| `forward-migration-upgrade` (operations) | `cli/src/upgrade-command` | `.packaged.test.mjs` (packaged run) |
| `operations` project (`vitest.verification.config.mjs`) | `apps/builder/src/runner.test.mjs` | removed from the root project; the operations runner adds a `@lacecms/app-builder` package run of `runner.test.ts` to `health-restore-rotation`, so builder cases run under their own config |

The runners' existing `workspace-build` phases already build what packaged
runs need. Each build filter list is extended only where a packaged run's
package is missing from it.

*Alternatives:*

- A root Vitest `projects` configuration listing package configs. Rejected:
  per-package roots, jsdom/Worker environments and the admin Vite config make
  project merging fragile, and it would be a second definition of how a
  package's tests run.
- Only fix the paths. Rejected: root resolution through `dist/` is the second
  half of the defect.

### 5. Path guard: static scan, not runner restructuring

A new case in `tests/root-scripts.test.mjs` scans:

- the three runner files and `vitest.verification.config.mjs` for string
  literals that look like workspace test paths
  (`(apps|packages|tests)/…\.(test|packaged\.test|acceptance)\.(ts|tsx|mjs)`)
  or package `src` directories;
- package filter names (`@lacecms/…`, `create-lace`) passed to package runs;
- `--config <file>` in Vitest commands and workspace test paths inside
  Markdown code spans and fences under `docs/`, `DEVELOPMENT.md` and
  `README.md`. Archived documents and the active roadmap are skipped because
  they record files that later sessions removed. Implementation also found six
  stale test paths in the `docs/verification.md` coverage table, which this
  change corrects.

Missing paths and unknown member names fail with the file that names them.

*Why static:* runners build phases inside `main()` with runtime context, and
exporting them would change their structure for a test-only reason.

*Trade-off:* a path assembled dynamically escapes the scan. The helper accepts
only literal file arguments, which keeps paths literal.

The same test also enforces:

- the `DEVELOPMENT.md` catalog entry-column rule (modified root-scripts
  requirement); `dist/` build outputs named in a row are exempt from the
  existence check;
- every member with `tsconfig.type-test.json` mentions it in its `typecheck`
  script;
- every member `lint` script passes `--deny-warnings`.

### 6. Lint: fix every warning, then deny warnings per member

- **Unused variables** in the eleven contracts test files: delete the
  destructured names or imports. Case titles are compared before and after
  with `vitest list`, as RF4C did.
- **Mechanical rules:** `no-new-array`, `no-useless-spread` and
  `no-useless-escape` are fixed in code.
- **`no-control-regex`:** both sites deliberately reject control characters
  (`content/src/fields/internal-link-tokens.ts:10`,
  `auth/src/mcp-oauth.ts:120`). `AGENTS.md` forbids lint-disable comments, so:
  - preferred: rewrite each with an explicit code-point check;
  - fallback, if a rewrite would obscure intent: a file-scoped override in
    `.oxlintrc.json` that names only those two files and only that rule.
- **`no-unsafe-finally`** in
  `apps/builder/src/runner-interruption.packaged.test.mjs:108`: restructure
  so the `finally` block only cleans up.
- Every member `lint` script becomes `oxlint --deny-warnings <dirs>`, so a
  package-level run and the root gate agree.

*Alternative:* `turbo run lint -- --deny-warnings` only at the root. Rejected:
per-package runs would still accept warnings.

### 7. Turbo inputs

`test.inputs` gains `$TURBO_ROOT$/lace.config.ts` and
`$TURBO_ROOT$/apps/site/src/fixtures/**`. `test:packaged` gains `inputs`:

```json
[
  "$TURBO_DEFAULT$",
  "$TURBO_ROOT$/tests/fixtures/**",
  "$TURBO_ROOT$/tests/support/**",
  "$TURBO_ROOT$/lace.config.ts"
]
```

The broad `packages/*/src/**` input stays until the admin and declaration
resolution decision. Narrowing it depends on how workspace dependencies
resolve.

### 8. Documentation and roadmap

**Architecture and ADR.**

- Architecture §6 *Source layout* gains two sentences: the layout declaration
  and cycle baseline enforce the rules, and test typecheck exceptions use a
  shrinking baseline.
- ADR 0020's statement that no directory-level checker exists becomes the
  description of this checker. The ADR is amended, with no new ADR, because
  the decision (directory layout, no cycles) is unchanged and only its
  enforcement changes.
- `AGENTS.md` *Source layout* names the three JSON files.

**Contributor docs.**

- `DEVELOPMENT.md`:
  - the catalog `db:migrate:node` entry names the package scripts it runs;
  - `lint` lists `scripts/check-drizzle-schema.mjs` and mentions the
    Drizzle check;
  - the `TODO(rf2)` sentence points at `scripts/test-typecheck-baseline.json`.
- `docs/verification.md`: `--baseline` becomes a required argument, and phases
  run package suites with package configurations.
- `docs/content-import.md:47`: uses
  `--config vitest.verification.config.mjs --project cross-runtime`.

**Roadmap.**

- An RF4X session section under RF4, before RF4F, and a §4 note.
- Blank lines inside the progress-log table removed.
- A retrospective RF4B "Proposed" row.
- A logged note that RF4B reshaped the exported `AccountSecurityPort`
  contrary to owner decision 2. CHANGELOG handling stays an owner decision
  for the next release preparation.
- RF8A's "§15 is rewritten after RF4B" becomes a review of §15.
- §3 baseline rows for "test files with typecheck exceptions" and
  "intra-package cycles".
- §2 gains the rule that a split session types its test companions or lists
  them in the baseline explicitly.

**`backlog.md`:** the refactoring entry stops claiming no change exists.

## Risks / Trade-offs

- **[Lexer misses an import form]** Example: `import x = require()`, unused in
  the repository. → It reuses the scanner the existing gate trusts. A
  scratch-repository case covers `import type` and `export type … from`.
- **[Header comparison is weak]** It checks directory names, not edges. →
  Edges are enforced from the JSON. The header is documentation that cannot
  drift in membership.
- **[Admin cycle scan finds many components]** → Baseline them. If the count
  is unexpectedly large or crosses slices, record it and stop for an owner
  decision rather than expand scope.
- **[Typing `worker-harness.ts` spreads into Worker test types]** → Bounded
  by Decision 1's stop rule.
- **[Verification phases change shape]** Each phase now emits several JSON
  reports. → Phase names and the top-level `result.json` stay unchanged.
  `docs/verification.md` documents the per-run reports.
- **[`--deny-warnings` blocks unrelated work]** A future Oxlint upgrade could
  add warnings. → The upgrade change fixes them, which is the intended
  behavior of a gate.
- **[Verification runners need infrastructure]** They need Docker, Chromium,
  images and a prepared candidate that the sandbox cannot provide. → The path
  guard and runner unit tests run in `pnpm test`. A full `verify:*` run is an
  owner-run check recorded in the verification note, as in earlier sessions.

## Migration Plan

Repository tooling only; no deployment. Rollback is a revert of the change.
Later sessions migrate by editing the three JSON files:

- typing a test removes its baseline entry;
- adopting a layout adds a declaration;
- breaking a cycle removes its component.
