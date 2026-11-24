## 1. Test partitions

- [x] 1.1 Split the local D1 repository contract registration and update the verification selectors. Compare both file listings with the canonical case list, run the two D1 partitions and the focused verification runner test, and check the new files against source layout and test typechecking rules.
- [x] 1.2 Define the two Admin shards, remaining workspace source coverage, packaged tests and root tests. Compare the combined Admin discovery with the ordinary Admin listing, compare the remaining source and packaged task selection with the root Turbo graph, and verify that the remaining Cloudflare invocation excludes exactly the dedicated contract files.

## 2. Parallel workflow and shared build

- [x] 2.1 Factor the pinned setup, pnpm store caching and frozen installation into a CI composite action. Add independent checks and a build job, then verify the Node and pnpm versions, cache key and lockfile check against the current workflow.
- [x] 2.2 Publish and consume the same-run workspace build artifact. In a fresh checkout, validate the artifact and run typecheck, packaged and root tests, MCP compatibility, OpenAPI and documentation verification. Confirm that dependency builds are cache hits or already satisfied by the restored outputs, that a missing or mismatched artifact is reported, and that the compiled consumers do not repeat the workspace build.
  - The original HEAD reproduced three stale test assumptions after direct admin user creation. Seeded a sign-in-ready backup administrator for the MCP lifecycle and verified password-bearing creation still fails without mutating protected state. The restored build passed all 114 MCP and 440 root tests and all 20 packaged tasks.
- [x] 2.3 Run the packed starter and existing-site journeys from the shared build in CI. Verify both journeys with restored inputs, and verify the existing local path still builds from a clean checkout before packing.
  - Both prebuilt journeys passed without the workspace build stage. The ordinary starter passed from a clean checkout. Refreshed only the generated operations guide digests that were stale in the six snapshots on the original HEAD.
- [x] 2.4 Wire the test partitions and the remaining checks into `ci.yml` with `quality` as the aggregate. Validate workflow syntax and dependencies. Check that failure, cancellation or a skipped required job blocks the aggregate and that a failed shard does not cancel its siblings.

## 3. Verification and contributor guidance

- [x] 3.1 Document the jobs, the retry behavior and local equivalents in `DEVELOPMENT.md`. Run the narrowest changed tests, then root typecheck, lint, formatting check and strict OpenSpec validation. Verify that every gate from the original workflow still has a job.
- [ ] 3.2 On the first comparable GitHub PR run, verify `CI / quality` and record total elapsed time, longest jobs and artifact transfer time. On a failed-job retry, verify the successful build and independent checks retain their results, and the retried job can retrieve the existing artifact when it needs it.
