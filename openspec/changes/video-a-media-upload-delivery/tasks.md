## 1. Architecture and plan

- [ ] 1.1 Update `docs/mvp-architecture.md`: §8 initial field types (media `accept`, default images only), §9.7 media (MP4/WebM, 10 MiB image and 64 MiB video limits, video verification rules, two upload transports, ranged delivery, nosniff, no migration), §12 media routes (binary upload, `kind` query, range statuses). Update `docs/cloudflare-worker.md` limits. Verify the text matches the delta specs.

## 2. Shared media policy and fixtures

- [ ] 2.1 Add media kinds, `IMAGE_MIME_TYPES`, `VIDEO_MIME_TYPES`, `mediaKindOf`, `MAX_IMAGE_BYTES`, `MAX_VIDEO_BYTES`, `MAX_MEDIA_UPLOAD_BYTES`, `MAX_VIDEO_DIMENSION` and the deprecated `MAX_MEDIA_BYTES` alias to `packages/application`; widen `MediaMimeType`; mirror the MIME list and add `mediaKindSchema` in `packages/contracts`. Verify with `pnpm turbo run test --filter=@lacecms/application --filter=@lacecms/contracts` and `pnpm typecheck`.
- [ ] 2.2 Add synthetic fixture builders to `packages/test-utils` for MP4 (`moov` before and after `mdat`, 64-bit `mdat`, rotation matrix, audio-only, `qt  ` brand, image brand) and WebM (known and unknown segment size, tracks after cluster, Matroska doc type). Verify with `packages/test-utils` unit tests that the builders produce the documented byte layouts.

## 3. Inspection

- [ ] 3.1 Extend `detectMediaMimeType` for MP4 and WebM, keeping AVIF precedence. Verify with unit tests for each signature, AVIF vs MP4 brands, a GIF still rejected as unsupported, and short inputs.
- [ ] 3.2 Implement the streaming `VideoContainerInspector` (`packages/application/src/video-container.ts`) for MP4 and WebM per design D4, re-export it from `@lacecms/platform-cloudflare`. Verify with unit tests over every fixture from 2.2, chunk boundaries at every byte for one small fixture, the 16 MiB `moov` and 1 MiB `Tracks` caps, the 8,192-pixel limit, and a mutation test that flips/truncates bytes of valid fixtures and expects only success or the stable invalid-media error.

## 4. Object storage

- [ ] 4.1 Change the `ObjectStorage` port: `PutObjectInput.size` and `get(key, { range })`; update in-memory/test storages in `packages/test-utils`. Verify with `pnpm typecheck`.
- [ ] 4.2 Implement R2 streamed writes through `FixedLengthStream`, ranged reads, the idle watchdog for streamed writes and domain-error pass-through in `packages/platform-cloudflare/src/r2-storage.ts`. Verify with `r2-storage.test.mjs` cases for round trip, 60 MiB stream without full buffering (a counting stub), overrun, underrun, over-limit size, range read, stalled stream, slow progressing stream and a domain error from the body.
- [ ] 4.3 Implement MinIO streamed writes (`Readable` body + `ContentLength`), ranged reads (`Range` header), idle watchdog and domain-error pass-through in `packages/platform-node/src/minio-storage.ts`. Verify with unit tests over a stub S3 client and the MinIO integration test for a streamed write and a ranged read.

## 5. Media use cases

- [ ] 5.1 Rework `MediaUseCases.create` to the declared-length pipeline of design D3 (image buffered path, video streamed path with late-failure object deletion). Verify with application tests for every scenario in the `media-use-cases` delta: MP4, rotated MP4, WebM, QuickTime, audio-only, oversized byte/dimension, 20 MiB WebM vs 20 MiB PNG, declared length over limit, early end, overrun, late `moov` failure with deletion and with failed deletion (operational error).
- [ ] 5.2 Add the optional range to `readPublic` and `preview`, returning size and served range, refusing ranges at or beyond the size without reading storage. Verify with application tests for full, partial, unsatisfiable and missing-object reads.
- [ ] 5.3 Accept `kind` in `MediaUseCases.list`, validate `type ∈ kind`, and implement the `kind` filter and the five-element cursor fingerprint in `packages/db/src/sql-content.ts` for SQLite and D1. Verify with the repository contract tests for `kind=image`, `kind=video`, combined `type`, and cursor rejection across kinds on both dialects.

## 6. HTTP

- [ ] 6.1 Implement the transport dispatch on `POST /api/v1/admin/media` (multipart unchanged cap; `application/octet-stream` with `filename` and `Content-Length` validation; any other type → 422 `/file`) in `packages/server/src/app.ts`. Verify with server tests for every `hono-app-factory` upload scenario, including that an 80 MiB declaration reads no body bytes.
- [ ] 6.2 Implement `parseByteRange` and the ranged `binaryResponse` (200/206/416, `Accept-Ranges`, `Content-Length`, `Content-Range`, `nosniff`) for the public and preview routes. Verify with server tests for `bytes=0-1`, `bytes=-1000`, `bytes=5000-`, `bytes=0-99999` (clamped), multiple ranges, other unit, `If-Range`, and an unpublished item with a range.
- [ ] 6.3 Add `kind` to `mediaListQuerySchema`, describe both upload forms, `Range` and the 206/416 responses in the OpenAPI route descriptions; regenerate and stage `apps/api` `api-v1.json`. Verify with contract tests and `pnpm openapi:check`.
- [ ] 6.4 Run the Worker and Node HTTP integration suites with a streamed binary video upload followed by a ranged public read. Verify with `pnpm turbo run test --filter=@lacecms/platform-cloudflare --filter=@lacecms/platform-node` and the cross-runtime product phase (`pnpm exec vitest run --config vitest.cross-runtime.config.mjs`).

## 7. Accepted media kinds

- [ ] 7.1 Add the `accept` option to media fields in `packages/content` (validation, canonical order, omission of `["image"]`, metadata projection, `isFieldMetadata`). Verify with content tests for valid, default-equivalent and invalid declarations and a pinned-hash test proving unchanged hashes for configurations without `accept`.
- [ ] 7.2 Return accepted kinds from `collectFieldMedia` and enforce them with the existing `loadMediaMany` result in `packages/application/src/content-use-cases.ts` (`$seo` images only). Verify with application tests for a video in the `image` block, a video in an `accept: ["video"]` custom block field inside a list, and a video SEO image.
- [ ] 7.3 Classify `accept` widening as `compatible` and narrowing as `breaking` in `packages/application/src/configuration-evolution.ts`. Verify with `configuration-evolution.test.mjs` cases for widening, narrowing and a combined change that also raises `maxLength` elsewhere.

## 8. Deployment

- [ ] 8.1 Requires `fix-vps-media-upload-limit` applied. Raise the media location in both `deploy/nginx.conf` copies to `client_max_body_size 70m` with `proxy_read_timeout`/`proxy_send_timeout`/`client_body_timeout` `300s`, bump the template version with an upgrade instruction, regenerate generated-project snapshots, and update the upload limits in `deploy/README.md`. Verify with the nginx consistency test from that change, the template/upgrade tests, and a Docker probe through `nginx:1.27.5-alpine` where a 60 MiB binary body reaches the upstream and a 71 MiB body gets `413`.

## 9. Verification

- [ ] 9.1 Run root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm exec openspec validate video-a-media-upload-delivery --type change --strict`; all pass.
