# Connect an existing Astro site

Use this guide when your Astro site already exists and the Lace CMS lives in a
subdirectory generated with `pnpm create lace@0.1.0-alpha.1 cms`. The CMS never
modifies your site; every file below is yours. For build-site selection,
mounts and the Compose builder, see
[Selecting the build site](lace-operations.md#selecting-the-build-site).

```text
my-site/                 your Astro project (lockfile root)
├── cms/                 generated Lace project
├── lace.site.json       Lace block lock (step 5)
└── src/
    ├── components/lace/ block components (step 5)
    ├── lace/blocks.ts   block map (step 5)
    ├── lib/lace.ts      loader file (step 3)
    └── pages/           your routes (step 6)
```

## 1. Install the Lace site packages

Astro `^7.3.1` must already be a dependency. In the site root:

```sh
pnpm add @lacecms/astro@0.1.0-alpha.1 @lacecms/render@0.1.0-alpha.1 @lacecms/sdk@0.1.0-alpha.1 @lacecms/content@0.1.0-alpha.1
```

`@lacecms/sdk` loads published content, `@lacecms/render` validates blocks and
rich text with the CMS rules, `@lacecms/astro` renders them in Astro, and
`@lacecms/content` provides the built-in block definitions. Upgrade all four
together.

## 2. Configure the server-only environment

Set these for `astro dev` and `astro build` (for example in the site's ignored
`.env`); never prefix them with `PUBLIC_`:

| Variable                          | Value                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `LACE_API_BASE_URL`               | Origin of the Lace API that serves the published build export                       |
| `LACE_BUILD_TOKEN`                | Read-only build token created in Admin Settings                                     |
| `LACE_PUBLIC_BASE_URL`            | Browser-facing API origin for media URLs (defaults to `LACE_API_BASE_URL`)          |
| `LACE_EXPECTED_PUBLISHED_VERSION` | Optional; the Compose builder sets it so a build fails if content changes mid-build |

The token is read only in server code and never reaches the browser.

## 3. Create the loader file

`src/lib/lace.ts`:

```ts
import { createAstroSiteLoader } from "@lacecms/astro";

export const getSite = createAstroSiteLoader({
  env: { ...import.meta.env, ...process.env },
  dev: import.meta.env.DEV,
});
```

A static build reads one export for all routes; `astro dev` revalidates it on
every request so publications appear on reload. Pass `hints` to append your
own instructions to configuration, token or connection errors.

## 4. Let TypeScript read `.astro` imports

`src/env.d.ts`:

```ts
/// <reference types="astro/client" />

// Lets `tsc` type `.astro` imports in TypeScript modules such as the block map.
declare module "*.astro" {
  const component: (props: Record<string, unknown>) => unknown;
  export default component;
}
```

## 5. Add the block components

Copy these from a freshly generated starter (`pnpm dlx create-lace@0.1.0-alpha.1 lace-starter`)
into the same paths of your site:

- `site/src/components/lace/` — `HeroBlock`, `RichTextBlock`, `ImageBlock`,
  `QuoteBlock` and `CtaBlock` components;
- `site/src/lace/blocks.ts` — the block map;
- `site/lace.site.json` — the record of installed block versions and hashes.

The components are your source: change their markup and styles freely. Each
receives `block`, validated `data`, `context` and `mediaUrl`; rich-text fields
render through `@lacecms/astro/RichText.astro`. A block type that is missing
from the map fails the build with its model, entry and block key. A future
`lace add block` command will install and update these files for you; until
then this copy is the supported path.

## 6. Render a page and a collection

Read entries from the published site by path, or by model and slug. Your
routes should produce the paths configured in `cms/lace.config.ts` (for example
`route: "/articles/:slug"`) so Admin preview links match.

`src/pages/index.astro`:

```astro
---
import LaceBlocks from "@lacecms/astro/LaceBlocks.astro";
import Site from "../layouts/Site.astro";
import { blocks } from "../lace/blocks";
import { getSite } from "../lib/lace";

const site = await getSite();
const home = site.byPath("/");
if (home === undefined) throw new Error("Publish the home page in Lace Admin.");
const posts = site.entries("posts");
---

<Site title={home.title}>
  <main data-lace-model={home.modelKey} data-lace-entry={home.id}>
    <LaceBlocks blocks={blocks} entry={home} mediaUrl={site.mediaUrl} />
  </main>
  <nav class="articles">
    {posts.map((post) => <a href={`/articles/${post.slug}/`}>{post.title}</a>)}
  </nav>
</Site>
```

`src/pages/articles/[slug].astro`:

```astro
---
import LaceBlocks from "@lacecms/astro/LaceBlocks.astro";
import Site from "../../layouts/Site.astro";
import { blocks } from "../../lace/blocks";
import { getSite } from "../../lib/lace";

export async function getStaticPaths() {
  const site = await getSite();
  return site.entries("posts").map((post) => ({ params: { slug: post.slug } }));
}

const site = await getSite();
const post = site.bySlug("posts", Astro.params.slug ?? "");
if (post === undefined) return new Response(null, { status: 404 });
---

<Site title={post.title}>
  <article data-lace-model={post.modelKey} data-lace-entry={post.id}>
    <h1>{post.title}</h1>
    <LaceBlocks blocks={blocks} entry={post} mediaUrl={site.mediaUrl} />
  </article>
</Site>
```

The collection route reads the entry by slug on each render, so `astro dev`
shows publications to existing routes on reload; restart `astro dev` after a
new or renamed slug.

## 7. Customize rich text

`<RichText>` renders only the shared Lace allowlist and never raw HTML. Pass
`components` to replace the element for a node or mark; an override receives
the validated element and its rendered children:

```astro
---
import type { RichTextOverrideProps } from "@lacecms/astro";

type Props = RichTextOverrideProps;

const { element } = Astro.props;
---

<a class="external" href={element.attributes.href} rel="noopener"><slot /></a>
```

```astro
<RichText components={{ link: ExternalLink }} document={document} />
```

## 8. Style through the hooks

Target `data-lace-model`, `data-lace-entry`, `data-lace-block`,
`data-lace-block-key` and `data-lace-part`; tag names and incidental classes are
not part of the contract:

```css
/* Style Lace content only through the public data-lace-* hooks. */
[data-lace-block="hero"] [data-lace-part="heading"] {
  font-size: 3rem;
}
[data-lace-model="posts"] [data-lace-block="quote"] {
  border-inline-start: 4px solid currentColor;
}
```

## 9. Build

```sh
pnpm astro build
```

The build fails instead of emitting partial pages when the token is missing or
rejected, the API is unreachable, a block has no component, or block data or
rich text breaks the CMS rules.
