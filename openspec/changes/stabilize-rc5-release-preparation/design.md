## Context

See [proposal](proposal.md) for the two failures. The release run on `324ec823` reached a fresh 360-entry consumer lockfile. The verifier passed online, and after fetching full npm metadata into the local cache, the unchanged offline command also passed in a new preparation. The subsequent API Docker build used 12.21.0 and rejected the admin Vite specifier (`catalog:` in the lockfile and `8.3.8` in the effective manifest). A diagnostic AMD64 build using the same context with pnpm 12.3.4 passed the frozen install and verified 969 entries.

After the acceptance runner began pinning pnpm in `19e94d91`, GitHub Actions stopped before the starter build because Corepack-managed pnpm rejects `pnpm with`. The resolver needs to support the Corepack launcher used by CI and standalone pnpm used for local release verification.

## Goals / Non-Goals

**Goals:** Repeatable package and image preparation with public registry access and consistent lockfile interpretation across the pinned build environments.

**Non-Goals:** A disconnected release workflow, a pnpm upgrade, or changes to supported Node and pnpm minimums.

## Decisions

- Pin the API compile stage and both builder stages that install pnpm to `12.3.4`, matching the root `packageManager` and CI. Use the existing release-model Dockerfile checks to catch drift at all three install sites. The generated consumer minimum stays governed by the runtime tooling policy. Adopting a newer pnpm and regenerating the workspace lockfile would require another toolchain compatibility review.
- Keep the two-install sequence for disposable consumers. Resolve the local tarball overrides first, then run `pnpm install --frozen-lockfile` with normal registry access for the package smoke and the exact-artifact acceptance paths. This preserves the frozen graph and lets pnpm obtain publication-time metadata when needed. Prewarming a particular machine's cache was useful for diagnosis. It would add a prerequisite tied to pnpm's metadata format and resolver behavior. Skipping policy verification would remove an existing release check.
- Keep the diagnostic builds separate from release evidence. Run the normal preparation and checksum verification on the reviewed clean revision. Use the saved artifact inventory as input to exact-artifact acceptance.
- Copy the exact workspace `packageManager` declaration into the disposable tools manifest and probe `npm_execpath` through a normal pnpm script. Both launchers can resolve the project pin through that manifest. Keep the resolved executable on `PATH` and verify its version before running consumer commands.

## Risks / Trade-offs

- The frozen checks can depend on registry availability. The release guide already requires public network access and will record the toolchain pin and metadata behavior.
- A stale Docker cache can conceal prior toolchain drift. Compare the runtime builder version on both architectures and validate the version declarations during `release:check`.
- Some acceptance journeys add their own consumer dependencies. Check each frozen-install path reached by exact-artifact acceptance and rerun with an empty metadata cache to cover those paths.
