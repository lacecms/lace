## 1. Baseline

- [x] 1.1 Add the design decision 9 case *unexpected MCP and OAuth failures keep the protocol server_error body* to `packages/server/src/routes-mcp.test.ts`; verify it passes on the unsplit code, and that replacing the `onError` protocol branch with the REST envelope makes it fail (then restore).
- [x] 1.2 Clean `packages/server/dist`, build `@lacecms/server`, and record the design decision 8 baselines in `verification.md`: runtime keys of `dist/index.js`, value and type export names of `dist/index.d.ts`, the `app.routes` `(method, path)` sequence for the maximal fixture, the SHA-256 of `apps/api/openapi/api-v1.json`, and the sorted `vitest list` names with file prefixes stripped (expected 87 in 14 files); verify the raw lists exist in the session scratchpad and the counts match.

## 2. Shared, runtime and security

- [x] 2.1 Create `shared/http.ts`, `shared/request.ts`, `shared/content-config.ts` and `shared/account-dtos.ts` from the design decision 1 ranges, and import them from `app.ts`; verify the package suite and `pnpm --filter @lacecms/server typecheck` pass.
- [x] 2.2 Create `shared/protocol.ts` with `isMcpSurfacePath`, `isProtocolErrorPath` and `protocolErrorResponse`, and rewrite the four call sites in `app.ts` as design decision 6 describes, including the local `payloadTooLarge`; verify the package suite passes, including the task 1.1 case and the 413 and 429 assertions in `routes-mcp.test.ts`.
- [x] 2.3 `git mv` `build-site.ts`, `mcp-settings.ts` and `email.ts` into `runtime/`, and `import-routes.ts` into `security/`; create `security/sensitive-limits.ts`; update `index.ts` and `app.ts` imports; verify the package suite and package typecheck pass.

## 3. Composition

- [x] 3.1 Create `composition/input.ts` with `Actor` and the exported capability interfaces, and `composition/route-context.ts` with `ActorContext`, `RouteContext` and `createRouteContext` (design decision 4), moving the closure bodies verbatim; make `createLaceApp` call `createRouteContext(input)` once and use its members; verify the package suite and package typecheck pass.

## 4. Route modules

- [x] 4.1 Create `routes/protocol.ts`, `routes/health.ts`, `routes/setup-session.ts`, `routes/accounts.ts`, `routes/admin-users.ts`, `routes/credentials.ts` and `routes/builds.ts`, each with a `register<Area>Routes(app, routeContext)` that destructures the context members it uses, and call them from `app.ts`; verify the package suite passes.
- [x] 4.2 Create `routes/media-binary.ts`, `routes/media-upload.ts` with `readMediaUpload` (design decision 5), and `routes/media.ts`; verify the package suite passes, including the oversize, malformed multipart, invalid tag and unavailable media cases in `routes-media.test.ts`.
- [x] 4.3 Create `routes/content.ts`; verify the package suite passes.
- [x] 4.4 Create `routes/build-export.ts` with `readBuildExportQuery` and `readBuildExportPage` (design decision 5), and `routes/public.ts`; verify the package suite passes, including the repeated-parameter, stale-cursor and 304 cases in `routes-public-export.test.ts`.
- [x] 4.5 Create `routes/docs.ts` with the OpenAPI vendor registration and `registerDocsRoutes`; verify the package suite passes and `pnpm openapi:check` leaves `apps/api/openapi/api-v1.json` unchanged.

## 5. Factory, entry and size guard

- [x] 5.1 Move what remains of `app.ts` (the `ContextVariableMap` augmentation, `createLaceApp`, `onError`, the five middlewares, the registrations in the design decision 3 order, `notFound`) to `app/create-app.ts`, and delete `app.ts`; verify the package suite passes and `app/create-app.ts` contains no route handler.
- [x] 5.2 Finalize `index.ts` as commented directory groups headed by the design decision 2 direction, with `export *` only for the three fully public modules and explicit lists elsewhere (design decision 7); remove `packages/server/src/app.ts` from `scripts/oversized-source-baseline.json`; verify only `index.ts` remains as a production module at the `src/` root, no production module exceeds 1,000 lines, and `node scripts/check-boundaries.mjs` passes.
- [x] 5.3 `git mv` the test files to the design decision 10 locations with import-path-only edits; verify only `index.test.ts` and `packaged-exports.packaged.test.mjs` remain as tests at the `src/` root, the stripped sorted `vitest list` names equal the task 1.2 baseline (87), and `pnpm --filter @lacecms/server typecheck` passes.

## 6. Equivalence

- [x] 6.1 Clean `packages/server/dist`, rebuild, and run the design decision 8 comparisons (export surface, route table, OpenAPI hash, module acyclicity and direction); verify every comparison matches, no stale module remains in `dist/`, and record the results in `verification.md`. Delete the raw scratch outputs.

## 7. Documentation

- [x] 7.1 Update `docs/refactoring-roadmap.md`: the RF4D text records the directory layout, the `credentials`, `protocol` and `health` modules, the context-versus-module-import correction and the routes-local parser placement; the §3 server size row and the oversized-files row show the RF4D result (14 → 13 baselined); add the RF4D implementation progress row; verify `pnpm format:check` passes.

## 8. Gates

- [x] 8.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test` (includes `test:packaged`), `pnpm openapi:check`, `pnpm spec:validate` and `pnpm exec openspec validate rf04d-server-module-split --type change --strict`; verify all pass, with root and per-package case counts equal to the baseline plus the one task 1.1 case.
