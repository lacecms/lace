## 1. Baseline

- [x] 1.1 Build `@lacecms/db` from a clean `dist/` and record in `verification.md`:
  - the sorted runtime keys of `dist/index.js` and the exported declaration
    names of `dist/index.d.ts`;
  - `drizzle-kit export --config drizzle.config.ts` output (hash and line
    count);
  - the `packages/db/drizzle/` file inventory (hashes);
  - `vitest list` titles of `@lacecms/db`;
  - the `packages/db` entries of `scripts/test-typecheck-baseline.json`.

  Verify the raw lists exist in the session scratchpad.

## 2. Schema modules

- [x] 2.1 Create `schema/columns.ts` and the ten table modules of the
  proposal table with verbatim bodies and JSDoc, plus `schema/better-auth.ts`
  (design D1). Delete `schema/tables.ts`. Re-export every module from
  `index.ts` in table order (design D2). Verify:
  - `pnpm --filter @lacecms/db typecheck` passes;
  - every module is under 400 lines and imports only `drizzle-orm` and
    `schema/` modules in the D1 direction.
- [x] 2.2 Point `drizzle.config.ts` at the explicit module array (design D3).
  Verify:
  - `pnpm db:check` passes and `git status packages/db/drizzle` is clean;
  - the `drizzle-kit export` output is recorded after the split, with any
    difference from 1.1 limited to statement order.

## 3. Outbox owner and `literal-like`

- [x] 3.1 Move `builds/outbox.ts` with `git mv` to `builds/requests.ts`, and
  move `OutboxRow` into new `outbox/rows.ts` (design D4). Add `outbox` to
  `scripts/source-layout.json` and the entry header. Verify
  `node scripts/check-boundaries.mjs` passes.
- [x] 3.2 Delete `shared/literal-like.ts`; import `literalLikePattern` from
  `@lacecms/content` in `content/collection-list.ts` and re-export it by name
  from the entry. Move its test to `content/collection-list-like.test.ts`,
  typed, and remove its entry from `scripts/test-typecheck-baseline.json`
  (design D5). Verify the moved test passes and the boundary checker accepts
  the shrunk baseline.

## 4. Verification

- [x] 4.1 Rebuild `@lacecms/db` from a clean `dist/`. Verify:
  - runtime keys and declaration names equal the 1.1 baseline;
  - `vitest list` titles equal the baseline except the moved test's path;
  - `@lacecms/db` `test` and `test:packaged`, and `platform-node` and
    `platform-cloudflare` tests, pass.
- [x] 4.2 Record the outcome in the roadmap RF4 section. Run root
  `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and
  `pnpm openapi:check`, then
  `pnpm exec openspec validate rf04i-drizzle-schema-by-domain --type change --strict`.
  Record the results in `verification.md` and update the roadmap progress
  row.
