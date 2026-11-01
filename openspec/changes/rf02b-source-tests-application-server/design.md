## Context

See proposal.md. Facts (commit `8e47b9b6`):

- `packages/application/src/index.test.mjs`: 31 top-level `test(` calls,
  no `describe`; groups by line range: configuration synchronization and
  evolution 112–410 and 329; media 501–618, 953–1091, 1397–1535; site-build
  dispatcher and tracker 44–75, 619–952; build-export paging 1092; link
  receipts 1119; collection queries 1206–1396; import tokens 1474–1496;
  entry list slug 1535; identity, brands and actor helpers 42, 76, 403.
  Nine other application test files are already per module.
- `packages/server/src/app.test.mjs`: 65 tests; shared helpers `fixture()`
  (38–264, builds an app with in-memory ports and seeded models), `json()`
  (265), `profiles`/`profileSecurity` (309–315), media models and
  `uploadImage`/`jsonRequest` (1383–1422), `accountSecurity`/`send`
  (1713–1771), import token helpers (3615–3690). Route groups in file
  order: builds 168; middleware/liveness/settings/session 249–442; public
  484–634; validation envelopes 636–816; media 817–1115, 1271–1580,
  2338–2458, 3538; entries/globals/lifecycle 1116–1270, 1782–2026,
  2459–2846; setup/build-site 1581–1780; accounts/invitations/reset
  2027–2337; export 2847–3000; links/queries 3001–3219; MCP/OAuth
  3220–3537; import 3697–3965.
- `db`, `auth` and `mcp` each have one test file. `db` tests open
  better-sqlite3 databases and run migrations from `drizzle/`; `auth`
  tests build a Better Auth instance; `mcp` tests use the MCP SDK in
  memory. None needs built output.

## Goals / Non-Goals

**Goals:**

- Five more packages test from source with type-checked tests.
- Each new test file maps to one future module of RF4B/RF4D.

**Non-Goals:**

- Changing `fixture()` behavior or seeded data.
- Reducing test duplication between route files.

## Decisions

1. **Split by future module, not by size.** Application files map to the
   RF4B `ports/`/use-case layout; server files map to the RF4D
   `routes/<area>.ts` list so each route module later gets
   `routes-<area>.test.ts` beside it. A test that spans two groups goes
   with the group whose route it calls first.
2. **One harness module, exported helpers only.** `src/test-support/app-harness.ts`
   exports `fixture`, `json`, `send`, `uploadImage`, `jsonRequest`,
   `accountSecurity`, `importFixture`, `importToken`, `importResolution`,
   `admin`, `editor`, `profiles`, `mediaBlocks`, `mediaModels`,
   `PICTURE_KEY`, `GALLERY_KEY`, `TOKEN`; no `test(` calls. The directory
   name `test-support` is the one the RF2A boundary rule exempts.
   Alternative rejected: keeping helpers in `app.test.ts` and importing
   from a test file, because Vitest would collect that file's tests once
   per importer.
3. **Mechanical first, then typed.** Each file is first renamed with its
   imports re-pointed and run; type errors are fixed second so that a
   behavioral regression is distinguishable from a typing fix. The RF2A
   `// @ts-nocheck` escape hatch applies with the same reporting.
4. **Packaged smoke tests** follow RF2A decision 5 for all five packages.

## Risks / Trade-offs

- [Split loses shared state] Tests in the monolith may rely on module-level
  mutable state (for example `profiles`) → the harness exports factories or
  frozen objects; each file builds its own app through `fixture()`.
- [Wrong group] A test placed in the wrong route file costs a later move →
  acceptable; the RF4D task list re-checks placement.
- [Interim prefix removal order] Removing `pnpm run build &&` from these
  five packages while RF2C packages still depend on their `dist/` → Turbo's
  `test:packaged` of RF2C packages depends on `^build`, which builds these
  packages; verified in tasks by a clean `pnpm test`.

## Migration Plan

One change on a branch after RF2A is archived; revert to roll back.
