## 1. Define the portable policy

- [x] 1.1 Add the read-only descriptor table and configured-model resolver in `content`. Expose them through the permitted package entries. Cover every row of the policy matrix and reject an unknown literal, a missing kind and a missing policy in type tests. Verify source and packaged imports and run the content and domain typechecks.
- [x] 1.2 Route `isSingletonKind`, domain route predicates, content payload validation, config reference-target checks and contract kind validation through the shared policy. Run focused route, aggregate, reference and model DTO tests, including an unregistered string and an inherited object key. Check that existing failure paths and public predicate signatures are preserved.

## 2. Use the descriptors in storage and application rules

- [x] 2.1 Generate `content_models_kind_check` from registered keys in the live Drizzle schema. Run `node scripts/check-drizzle-schema.mjs` and verify direct SQL on migrated SQLite and local D1 accepts all three kinds and rejects an unknown kind. Verify the migration journal, SQL and snapshots have no diff.
- [x] 2.2 Use the descriptors in sync planning and apply, stored-model decoding, entry lifecycle, draft normalization and persistence plans. Run sync and lifecycle contracts on both runtimes, covering idempotent provisioning, refusal of a kind-changing rename, singleton conflicts, and several entries in one route-less collection.
- [x] 2.3 Update link/reference eligibility, preview admission and CLI import decisions. Run the focused suites with a routed collection, a route-less record and a global. Verify a record can be a reference-field target, has no URL-link target or standalone preview, and retains its current import identity rules.

## 3. Preserve public delivery and admin behavior

- [x] 3.1 Apply the resolved public family in server model selection and the descriptor-derived eligibility in shared public/export queries. Run public-route and build-export tests covering wrong-family 404s, by-path lookup, the routed-to-record cursor transition and first-page globals. Run `pnpm openapi:check` to verify wire compatibility.
- [x] 3.2 Replace admin policy branches in model navigation, entry actions, draft and SEO forms, and publication dialogs. Run focused admin tests for singleton navigation, both collection lists, global title ownership, slug editing and permission-gated actions. Verify custom icons still override the kind fallback.

## 4. Verify parity and record the result

- [x] 4.1 Run shared repository contracts on file-backed and in-memory Node SQLite and local D1 for sync, entry lifecycle, publication races and delivery. Verify the same outcomes for the four configured model shapes and the existing guarded conflict outcomes.
- [x] 4.2 Document descriptor ownership and the future migration rule in the relevant internal architecture sections. Repeat the production kind-comparison inventory across packages and admin, including SQL predicates. Record the scope, count and reasons for remaining identity comparisons alongside the roadmap §3 baseline in the EX5A progress log.
- [x] 4.3 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex05a-model-kind-descriptors --type change --strict` and `pnpm spec:validate`. Record results for this session.
