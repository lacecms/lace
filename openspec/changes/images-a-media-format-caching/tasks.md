## 1. Architecture

- [ ] 1.1 Update `docs/mvp-architecture.md` §9.7 (GIF verification rules and logical-screen dimensions; the allowlist already names GIF) and §12 public endpoints (binary `ETag` from media identity, `Cache-Control` values, `304` after eligibility, one-day staleness after unpublication), and `docs/cloudflare-worker.md` (GIF in the Worker inspector). Verify the text matches the delta specs.

## 2. GIF

- [ ] 2.1 Add `image/gif` to `ALLOWED_MEDIA_MIME_TYPES`/`MediaMimeType` (`packages/application`) and `mediaMimeTypeSchema` (`packages/contracts`), and GIF87a/GIF89a detection to `detectMediaMimeType`. Verify with `pnpm turbo run test --filter=@lacecms/application --filter=@lacecms/contracts` cases for both signatures, a short input and the `type=image/gif` query schema.
- [ ] 2.2 Implement `parseGif` (design D1) in `packages/application/src/image-container.ts` with byte-built fixtures for a static GIF87a, an animated GIF89a with global and local color tables, a missing trailer, trailing bytes, a frame outside the logical screen, no image descriptor and an LZW code size of 12. Verify with the application tests and `packages/platform-cloudflare/src/image-inspector.test.mjs`.
- [ ] 2.3 Map `image/gif` to sharp's `gif` in `packages/platform-node/src/image-inspector.ts`. Verify with a Node inspector test that accepts the animated fixture with its logical-screen dimensions and rejects PNG bytes declared as GIF.
- [ ] 2.4 Add an HTTP upload test on the Node and Worker server suites: an animated GIF returns `201` with `mimeType` `image/gif`, and `GET /api/v1/admin/media?type=image/gif` lists only it. Verify with `pnpm turbo run test --filter=@lacecms/server --filter=@lacecms/platform-cloudflare --filter=@lacecms/platform-node`.
- [ ] 2.5 Add GIF to the admin `media-limits.ts` (types, extension, label, constraint text) and the library type filter options in `library-query.ts`. Verify with `media-limits.test.ts` and `library-query.test.ts` cases (GIF accepted locally, `type=image/gif` restored from the URL, `type=image/svg+xml` ignored) and the admin unit suite.

## 3. Cache validators

- [ ] 3.1 Split media binary reads into eligibility resolution and stream opening (design D4) in `MediaUseCases`, keeping `readPublic`/`preview` behavior. Verify with application tests that resolution never touches `ObjectStorage` and that existing binary-read tests still pass.
- [ ] 3.2 Add the `If-None-Match` parser, the binary tag and the `Cache-Control` values (design D3, D5) to the public and preview routes in `packages/server/src/app.ts`, and describe the headers and `304` in their OpenAPI route descriptions. Verify with server tests for every `hono-app-factory` scenario (match → `304` without a storage read, metadata edit keeps the tag, unpublished → not found, preview private/anonymous, malformed header → `200`, `*`, weak tag, list of tags), then regenerate and stage `api-v1.json` and pass `pnpm openapi:check`.
- [ ] 3.3 Confirm cross-runtime parity. Verify with the cross-runtime product phase (`pnpm exec vitest run --config vitest.cross-runtime.config.mjs`) extended by one revalidation of a published image on Node and on the Worker.

## 4. Verification

- [ ] 4.1 Run root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm exec openspec validate images-a-media-format-caching --type change --strict`; all pass.
