## Why

After RF2A the shared Vitest configuration, the `.test.ts` convention, the
packaged-test gate and the boundary exemption exist, but `application`,
`db`, `auth`, `server` and `mcp` still test `dist/` behind an interim
`pnpm run build &&` prefix. Two of their test files are also monoliths:
`packages/application/src/index.test.mjs` (1,565 lines, no `describe`) and
`packages/server/src/app.test.mjs` (3,966 lines, 65 tests over every route
group). This is Session RF2B of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md); it
converts the application and server layer and splits the two monoliths
along the module seams RF4B and RF4D will use, so those splits move tests
that already live next to their module.

## What Changes

- **Source tests** for `application`, `db`, `auth`, `server` and `mcp`:
  every `*.test.mjs` becomes `*.test.ts` importing source, with
  `vitest.config.mjs`, `vitest.packaged.config.mjs`, `tsconfig.test.json`,
  `packaged-exports.packaged.test.mjs` and the `test`, `test:watch`,
  `test:packaged`, `typecheck` scripts exactly as RF2A defined them; the
  interim build prefix is removed from these five packages.
- **`application/src/index.test.mjs` splits by use case** into
  `index.test.ts` (package identity, brands, actor display helpers),
  `configuration-sync.test.ts`, `site-build.test.ts`,
  `media-use-cases.test.ts`, `collection-queries.test.ts`,
  `build-export.test.ts`, `internal-links.test.ts` and
  `import-tokens.test.ts`.
- **`server/src/app.test.mjs` splits by route group** into
  `app.test.ts` (middleware order, liveness, request IDs, envelopes),
  `routes-session-settings.test.ts`, `routes-accounts.test.ts`,
  `routes-users-invitations.test.ts`, `routes-builds.test.ts`,
  `routes-media.test.ts`, `routes-content.test.ts`,
  `routes-public-export.test.ts`, `routes-mcp.test.ts` and
  `routes-import.test.ts`, with the shared harness (`fixture`, `json`,
  `send`, `uploadImage`, `jsonRequest`, `accountSecurity`, `importFixture`,
  profile fixtures) in `src/test-support/app-harness.ts`.
- No assertion changes; case counts per package stay at the baseline
  (application 130, db 26, auth 4, server 85, mcp 5).

Non-goals: platforms, CLI, generator, apps and `test-utils` (RF2C); any
production code change; reorganizing `email.test.mjs`, `build-site.test.mjs`
or the other already-focused test files beyond renaming.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This session applies the requirement RF2A added to
`workspace-governance` to five more packages without changing any
spec-level behavior; `.openspec.yaml` sets `skip_specs: true`.

## Impact

- Code: five packages' test files, configs and scripts; two monoliths
  replaced by 18 focused files plus one harness module; no `src` runtime
  file changes.
- Boundaries: `server/src/test-support/app-harness.ts` imports `vitest`,
  `@lacecms/test-utils`, `@lacecms/config` and `@lacecms/content`, all
  permitted for test support by the RF2A rule.
- Dependencies: none.
- Downstream: RF4B and RF4D move `application` and `server` modules whose
  tests now sit beside them.
