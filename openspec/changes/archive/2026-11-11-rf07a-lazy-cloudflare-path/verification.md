## Verification

- CLI source: 177 tests passed; packaged: 147 tests passed. The packed CLI test extracts the actual tarball into a temporary consumer and links its non-peer dependencies from the workspace; it verifies absent and present Miniflare, a real Node migration, a local D1 query and unchanged doctor results. It does not exercise a registry install.
- Generator source: 43 tests passed; packaged: 22 tests passed. All six generated snapshots were regenerated twice and checked for stability.
- `pnpm docs:check`, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and strict change validation passed.
- Miniflare and HTTP tests require local sockets and passed outside the sandbox. An initial sandboxed run failed on denied socket access and Docker inspection; the unrestricted rerun passed. Vitest reported missing source-map source files for the extracted packed artifact.
