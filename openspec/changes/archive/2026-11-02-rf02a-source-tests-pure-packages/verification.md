# RF2A verification

## Baseline (2026-11-02)

`corepack pnpm exec vitest list` on the updated branch:

| Package | Listed test titles before conversion |
| --- | ---: |
| content | 97 |
| config | 50 |
| domain | 22 |
| contracts | 90 |
| render | 41 |
| sdk | 86 |
| astro | 60 |
| Total | 446 |

Content test through the old Turbo task (including build dependencies, warm
cache): 0.96 seconds wall time. Full-root timing is recorded after completion.

## Shared infrastructure

Turbo hashes the shared configuration globally and includes workspace source
and registry inputs, plus package manifests used by alias discovery, in
source-test task keys. Dependency source edits therefore
invalidate cached source tests even though `test` has no build-task edges.

The alias list contains 20 entries: 17 package members plus three subpaths.

## Source migration

All seven packages passed with every `packages/*/dist` directory temporarily
moved away (restored afterwards). Source-test wall times in seconds: content
1.47, config 0.73, domain 0.64, contracts 0.70, render 0.39, sdk 0.70, astro 2.09.
These include pnpm startup; the old 0.96-second content measurement used a warm
Turbo cache, so it is not a cold-build speed comparison. The baseline numbers
above count `vitest list` title rows, before expansion of parameterized cases.

All seven package typechecks passed. Six packages now declare the already
catalog-pinned `@types/node` as a dev dependency; Astro uses its existing one.
Astro test-support declares the component modules compiled by its Vite plugin.

No relative cross-package build imports remain in this session's packages.
Remaining relative build imports outside scope: MCP's `src/index.test.mjs`
imports config/content (RF2B); API's `src/node-server.test.mjs` and
`src/worker-smoke.test.mjs` import test-utils (RF2C).

### Explicit typechecking exceptions

Nine migrated legacy files retain the design decision 3 escape hatch. Each has
`// @ts-nocheck` followed by a specific `TODO(rf2)`; the zero-exception target
was not reached. The remaining eight source test files are typechecked under
the strict test configs. Runtime assertions are preserved in every file.

- `packages/content/src/index.test.ts`: Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
- `packages/config/src/index.test.ts`: Type mutable configuration fixtures and malformed DSL inputs.
- `packages/domain/src/index.test.ts`: Type legacy incomplete snapshots, branded fixtures and malformed lifecycle inputs.
- `packages/contracts/src/index.test.ts`: Type mutable transport fixtures and deliberately malformed metadata.
- `packages/contracts/src/tolerant.test.ts`: Type heterogeneous schema fixture tables and mutable forward-compatible DTOs.
- `packages/render/src/index.test.ts`: Type heterogeneous block maps, mutable render fixtures and invalid runtime inputs.
- `packages/sdk/src/index.test.ts`: Type scripted transport queues, mutable build pages and discriminated responses.
- `packages/sdk/src/published-site.test.ts`: Type mutable export fixtures, scripted transports and invalid loader inputs.
- `packages/astro/src/index.test.ts`: Type scripted HTTP servers, mutable export fixtures and browser-only import probe.

## Baseline environment

The initial full test command completed in 20.98 seconds but failed its release
preparation fixture because the shell used Node 24.22.1 instead of pinned
24.12.0; it is not a successful performance baseline. After switching to the
pinned toolchain, an intermediate run overlapped dependency relinking and
failed with worker-start errors. Subsequent verification uses a completed
frozen-lockfile install and the pinned toolchain without concurrent installs.

### Expanded runtime cases

The original baseline log and the build-free source runs report the same counts:

| Package | Before | Source after |
| --- | ---: | ---: |
| content | 220 | 220 |
| config | 76 | 76 |
| domain | 27 | 27 |
| contracts | 156 | 156 |
| render | 106 | 106 |
| sdk | 104 | 104 |
| astro | 79 | 79 |
| Total | 768 | 768 |

Seven additional packaged tests passed, one per package.

## Final gates (2026-11-02)

- Pinned Node 24.12.0 / pnpm 12.3.4, frozen-lockfile install completed.
- Root `pnpm typecheck`: passed (38 Turbo tasks plus project config).
- Root `pnpm lint`: passed (22 Turbo tasks, package/admin boundaries and colors).
- Root `pnpm build`: passed (22 tasks).
- Root `pnpm test`: passed (51 Turbo tasks; seven packaged cases; root
  33 files / 250 cases). Wall time: 328.49 seconds, no cached Turbo tasks.
  The initial 20.98-second root measurement used cached tasks and failed the
  toolchain gate, so these runs do not establish a root-suite speedup.
- Root `pnpm spec:validate`: 88 items passed, no failures; strict validation
  of this change also passed.
- Formatting was corrected after the final contributor-table edit; the final
  format check and focused governance tests are recorded below.
- Final build-free recheck after all test typing edits: content 0.47 seconds,
  config 0.48, domain 0.42, contracts 0.45, render 0.44, sdk 0.49, astro 1.20.
  All passed with every package `dist/` temporarily absent, then restored.

The content timing requested in task 4.3 is 0.96 seconds before (old Turbo task
with build dependencies, warm cache) and 0.47 seconds after (direct source-test
script, no built output). The different cache/task paths limit comparison;
the verified result is build independence, not a controlled speed benchmark.

Final `pnpm format:check` passed. Focused boundary, root-script catalog and
internal-documentation guards passed (four files, 77 cases). Final
`git diff --check` and strict change validation passed. All 18 tasks are complete;
the change was synchronized into `workspace-governance` and archived on
2026-11-02.
