## 1. Shared OpenAPI pieces

- [x] 1.1 Add OpenAPI response helpers to `packages/server/src/shared`, with a
  unit test that resolves both objects to the shared envelope schema:
  - `validationFailure`: `422` with the shared envelope;
  - `authorizationFailure`: `403` with the shared envelope.

  Verify: `pnpm --filter @lacecms/server test` passes.
- [x] 1.2 Update `routes/docs.ts`:
  - pass `defaultValidationErrorResponse: false`;
  - declare the `session`, `buildToken` and `importToken` security schemes.

  Verify: the generated document contains the three schemes and no
  `"Validation Error"`.

## 2. Route descriptions

- [x] 2.1 Add complete descriptions, with the real status and schema, to:
  - `POST /api/v1/admin/api-tokens`: `201` with the created-token schema;
  - `PATCH /api/v1/admin/users/:userId`;
  - `POST /api/v1/setup/admin`.

  Verify: the route tests still pass, and the generated operations carry
  summaries and typed success responses.
- [x] 2.2 Document the public query parameters with the contract constants
  for the bounds: `after` and `limit` on `public/collections/:modelKey` and
  `public/records/:modelKey`, and the required `path` on
  `public/content/by-path`. Leave parsing unchanged. Verify:
  `public.test.ts` and `public-records.test.ts` pass unchanged.
- [x] 2.3 Update every route file:
  - add `validationFailure` to each operation with a validator or a hand
    parser;
  - replace each `401 "Session required"` with `authorizationFailure`;
  - add the explicit `security` from design D4 to every operation.

  Verify: `pnpm --filter @lacecms/server test` passes with no route test
  changed.

## 3. Guard and artifact

- [x] 3.1 Add `routes/openapi-contract.test.ts` as described in design D5. It
  covers registered-route coverage, no `400` or `401`, `422` where input is
  validated, explicit `security`, import-security parity with
  `isImportRoute`, and the delta-spec scenarios. Verify:
  - the test passes;
  - temporarily removing one `describeRoute` makes it fail and name the
    route. Revert the removal after checking.
- [x] 3.2 Regenerate the artifact with `pnpm build` and then `pnpm
  openapi:generate`. Verify: `pnpm openapi:check` passes, and the artifact
  diff shows no `"Validation Error"`, no `401`, and new `securitySchemes`.

## 4. Documentation and gates

- [x] 4.1 Update the `apps/docs` API reference wherever it states validation
  or authentication status codes, so it matches `422` and `403`. Verify:
  `pnpm docs:check` passes.
- [x] 4.2 Run the root gates: `pnpm typecheck`, `pnpm lint`, `pnpm
  format:check` and `pnpm exec openspec validate align-openapi-contract
  --type change --strict`. Verify: all succeed.
