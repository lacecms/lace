## 1. Proxy asset caching

- [x] 1.1 Add the `location /_astro/` and `location = /_headers` blocks (design D2) to `deploy/nginx.conf` and copy the file unchanged to `packages/create-lace/templates/deploy/nginx.conf`; check syntax with `nginx -t` in `nginx:1.27.5-alpine` (vps-composition spec)
- [x] 1.2 Extend `tests/deploy-proxy.test.mjs`: the `/_astro/` location carries `Cache-Control "public, max-age=2592000, immutable"` without `always` and `try_files $uri =404`, `/` keeps `no-cache always`, `/_headers` returns `404`; confirm it fails when the header value or the `always` rule is changed (temporary edit, reverted)
- [x] 1.3 Extend `scripts/nginx-upload-probe.mjs` (`pnpm proxy:probe`) with a temporary release mounted at `/output/current` and the four cache cases of design D2; run it against real nginx

## 2. Builder caches

- [x] 2.1 Add a cache module in `apps/builder/src/` (prepare: usability check, size walk, 2 GiB clearing; link of `<site>/node_modules/.astro` to `<cacheRoot>/astro`; Astro-cache clearing) with fixed-vocabulary `builder-cache` log records, and wire it into `FixedCommandBuilder` with optional `cacheRoot`, `--store-dir <cacheRoot>/pnpm-store` on install and clearing after `build_failed` (design D4, fixed-command-vps-builder spec)
- [x] 2.2 Set `cacheRoot: "/cache"` in `apps/builder/src/main.ts` and create `/cache` owned by `node` in `apps/builder/Dockerfile`
- [x] 2.3 Runner tests with the fake tool: the install receives `--store-dir`, a build writing through `node_modules/.astro` leaves the entry in the cache and a second build sees it, the release excludes cache contents, an oversized cache (lowered limit through a test seam) is cleared, `build_failed` clears the Astro part and keeps the store, an unwritable or missing cache root builds uncached with the same result, and no `cacheRoot` keeps today's arguments

## 3. Compose

- [x] 3.1 Mount the named volume `builder-cache` at `/cache` on the builder and declare it in the repository `docker-compose.yml` and in the template `docker-compose.yml` inside the site-mode markers; verify with `docker compose config` for the repository file and the create-lace site-mode tests for all three modes (vps-composition spec)

## 4. Pages and CI

- [x] 4.1 Add user-owned `site/public/_headers` (design D3) to the starter template and `packages/create-lace/src/inventory.ts`; add a root test that its header value equals the nginx `/_astro/` value
- [x] 4.2 Add the `actions/cache@v4` step (design D5) to the template `.github/workflows/cloudflare.yml` and assert it in the create-lace workflow tests for starter (`site/node_modules/.astro`) and existing-site (`<path>/node_modules/.astro`) modes

## 5. Template 0.33.0

- [x] 5.1 Set `TEMPLATE_VERSION` to `0.33.0` and add the 0.33.0 upgrade instruction (design D6) to `packages/create-lace/templates/.lace/upgrade-instructions.json`; update create-lace tests
- [x] 5.2 Update the managed guides: `docs/lace-astro-site.md` (§12 caches on the VPS builder and in CI, `_headers` snippet for existing sites, `build.assets` note), `docs/lace-compose-production.md` and `docs/lace-operations.md` (asset cache lifetime, builder cache volume, bound and reset), `docs/lace-cloudflare.md` (`_headers`, workflow cache)
- [x] 5.3 Regenerate snapshots with `node scripts/generated-project-acceptance.mjs snapshots --update`; extend `packages/cli/src/upgrade-command.test.mjs` with a 0.32.0 → 0.33.0 case (unmodified proxy and Compose updated, edited proxy reported as conflict, user-owned site unchanged) (project-generator spec)

## 6. Documentation

- [x] 6.1 Update `docs/mvp-architecture.md` (§4.1 VPS deployment: builder cache volume and its bound; Cloudflare deployment: `_headers` and workflow cache; the 30-day `/_astro/` rule), `deploy/README.md` (cache rule and volume) and `backlog.md` (C done)

## 7. Verification

- [x] 7.1 Run `pnpm turbo run test --filter=@lacecms/app-builder --filter=create-lace --filter=@lacecms/cli`, the root deploy and generated-project tests, `pnpm proxy:probe`, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate images-c-deploy-caching --type change --strict`
