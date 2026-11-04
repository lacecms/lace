# RF4X verification

## 1. Baseline (task 1.1, commit `00e7efe7` plus the proposal)

The raw lists are in the session scratchpad (`rf04x/`). The counts below are
the reference values for this change.

**Typecheck exceptions.** 143 files carry `@ts-nocheck` under
`packages/*/src` and `apps/*/src`:

- 141 are `*.test.ts`.
- 2 are test-support modules:
  - `packages/content/src/test-support/content-test-helpers.ts`
  - `packages/platform-cloudflare/src/test-support/worker-harness.ts`

**Intra-package cycles.** The scratch scan finds five strongly connected
components among production modules. It resolves relative specifiers and
includes type-only imports, `export … from` and `import()`.

| Member | Component |
|---|---|
| `apps/admin` | `entities/content/{composite-values,editor-form}.ts` (one slice) |
| `auth` | `{mcp-boundary,mcp-consent}.ts` |
| `cli` | `{diagnostics,index}.ts` |
| `domain` | `{index,seo}.ts` |
| `platform-node` | `{content-repository,index,runtime}.ts` |

The admin component lies inside one slice, which is within the design
decision 3 limit, so no owner stop was needed.

**Stale verification paths.** There are 22 missing paths. The design Context
said 21 because it omitted the verification config entry, which is also
covered by task 4.4.

| File | Missing paths |
|---|---|
| `scripts/security-resilience-verification.mjs` | 15 |
| `scripts/cross-runtime-verification.mjs` | 3 |
| `scripts/operations-verification.mjs` | 3 |
| `vitest.verification.config.mjs` | 1 (`apps/builder/src/runner.test.mjs`) |

**Oxlint warnings.** 41 in total:

| Rule | Count | Where |
|---|---:|---|
| `no-unused-vars` | 28 | contracts tests |
| `no-useless-spread` | 5 | admin-client ×2, server `routes/docs.ts`, test-utils ×2 |
| `no-new-array` | 4 | db `shared/write-errors.test.ts` |
| `no-control-regex` | 2 | content `fields/internal-link-tokens.ts`, auth `mcp-oauth.ts` |
| `no-useless-escape` | 1 | auth `mcp-actor.ts` |
| `no-unsafe-finally` | 1 | builder packaged test |

**Listed test titles.** These are sorted `vitest list` names with the file
prefix stripped:

| Package | Titles |
|---|---:|
| contracts | 97 |
| db | 28 |
| test-utils | 64 |
| server | 87 |
| app-admin | 902 (894 unique) |
| app-builder | 31 |

**Root tests.** `pnpm test` ran 35 root files with 284 cases.

## 2. Implementation results

**Typecheck exceptions.**

- The two test-support helpers are typed. `worker-harness.ts` needed only a
  local declaration file, `src/d1-test-harness.d.mts`, for the untyped Miniflare
  harness, so the design decision 1 stop rule did not apply.
- `scripts/test-typecheck-baseline.json` lists the 141 remaining test files.
- Results after the change:
  - content: 241 tests pass;
  - platform-cloudflare: 218 tests pass;
  - platform-cloudflare packaged worker tests: pass.

**Cycles and layout.**

- `scripts/source-cycle-baseline.json` records the five components from
  section 1.
- `scripts/source-layout.json` declares the six split packages, with each
  directory's allowed dependencies written out in full.
- Four entry headers were rewritten into the single `// Directory dependencies:`
  form: contracts, server, db and config. The contracts sentence "Type imports
  follow the same direction" was dropped because the checker now enforces it.
- Refinement: `*.type-test.ts` files count as test files in the new checks.
  They import the package entry and test-support by design. The existing
  package-boundary loop is unchanged.
- The new checks run after the admin structure check, so an admin upward
  import still reports its specific error even when it also closes a cycle.

**Verification runners.**

- All 22 stale paths are replaced.
- Package suites run through `pnpm --filter ./<member> exec vitest run`, using
  the member's source config or, for packaged runs, its packaged config.
- Every package run passed on its own:

  | Package | Files | Tests |
  |---|---|---:|
  | auth | whole suite | 4 |
  | platform-node | security set | 52 |
  | platform-node | repository and security contracts | 230 |
  | platform-node | migrate | 11 |
  | platform-cloudflare | image inspector | 19 |
  | platform-cloudflare | contracts | 123 |
  | platform-cloudflare | provider set | 42 |
  | platform-cloudflare | packaged worker | 2 |
  | test-utils | index | 55 |
  | render | whole suite | 106 |
  | builder | runner | 22 |
  | application | whole suite | 139 |
  | sdk | whole suite | 104 |
  | site | packaged fixture build | 4 |
  | cli | upgrade-rollback | 8 |
  | cli | packaged upgrade-command | 37 |

- `verify:cross-runtime --artifacts x` now exits with the usage error before
  creating a result directory.
- The operations project lists only `tests/operations.acceptance.mjs`.
- A full `verify:*` run needs Docker, images, Chromium and a prepared
  candidate. It is not run here and remains an owner check.

**Root guards.**

- The path scan also found six stale test paths in the `docs/verification.md`
  coverage table, now corrected.
- It skips archived documents and the active roadmap, and checks `--config`
  only in Vitest commands. Wrangler `--config` arguments are not test
  configurations.
- Catalog rows: `dist/` build outputs are exempt from the existence check, and
  the delta spec is clarified accordingly. The `lint` and `db:migrate:node`
  rows are fixed.
- Removing one config `@ts-expect-error` target makes `typecheck` fail with
  TS2578.

**Lint.**

- All 41 warnings are cleared, and contracts listed titles are identical to the
  baseline (97).
- `no-control-regex` is fixed with explicit code-point checks, not a config
  override:
  - content's existing `\u0000`/`\u0085` cases pass;
  - two new `client_name` cases (BEL, DEL) join the existing MCP rejected
    metadata list;
  - `pnpm compat:mcp` passes 228 tests against rebuilt `auth`/`platform-*`
    dist.
- `admin-client.ts` stays within its size baseline (1040 ≤ 1042).
- A temporary unused variable makes `pnpm lint` fail.
- Listed titles are identical for db, test-utils, server, app-admin and
  app-builder.

**Turbo.** In dry runs, changing `lace.config.ts` or
`apps/site/src/fixtures/published-export.json` turns both cached tests from HIT
to MISS.

**Final gates.**

- `pnpm typecheck`, `pnpm lint` (zero warnings), `pnpm format:check` and
  `pnpm spec:validate` pass.
- `pnpm test` passes: 64 Turbo tasks, none cached, then 35 root files with 316
  cases. The 32 new cases are the guard and runner tests.
- `openspec validate rf04x-workspace-guards --type change --strict` passes.
- Raw passed-run output was deleted. The baseline lists remain in the session
  scratchpad.
