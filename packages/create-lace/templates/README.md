# Your Lace site

<!-- lace-site: starter -->
Lace is a single-site CMS with a user-owned static Astro website. You edit `lace.config.ts` and `site/`; the API/admin and builder come from packaged runtimes.

Site mode: **starter**. The editable Astro site is `site/`, generated from the Lace starter.
<!-- lace-site: end -->
<!-- lace-site: existing -->
Lace is a single-site CMS for your existing static Astro website. You edit `lace.config.ts` here and your site's own source; the API/admin and builder come from packaged runtimes.

Site mode: **existing site** at `{{SITE_PATH}}` (relative to this directory). This project contains no `site/` directory, and the generator did not modify your site. Connect it once with `pnpm exec lace add block --all --site {{SITE_PATH}}` and the steps in [Connect an existing Astro site](docs/lace-astro-site.md); the development guide lists them in order.
<!-- lace-site: end -->
<!-- lace-site: none -->
Lace is a single-site CMS. You edit `lace.config.ts`; the API/admin come from packaged runtimes.

Site mode: **none**. This project contains the CMS only and builds no site: Compose has no builder, build requests fail until a site is configured, and Admin shows an unconfigured site. To connect an Astro site later, follow [Connect an existing Astro site](docs/lace-astro-site.md) and configure build-site selection as described in [Lace operations](docs/lace-operations.md#selecting-the-build-site).
<!-- lace-site: end -->

This README is an index. Every command sequence lives in the scenario guides below; run them from this directory (the CMS installation root, for example `cms/`).

## Requirements

- Node `>=24.12.0` and pnpm `>=12`. These are minimums, not tested upper limits. This project pins pnpm `12.3.4` through `packageManager`, and Lace is tested with Node `24.12.0` and pnpm `12.3.4`. Newer Node and pnpm majors satisfy the declaration but stay unverified until the Lace compatibility matrix records them.
- Docker with Compose and a running daemon for the Compose scenarios. MinIO's first image build needs network access and disk space.
- Lace packages, generator and API/builder images from one compatible release: `0.1.0-alpha.2` or a later compatible release named in `package.json` and `.env.example`. The coordinates are downloadable only after owner publication. Behavior added by a newer ownership template needs matching freshly built packages/images or a later compatible release; published alpha artifacts are immutable and do not gain it retroactively.

## Layout and ownership

| Path | Owner | Purpose |
| --- | --- | --- |
| `lace.config.ts` | you | Models (singleton Home at `/`, Posts at `/blog/:slug`), fields and permitted blocks |
<!-- lace-site: starter -->
| `site/` | you | Astro routes, layout, styles and block components |
<!-- lace-site: end -->
<!-- lace-site: existing -->
| `{{SITE_PATH}}` | you | Your Astro site; Lace never creates or changes its files |
<!-- lace-site: end -->
| `README.md` | you | This index; upgrades preserve your edits |
| `.env` | you, private | Local settings and generated credentials; never commit it |
<!-- lace-cloudflare: on -->
| `worker/wrangler.jsonc` | you | CMS Worker configuration and resource IDs |
| `.lace/cloudflare-operator.env` | you, private | Remote Cloudflare management credentials, loaded only when selected |
<!-- lace-cloudflare: end -->
| `docs/`, `docker-compose.yml`, `deploy/`, `package.json` | managed | Updated by `lace upgrade` with hash/conflict review |

## Choose a scenario

<!-- lace-site: starter existing -->
- [Docker Compose development](docs/lace-compose-dev.md): install, prepare `.env`, create the first administrator, publish and build the site on your machine.
- [Docker Compose production](docs/lace-compose-production.md): run the CMS, fixed-command builder and static web proxy on a server with reviewed public origins.
<!-- lace-site: end -->
<!-- lace-site: none -->
- [Docker Compose development](docs/lace-compose-dev.md): install, prepare `.env`, create the first administrator and publish content on your machine.
- [Docker Compose production](docs/lace-compose-production.md): run the CMS and web proxy on a server with reviewed public origins.
<!-- lace-site: end -->
<!-- lace-cloudflare: on -->
- [Cloudflare](docs/lace-cloudflare.md): run the CMS Worker locally without an account, then provision and deploy it to your Cloudflare account. The CMS Worker and the static site are separate deployments.
<!-- lace-cloudflare: end -->
<!-- lace-cloudflare: off -->

This project was generated without `--cloudflare`. Cloudflare files (a separate CMS Worker and, with a site, a static-site Pages workflow) require a fresh matching project generated with `--cloudflare`; see [Optional Cloudflare](docs/lace-operations.md#optional-cloudflare) for adopting them.
<!-- lace-cloudflare: end -->

Each guide states its working directory, prerequisites, one-time and repeat steps, expected results, recovery and next step.

## References

- [Lace operations](docs/lace-operations.md): environment preparation, private setup input, doctor limits and exit codes, configuration sync, build-site selection, publication visibility, diagnostics and, for Cloudflare projects, management credentials.
- [Connect an existing Astro site](docs/lace-astro-site.md): Lace site packages, the server-only loader, routes, block components and styling hooks.

## Drafts, publication and deployment

Saving a draft never changes published content. Publishing makes a revision readable through the authenticated build export, but it does not deploy anything by itself: a static site changes only after a fresh build is deployed. Builds in Admin show whether a build is proven `succeeded` or only `accepted` by a provider; see [when published content becomes visible](docs/lace-operations.md#when-published-content-becomes-visible).
<!-- lace-cloudflare: on -->

The CMS Worker and the static site are deployed separately: deploying one never deploys, migrates or configures the other.
<!-- lace-cloudflare: end -->

## Extend the site

Change models in `lace.config.ts`, then review and apply them with an explicit configuration sync; Lace never generates routes or renderers for you.
<!-- lace-site: starter -->
Routes, layouts and block components belong to `site/`.
<!-- lace-site: end -->
<!-- lace-site: existing -->
Routes, layouts and block components belong to your site at `{{SITE_PATH}}`.
<!-- lace-site: end -->
<!-- lace-site: none -->
Routes and block components belong to the Astro site you connect later.
<!-- lace-site: end -->
See [configuration, routes, renderers and styling](docs/lace-operations.md#configuration-routes-renderers-and-styling) and [Connect an existing Astro site](docs/lace-astro-site.md).
