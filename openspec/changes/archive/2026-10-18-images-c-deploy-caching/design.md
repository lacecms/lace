## Context

Observed today:

- `deploy/nginx.conf` (identical in `packages/create-lace/templates/deploy/`,
  enforced by `tests/deploy-proxy.test.mjs`) serves `/output/current` from
  `location /` with `add_header Cache-Control "no-cache" always`. Astro writes
  every bundled script, stylesheet and (since step B) every image variant to
  `dist/_astro/` with a content hash in the file name.
- Cloudflare Pages serves static files with `Cache-Control: public,
  max-age=0, must-revalidate` unless a `_headers` file in the output says
  otherwise. Astro copies `public/` verbatim into the output.
- `FixedCommandBuilder.build` (`apps/builder/src/runner.ts`) creates a fresh
  `mkdtemp` work directory per build, sets `HOME` to it, runs
  `pnpm install --frozen-lockfile` and `pnpm --dir <site> exec astro build`,
  then deletes the work directory. pnpm's default store lives under `HOME`,
  Astro's cache under `<site>/node_modules/.astro` (remote-image cache in
  `assets/`, Lace's placeholder cache in `lace/placeholders/`), so both are
  lost after every build. Builds run serially (`server.ts` queue).
- `apps/builder/Dockerfile` creates `/source /work /output` owned by `node`.
  The template Compose file has a `builder` service only in site modes (marked
  with `# lace-site:` blocks); the repository Compose file always has one.
- The template Pages workflow uses `actions/setup-node` with `cache: pnpm`
  (pnpm store, keyed by lockfile) and builds `{{SITE_PATH}}`.
- pnpm 12.3.4 accepts `install --store-dir <DIR>`.

## Goals / Non-Goals

**Goals:** returning visitors reuse hashed assets for 30 days on both hosts;
VPS and CI rebuilds reuse downloaded packages, image variants and
placeholders; caches stay bounded and can never turn a good build into a
failure or leak into a release.

**Non-Goals:** see the proposal (no HTML/media caching, no configurable
lifetime or size, no cross-site cache).

## Decisions

### D1. One cache rule: `/_astro/` for 30 days, immutable

`Cache-Control: public, max-age=2592000, immutable`. File names change with
content, so `immutable` is safe and saves conditional requests on reload;
30 days is the owner's ceiling instead of a year. The rule is keyed on the
path prefix, not on file extensions, because Astro guarantees hashing only
there. HTML stays `no-cache`, so a switched release always references the new
names. Alternative considered: `max-age` without `immutable` — rejected,
browsers would still revalidate on reload.

### D2. nginx location

```nginx
# Content-hashed build assets: a changed file gets a new name.
location /_astro/ {
    root /output/current;
    add_header Cache-Control "public, max-age=2592000, immutable";
    try_files $uri =404;
}

# Cloudflare Pages header rules travel in the build output; never serve them.
location = /_headers {
    return 404;
}
```

No `always`: nginx then adds the header only to success and redirect codes
(200, 304, …), so a `404` for a missing asset — for example an old cached page
asking for a file of a pruned release — is not cached for a month. A prefix
location wins over `location /` by longest match. Both files stay identical;
`tests/deploy-proxy.test.mjs` gains assertions for the new locations and the
unchanged `no-cache` on `/`.

`scripts/nginx-upload-probe.mjs` (`pnpm proxy:probe`, real
`nginx:1.27.5-alpine`) additionally mounts a temporary release directory at
`/output/current` with `index.html` and `_astro/app.abc123.js` and asserts:
asset → `200` with the 30-day header; missing asset → `404` without it;
`/` → `no-cache`; `/_headers` → `404`.

### D3. Pages `_headers`

Starter `site/public/_headers` (user-owned, starter mode only):

```text
/_astro/*
  Cache-Control: public, max-age=2592000, immutable
```

Pages applies rules from `_headers` on direct upload and Git builds. Existing
sites get the same snippet in the site guide; the generator never writes into
an existing site. A test asserts the `_headers` value equals the nginx value.

### D4. Builder cache root and its layout

