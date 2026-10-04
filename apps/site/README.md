# Lace reference Astro site

`apps/site` is the engine's Astro playground and build fixture for the starter
`home` and `posts` models plus the extra `about` and `notes` routes. It never
ships to users; generated projects receive the `create-lace` starter instead.
Both consume the same packages: `src/lib/lace.ts` creates the published-site
loader with `@lacecms/astro`, pages render blocks with `<LaceBlocks>` and the
block map `src/lace/blocks.ts`, and `src/components/lace/` holds the registry
block components recorded in `lace.site.json`. A repository test keeps those
components byte-identical to `registry/` and the starter.

## Build inputs

Fixture mode is the default and uses the committed published export, so it
requires no CMS connection:

```sh
pnpm --filter @lacecms/app-site build
```

Set `LACE_SITE_DATA_MODE=live` for a live build. It requires
`LACE_API_BASE_URL` and `LACE_BUILD_TOKEN`; the site performs one authenticated
build-export request and derives every route from it locally. `LACE_API_BASE_URL`
is also used to build stable public-media URLs unless `LACE_PUBLIC_BASE_URL`
supplies a separate browser-facing origin, as in the local Docker stack. It defaults to
`https://cms.example.test/lace` only for the committed fixture.

```sh
LACE_SITE_DATA_MODE=live \
LACE_API_BASE_URL=https://cms.example/lace \
LACE_BUILD_TOKEN=replace-me \
pnpm --filter @lacecms/app-site build
```

For the local same-origin development stack, create a token through the admin
API and set live mode in the ignored `.env` as described in the root
[README](../../README.md#show-published-content-on-the-local-site). In Astro dev
the loader revalidates the export on every request, so publications to existing
routes appear on reload; restart the site process after a new or renamed slug.
Draft saves do not appear on the public site.
