## Why

Step B made every block image a set of content-hashed WebP files in
`dist/_astro/`, but both deployment paths throw that work away: the VPS proxy
sends `Cache-Control: no-cache` for every site file, Cloudflare Pages sends
`max-age=0`, so returning visitors revalidate every variant and script on each
page view; and every VPS build starts from an empty work directory, so it
downloads all packages and regenerates every variant and placeholder again
(the generated Pages workflow likewise loses Astro's image cache between runs).

## Roadmap unit

**Step C of the three-change image-delivery plan** recorded in `backlog.md`
(selected 2026-10-18, replaces CE11):

- A — `images-a-media-format-caching`: done (archived 2026-10-18).
- B — `images-b-build-variants-lightbox`: done (archived 2026-10-18).
- **C — `images-c-deploy-caching` (this change):** 30-day browser caching of
  content-hashed `/_astro/` assets in nginx and the Pages `_headers` file,
  persistent build caches on the VPS builder and in the generated GitHub
  Actions workflow, template version bump.

C is verifiable alone through the real-nginx probe, builder runner tests and
generated-project fixtures; it changes no content, API or rendering contract.

Owner decision recorded in the backlog (2026-10-18): hashed assets are cached
for **30 days**, not indefinitely (`max-age=31536000`). HTML and every other
site file keep revalidating so a switched release is visible on reload.

## What Changes

- **Proxy caching.** `deploy/nginx.conf` (repository and template copy, kept
  identical) gains a `location /_astro/` that serves the current release with
  `Cache-Control: public, max-age=2592000, immutable` on successful responses
  only; a missing file is a plain `404` without the long-lived header. Every
  other site response keeps `no-cache`. `/_headers` (the Pages rules file,
  copied into the build output) answers `404` on the VPS.
- **Pages caching.** The starter site gains user-owned `site/public/_headers`
  applying the same 30-day header to `/_astro/*`; the site guide gives the
  same file for existing sites.
- **Persistent VPS build caches.** The builder keeps a cache root `/cache` on
  a new named volume `builder-cache`: pnpm installs with
  `--store-dir /cache/pnpm-store`, and the site's Astro cache directory
  (`<site>/node_modules/.astro`, holding Astro's remote-image cache and Lace's
  placeholder cache) is linked to `/cache/astro` for the build. The cache is
  bounded: it is cleared before a build when it exceeds 2 GiB, the Astro part
  is cleared after a failed build, and an unusable cache root never fails a
  build. Request data still selects nothing.
- **Persistent CI cache.** The generated Cloudflare Pages workflow restores
  and saves `<site>/node_modules/.astro` with `actions/cache` (pnpm's store
  is already cached by `setup-node`).
- **Template 0.33.0.** Managed proxy, Compose (both site modes add the
  `builder-cache` volume), Pages workflow and guides change; the upgrade
  instruction names the services to recreate, the new builder image from the
  same release and the manual `_headers` adoption. No database migration, no
  API, admin, SDK or adapter change.

## Non-goals

- Caching HTML, media binaries (step A already sets their headers on the
  API), `public/` files without a content hash, or anything outside `/_astro/`.
- A configurable cache lifetime or cache size; a cache for the repository's
  own CI or the documentation site.
- Sharing the builder cache across sites or hosts; `pnpm store prune`
  scheduling.
- Changing Astro's `build.assets` directory; sites that rename it keep
  revalidating (documented).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `vps-composition`: the proxy caches content-hashed site assets for 30 days
  and hides the Pages rules file; Compose persists the builder cache volume.
- `fixed-command-vps-builder`: bounded persistent pnpm and Astro caches that
  never decide build success.
- `project-generator`: template 0.33.0 with the starter `_headers`, the Pages
  workflow Astro cache and the upgrade instruction.

## Impact

- Architecture: `docs/mvp-architecture.md` §4.1 VPS and Cloudflare deployment
  (cache rules, builder cache volume).
- Code: `deploy/nginx.conf`, `packages/create-lace/templates/deploy/nginx.conf`,
  `docker-compose.yml`, template `docker-compose.yml`,
  `apps/builder/src/{runner,main}.ts` and a new cache module,
  `apps/builder/Dockerfile`, template `.github/workflows/cloudflare.yml`,
  template `site/public/_headers`, `packages/create-lace/src/inventory.ts`,
  template upgrade instructions.
- Tests: `tests/deploy-proxy.test.mjs`, `scripts/nginx-upload-probe.mjs`
  (cache cases against real nginx), builder runner tests, create-lace and CLI
  upgrade tests, generated-project snapshots.
- Docs: `deploy/README.md`, template `docs/lace-astro-site.md`,
  `docs/lace-compose-production.md`, `docs/lace-operations.md`,
  `docs/lace-cloudflare.md`; `backlog.md` (C done).
- Dependencies: none. Operators need the builder image of the same release;
  an older builder image with the new Compose file simply ignores `/cache`.
