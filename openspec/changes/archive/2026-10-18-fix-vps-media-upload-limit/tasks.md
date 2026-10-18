## 1. Proxy configuration

- [x] 1.1 Add the server-level `client_max_body_size 1m` and the exact `location = /api/v1/admin/media` block (design D1) to `deploy/nginx.conf` and copy the file unchanged to `packages/create-lace/templates/deploy/nginx.conf`. Verify with `docker run --rm -v $PWD/deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro --add-host api:127.0.0.1 nginx:1.27.5-alpine nginx -t`.
- [x] 1.2 Add `tests/deploy-proxy.test.mjs` per design D2. Verify that it passes, and that it fails when the media location is set to `10m`, when the two copies differ, or when `proxy_request_buffering off` is removed (checked by temporary edits, then reverted).

## 2. Real-image probe

- [x] 2.1 Add `scripts/nginx-upload-probe.mjs` and the `proxy:probe` root script per design D3. Verify that `pnpm proxy:probe` reports 8 MiB → `201` with 8,388,608 bytes received upstream, 12 MiB → `413` with nothing received, 2 MiB JSON → `413`; and that against the unfixed config (`git stash`) the 8 MiB case fails with `413`.

## 3. Template upgrade

- [x] 3.1 Set `TEMPLATE_VERSION` to `0.31.0` in `packages/create-lace/src/inventory.ts` and add the 0.31.0 upgrade instruction (design D4) to `packages/create-lace/templates/.lace/upgrade-instructions.json`. Verify with `pnpm turbo run test --filter=create-lace`.
- [x] 3.2 Regenerate generated-project snapshots with `node scripts/generated-project-acceptance.mjs snapshots --update` and extend the CLI upgrade test in `packages/cli/src/upgrade-command.test.mjs` with a 0.30.0 → 0.31.0 case (unmodified proxy updated, edited proxy reported as conflict). Verify with `pnpm turbo run test --filter=@lacecms/cli` and the root `tests/generated-project-acceptance.test.mjs`.

## 4. Documentation

- [x] 4.1 Document the proxy limits (1 MiB JSON, media upload ceiling, where to change them together) in `deploy/README.md`. Verify the text matches the delta spec.

## 5. Verification

- [x] 5.1 Run root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate fix-vps-media-upload-limit --type change --strict`; all pass.
