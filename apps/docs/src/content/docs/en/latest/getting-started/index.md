---
title: Start with Lace
description: Create a CMS project, publish your first page and build a static Astro site from it.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Lace manages one website per installation. Developers define models and rendering in code; editors manage values and blocks in Admin. Content is stored in SQLite (Node) or D1 (Cloudflare), binary media in MinIO or R2, and published content is kept separate from editable drafts. This guide creates a project, starts the CMS locally with Docker Compose, publishes a first page and builds the site from it.

## Before you start

- Node **>=24.12.0**, pnpm **>=12** and Docker Compose. The tested versions are Node **24.12.0** and pnpm **12.3.4**; a newer major satisfies the minimum but is not tested.
- Lace packages, the `create-lace` generator and the API/builder images from one release. This documentation targets **0.1.0-rc2**, the oldest supported release. Check that the release is available in [GitHub Releases](https://github.com/lacecms/lace/releases): the latest documentation follows the main branch and can describe a release before it is published. Do not substitute an older prerelease.
- An empty target directory. Only files such as `.git`, `README.md` and `LICENSE` may already exist; the generator does not install into a populated project.

## Create a project

```sh
pnpm dlx create-lace@0.1.0-rc2 my-site --starter
cd my-site
pnpm install
```

To generate into the current, empty directory, use `pnpm dlx create-lace@0.1.0-rc2 init . --starter`. Choose one site mode:

| Mode                              | Result                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `--starter`                       | An editable Astro site in `site/`                                                     |
| `--existing-site <relative-path>` | Connects an existing Astro project outside the new CMS directory without modifying it |
| `--no-site`                       | CMS and API only, until you connect a site later                                      |

Without a mode flag, the generator asks in a terminal and otherwise creates the starter. Add `--cloudflare` to also generate the CMS Worker in `worker/` and, with a site, a Pages workflow.

The generated project is your CMS installation, not the Lace engine repository. You own `lace.config.ts` and the site; root workspace files, Compose and deployment files and the guides in `docs/` are managed and can be updated later with `lace upgrade`. The generated guides contain the exact commands for your site mode.

## Prepare the environment

```sh
pnpm env:prepare
```

This runs `lace env prepare`, which creates `.env` from `.env.example`, generates independent random values for `LACE_AUTH_SECRET`, the MinIO credentials and `LACE_BUILDER_SECRET`, leaves `LACE_BUILD_TOKEN` empty and restricts the file to its owner. It prints no secrets and never overwrites an existing `.env`. Never commit `.env`.

Review `LACE_PUBLIC_BASE_URL` (default `http://127.0.0.1:3000/`): Admin, sign-in and media URLs use it. Always open Admin at exactly that origin, because `localhost` and `127.0.0.1` have different cookies.

## Start the Node CMS

Run from the project root while the Compose `api` and `dispatcher` services are stopped:

```sh
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
pnpm dev:api
```

Fix every doctor failure; the `expected` results of a fresh project, such as a missing database or build token, are not failures. Migration is explicit, and the API does not migrate on startup. Sync registers your models and creates drafts for singleton pages. Bootstrap prints a one-time setup token that is valid for one hour.

Open `http://127.0.0.1:3000/admin/`, create the first administrator with the setup token, your email and a password of at least 12 characters, then sign in. If the token expired, stop `api` and `dispatcher` and run `pnpm auth:bootstrap` again; after setup completes, bootstrap refuses and you sign in instead.

Host commands that open the database (`db:migrate`, `content:sync`, `auth:bootstrap`) must run while `api` and `dispatcher` are stopped: on Docker Desktop and OrbStack, SQLite locks are not shared between the host and containers.

## Publish your first page

Open Home, enter a title, add blocks, select **Save draft**, then **Publish**. Editors can save drafts; administrators publish. In **Settings**, create a read-only build token and put its once-shown value into the ignored `.env` as `LACE_BUILD_TOKEN`. Keep it out of browser code and Git.

## Build the site

For starter mode:

```sh
pnpm dev
pnpm build
```

`pnpm dev` reads published content on reload for existing routes; restart it for new or renamed slugs and for changed environment values. `pnpm build` writes the static site to `site/dist/`. For an existing site, follow the generated `docs/lace-astro-site.md`, then [Connect an Astro site](../astro-integration/).

Three steps stay separate: saving a draft does not change published content, publishing does not by itself rebuild a manually built site, and deploying the built files is its own operation. Continue with [content modeling](../content-modeling/), [editor workflows](../editing-content/) and [deployment](../deployment/).

## Reference

- [CLI and environment](../reference/cli-environment/): `create-lace` modes and flags, `lace env prepare`, `lace doctor` and every setting.
- [Configuration reference](../reference/configuration/): the options of `lace.config.ts`.