`BuilderSettings` gains optional `cacheRoot`; `main.ts` sets `/cache`, the
Dockerfile creates `/cache` owned by `node`, and Compose mounts the named
volume `builder-cache` there (Docker copies the image directory's ownership
into a new empty volume, so no init container is needed). Without
`cacheRoot` (tests, older settings) the build behaves exactly as today.

Layout: `/cache/pnpm-store/` and `/cache/astro/`. Per build:

1. **Prepare** (before install). If the cache root is not a writable
   directory, log `{"component":"builder-cache","event":"unavailable"}` and
   build without cache. Otherwise measure its size (walking `lstat`, not
   following links); above 2 GiB remove both parts and log `cleared` with
   reason `size_limit`.
2. **Install** with `--store-dir /cache/pnpm-store` appended to the fixed
   install arguments. The store is on another filesystem than `/work`, so pnpm
   copies instead of hard-linking; downloads are still saved. pnpm verifies
   store integrity itself.
3. **Link** after install and the existing `node_modules/astro` check: create
   `/cache/astro` and symlink `<project>/<site>/node_modules/.astro` to it
   (replacing nothing: install never creates `.astro`; if it exists, the link
   is skipped and the build runs uncached). Astro and the placeholder cache
   write through the link.
4. **After a failed build** (`build_failed`) remove `/cache/astro`, so a
   corrupt cache entry cannot fail every retry. Install failures leave the
   store alone. Cache cleanup errors are logged and ignored.

The release copy reads only the output directory, so cache contents never
reach `/output`. The work directory deletion removes the link, not the
target (`rm` does not follow symlinks). Logs are fixed-vocabulary JSON without
paths, matching the existing `builder-tool` records; build results and failure
reasons are unchanged.

Alternatives considered: copying `.astro` in and out (doubles disk I/O for
large variant sets, same growth); an Astro `cacheDir` setting (would require
every site to read a builder variable); a per-entry LRU (Astro keeps no access
record; whole-cache clearing at a fixed bound is simpler and the next build
repopulates it).

### D5. GitHub Actions cache

Before `pnpm build` in the template workflow:

```yaml
# Astro's image cache: variants and placeholders are reused between runs.
- uses: actions/cache@v4
  with:
    path: "{{SITE_PATH}}/node_modules/.astro"
    key: lace-astro-${{ runner.os }}-${{ github.run_id }}
    restore-keys: lace-astro-${{ runner.os }}-
```

A unique key saves a fresh snapshot after each run while `restore-keys` loads
the newest one; GitHub evicts entries unused for 7 days and caps the
repository total, which bounds growth. `{{SITE_PATH}}` is the existing
variable (`site` in starter mode).

### D6. Template 0.33.0

`TEMPLATE_VERSION` `0.33.0`; inventory adds `site/public/_headers` (user,
starter). Managed changes: `deploy/nginx.conf`, `docker-compose.yml`
(`builder-cache` mount and volume inside the site-mode markers),
`.github/workflows/cloudflare.yml`, guides. New first `configuration`
instruction: what is cached and for how long; recreate with `docker compose up
-d builder web` using the builder image from the same release; copy
`site/public/_headers` (or the guide snippet) for Pages; no database migration
and no API, admin, CLI, SDK or adapter change; reset the build cache with
`docker compose rm --stop --force builder` and `docker volume rm
<project>_builder-cache`, then start the builder again. Snapshots are
refreshed with `node scripts/generated-project-acceptance.mjs snapshots
--update`.

## Risks / Trade-offs

- [A 30-day asset outlives a deleted image] → the hashed file is unreachable
  from new HTML; only an old page already open keeps it. Accepted.
- [Clearing at 2 GiB causes one slow build] → rare, bounded and logged.
- [Symlinked cache dir and an Astro version that resolves real paths] →
  covered by the runner test with a fake build writing through the link and
  by the Docker acceptance build when run; falling back to an uncached build
  is always correct.
- [Older builder image with new Compose] → `/cache` is mounted but unused;
  behavior unchanged.

## Migration Plan

Template upgrade (D6). Rollback: restore the 0.32.0 managed files and the
previous builder image; the `builder-cache` volume can be removed.

## Open Questions

None.
