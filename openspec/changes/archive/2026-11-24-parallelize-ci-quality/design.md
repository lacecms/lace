## Context

`.github/workflows/ci.yml` runs every gate in one job. The local `pnpm test` command runs Turbo source and packaged tasks with bounded workers, then runs Vitest over `tests/`. The source tasks resolve workspace imports from TypeScript. Packaged tasks and some root tests, including `tests/json-validator-parity.test.mjs`, read compiled output. `pnpm typecheck` brings in dependency builds through the Turbo graph. The acceptance runner calls `pnpm build` before packing workspace packages, and `docs:check` directly builds the documentation. These paths need explicit handling to reuse the CI build.

## Goals / Non-Goals

Give contributors a result for each group and let them retry a failed group. Verify complete coverage and a single workspace compilation on a clean, artifact-backed run. Keep the local root commands available for ordinary work. The release, deployment, and optional generated-project workflows retain their own entry points.

## Decisions

### Independent jobs and aggregate status

Keep `pull_request`, `push` to `main`, and the existing cancellation policy in `CI`. Start formatting, lint, lockfile validation, OpenSpec, source tests, and the workspace build independently wherever their inputs permit. Give typecheck and MCP compatibility their own jobs with `needs: build`. The MCP fixture imports the compiled auth, Worker, and generator packages. Retain the `quality` job ID and existing check name. The aggregate job uses `if: always()` and explicitly requires success from every required dependency, including the complete test matrix. It runs without checkout or dependency setup.

Use one repository-local composite action for pinned Node, Corepack and pnpm, pnpm store restoration, and the frozen install. Each consumer starts with a fresh checkout. A standalone install job would still leave other runners needing to reconstruct their workspaces. Keep the existing lockfile-derived store key and install Chromium in the jobs that actually launch browser tests.

### Test partitions

Use two `app-admin` Vitest shards through one matrix and set `fail-fast: false`. Run the local D1 repository contract on two runners. Its original file took about seven minutes on its own, so split its test registration into two explicitly selected files with a shared typed D1 harness. Partition the canonical case list deterministically, preserve case names, fresh databases and the cleanup assertions, and keep the existing single-file-at-a-time policy within each Cloudflare invocation. The full local Cloudflare test command discovers both files. Update the cross-runtime and security verification selectors and their focused test to run both files. The Node adapters keep using the original registry without a partition. Compare the union of the two D1 test listings with the canonical case list and the Admin shard listings with the ordinary package listing.

Use Turbo for the remaining workspace source tasks and validate its task list after excluding the dedicated suites. Include the rest of the Cloudflare source files exactly once. Run packaged tests and root tests in jobs with built output. Compare their selection with the current `pnpm test` graph and root Vitest command. Keep the existing worker limits initially. Increasing concurrency on the original runner would still couple retries and increase contention between DOM and Miniflare suites.

### Build handoff

One clean job runs `pnpm build` and publishes a workflow artifact with the revision, validated workspace-relative outputs, and the build-only Turbo cache entries needed by `pnpm typecheck`. Include `dist/` outputs from the build graph, the copied Cloudflare `admin/`, and the prepared documentation OpenAPI input where needed. Address the artifact by a build job output that remains usable on a partial rerun. Validate its revision and required contents before consuming it. Keep pnpm store caching in GitHub's cache and the build handoff scoped to the workflow run.

Keep `pnpm typecheck` and verify that its dependency builds resolve to artifact-backed cache hits. Use the installed Turbo version's task graph to verify the expected build hashes and coverage on a fresh consumer. Packaged tasks run against the restored outputs with their prerequisite build scheduling disabled for CI, after checking that the artifact contains those prerequisites. The PR #86 log shows distinct build hashes during typecheck and the packaged test invocation, so restoring the same cache alone cannot establish that the packaged invocation skips recompilation. Preserve the normal Turbo dependencies for the local command.

Give the starter and existing-site journeys an explicit, validated prebuilt path for CI while keeping their ordinary build path. Both journeys still generate and install packages in temporary consumer workspaces and build those sites independently. Run OpenAPI drift detection against the restored API build. Retain all documentation checks through the workspace docs build, package typecheck and source test, plus the independent variant build using the prepared input. Verify the check mapping before removing the original compound CI invocation.

## Risks / Trade-offs

- Artifact transfer and runner startup add overhead. Record the build, upload, download, and longest test job times on the first comparable GitHub run alongside total elapsed time.
- Test partitioning can silently omit a case or run one twice. Compare discovered inventories and keep adding ordinary workspace source tests through the existing Turbo graph.
- A missing or expired artifact blocks a consumer. Report the missing input and fail that job so a new build can supply it.

## Migration Plan

Ship the workflow and entry point changes together. Verify the aggregate check name on a pull request and check that an isolated failed test can be rerun with the original successful build. Reverting the change restores the original job and local entry points continue to work through the rollout.
