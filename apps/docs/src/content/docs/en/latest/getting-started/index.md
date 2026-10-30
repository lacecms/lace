---
title: Start with Lace
description: Create a CMS, publish your first page, and connect a static Astro site.
---

Lace manages one website per installation. Developers define models and rendering in code; editors manage values and blocks in Admin. Content is stored in SQLite/D1, with binary media in MinIO/R2. Published content is separate from editable drafts.

## Requirements

Use Node **>=24.12.0**, pnpm **>=12**, and Docker Compose for the Node workflow. The tested repository baseline is Node **24.12.0** and pnpm **12.3.4**; satisfying minimums with a newer major does not establish tested compatibility.

This guide targets **0.1.0-alpha.8**. Use matching Lace packages, generator and API/builder images. Before using an example, confirm that those artifacts are available in [GitHub Releases](https://github.com/lacecms/lace/releases). Latest documentation follows main and can precede publication. Do not substitute an older alpha and expect the same behavior.

## Create a project

Once matching alpha.8 artifacts are available:

```sh
pnpm dlx create-lace@0.1.0-alpha.8 my-site --starter
cd my-site
pnpm install
pnpm env:prepare
```

The generated project is your CMS installation, not the Lace engine repository. Its `docs/` contains scenario instructions matched to that generator. Use those generated instructions for exact project-specific commands.

Choose one site mode at creation:

| Mode                              | Result                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `--starter`                       | An editable Astro site in `site/`                                                   |
| `--existing-site <relative-path>` | Connect an existing Astro project outside the new CMS directory; it is not modified |
| `--no-site`                       | CMS/API only until you configure a site later                                       |

Add `--cloudflare` to generate Worker files. The target must be empty except for explicitly allowed files such as `.git`, README and LICENSE. Back up existing work; the generator is not an in-place installer for an arbitrary populated project.

## Start the Node CMS

Run from the generated installation root, with API/dispatcher stopped:

```sh
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
pnpm dev:api
```

Fix every doctor failure; expected setup omissions are different from failures. Migration is explicit. Sync registers the models and creates singleton drafts. Bootstrap prints a setup token once, valid for one hour. Open `http://127.0.0.1:3000/admin/`, create the first administrator with that token, your email and a password of at least 12 characters, then sign in. Use the configured public origin consistently: `localhost` and `127.0.0.1` have different cookies.

Host-side SQLite commands must run while `api` and `dispatcher` are stopped. Host/container locks are not shared reliably on Docker Desktop/OrbStack; the CLI checks storage mappings to protect this maintenance window.

## Publish your first page

Open Home, enter a title, add blocks, Save draft, then Publish as an administrator. Editors can save drafts; administrators publish. In Settings create a read-only build token and place its once-shown value in the ignored `.env` as `LACE_BUILD_TOKEN`. Keep it out of browser code and Git.

For starter mode:

```sh
pnpm dev
pnpm build
```

Dev reads published content on reload for existing routes. Restart it for new/renamed slugs or changed environment values. A static build writes `site/dist/`; deploying those files is a separate operation. A saved draft does not change published content; publishing does not by itself deploy a manual build.

Next: [content modeling](../content-modeling/), [editor workflows](../editing-content/), [production deployment](../deployment/).
