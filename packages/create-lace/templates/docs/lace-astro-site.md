# Connect an existing Astro site

Use this guide when your Astro site already exists and the Lace CMS lives in a
subdirectory generated with `pnpm create lace@0.1.0-alpha.7 cms`. The CMS never
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
pnpm add @lacecms/astro@0.1.0-alpha.7 @lacecms/render@0.1.0-alpha.7 @lacecms/sdk@0.1.0-alpha.7 @lacecms/content@0.1.0-alpha.7 sharp@0.35.5
```

`@lacecms/sdk` loads published content, `@lacecms/render` validates blocks and
rich text with the CMS rules, `@lacecms/astro` renders them in Astro, and
`@lacecms/content` provides the built-in block definitions. Upgrade all four
together. `sharp` is the image library Astro uses for the block image variants
(section 12).

## 2. Configure the server-only environment

Set these for `astro dev` and `astro build` (for example in the site's ignored
`.env`); never prefix them with `PUBLIC_`:

| Variable                          | Value                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `LACE_API_BASE_URL`               | Origin of the Lace API that serves the published build export                       |
| `LACE_BUILD_TOKEN`                | Read-only build token created in Admin Settings                                     |
| `LACE_PUBLIC_BASE_URL`            | Browser-facing API origin for media URLs (defaults to `LACE_API_BASE_URL`)          |
| `LACE_EXPECTED_PUBLISHED_VERSION` | Optional; the Compose builder sets it so a build fails if content changes mid-build |
| `LACE_BUILD_SITE_URL`             | Optional public site base URL; enables canonical URLs, `og:url` and `sitemap.xml`   |
| `LACE_SITE_INDEXING`              | Optional `on` (default) or `off`; `off` keeps staging builds out of search engines  |

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

From the `cms/` directory, install the block components, the block map and the
block lock into your site:

```sh
pnpm exec lace add block --all --site ..
```

`--all` installs a component for every block type `cms/lace.config.ts`
registers; name types instead (`lace add block hero cta --site ..`) to install
only those. The command writes `src/components/lace/*Block.astro`,
`src/lace/blocks.ts` and `lace.site.json` in the site, and prints the exact
`pnpm --dir .. add ...` command when a required Lace package is missing or
outdated; it never edits your `package.json` or other source. Use `--dry-run`
to review the plan without writing.

The components are your source: change their markup and styles freely. Each
receives `block`, validated `data`, `context`, `mediaUrl` and `image`; rich-text
fields render through `@lacecms/astro/RichText.astro`. `image(mediaId,
usageAlt?)` describes a media field for an `<img>`: `src`, the effective `alt`
(the usage alt text such as the image block's `alt`, else the media item's alt
text from the Media library, else `""`), `width` and `height` to prevent layout
shift, `caption`, and `objectPosition` (for example `25% 40%`) from the focal
point set in Media. A media ID missing from the build export fails the build
with its block. Outside blocks, `site.media(id)` and `site.image(id, usageAlt?)`
(also available on each entry) return the resolved media item. A block type that is missing
from the map fails the build with its model, entry and block key. Running the
command again after a CLI upgrade updates only files you have not changed; an
edited component or block map is reported as a conflict with a diff and left
untouched (`--write-new` writes the proposed file next to it as `.new`).

For a custom block, export its `defineBlock` value from a module that
`lace.config.ts` imports, record that module path relative to the site root as
`"definitions"` in `lace.site.json`, then run
`pnpm exec lace add block <type> --site ..` to scaffold a typed component with
the styling hooks and register it in the block map.

Editors can give a block an in-page anchor, an extra CSS class name and the
settings its definition declares, and can hide it. Components also receive
`anchor` and `className` when the block has them, and `settings` with every
declared default applied. Place the anchor as the `id` of the component's root
element and merge the class name into its `class`; Astro leaves out an
`undefined` attribute, so a block without them renders unchanged:

```astro
---
import type { BlockProps } from "@lacecms/render";
import type * as definitions from "../../../cms/lace.blocks";

type Props = BlockProps<typeof definitions.banner>;

const { anchor, block, className, data, settings } = Astro.props;
---

<section class:list={["banner", `banner--${settings.tone}`, className]} data-lace-block={block.type} data-lace-block-key={block.key} id={anchor}>
  <p data-lace-part="message">{data.message}</p>
</section>
```

Declare settings beside the fields with the `select`, `boolean`, `number` or
`text` builders, each with a `defaultValue`; `settings` is then typed with
every declared key present. Settings are part of the block definition, so
adding or changing one needs a version increase and a migration, which
receives and returns `{ data, settings }`:

```ts
export const banner = defineBlock({
  type: "banner",
  version: 1,
  fields: { message: field.text({ required: true }) },
  settings: {
    tone: field.select({ options: ["info", "warning"], defaultValue: "info" }),
  },
});
```

Anchors are unique within one entry, so a link such as `#pricing` in a URL or
rich-text field reaches the block on that entry's page; keep anchors distinct
yourself when a page renders blocks of several entries, such as a global. A
hidden block stays in Admin and in the published entry but is never delivered:
the build export leaves it out and `LaceBlocks` never renders it. An invalid
anchor, class name or settings value fails the build with
`invalid_block_envelope` and its block.

Two built-in blocks hold repeatable content in group and list fields; editors
fill them with the generic Add, Remove, Duplicate and reorder controls and must
add at least one item before publishing:

- `gallery` has an optional `title` and up to 50 `images`, each with `media`,
  an optional `alt` and an optional `caption`. `GalleryBlock.astro` renders a
  `<section class="gallery">` with a list of figures. Each image uses
  `image(item.media, item.alt)`, so its alt text falls back to the media item's
  alt text and then to `""`; the caption falls back to the media caption. Images
  carry `width`, `height`, the focal-point `object-position` and
  `loading="lazy"`.
- `navigation` has an optional `name` (the `aria-label` of its `<nav>`; name
  every navigation when a page has several) and up to 20 `links`, each with a
  `label`, an optional `url` and up to 20 `children` (one submenu level). A
  link without children is an `<a>`, or plain text without a URL. A link with
  children becomes a `<details>`/`<summary>` disclosure that opens with Enter,
  Space, a click or a tap without JavaScript; its own URL, if it has one, is
  the first link of the submenu. A root-relative link to the current page gets
  `aria-current="page"`. The disclosure does not close on Escape or on an
  outside click; add a script to your copy of the component if you need that.

Links use the URL rules of every `url` field: `/path`, `#anchor`,
`https://…`, `mailto:` or `tel:`.

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

## 7. Read site-wide content (globals)

A global is a configuration-defined model with exactly one entry and no URL,
such as site settings. Declare it in `cms/lace.config.ts`:

```ts
defineGlobal({
  key: "settings",
  version: 1,
  label: "Site settings",
  fields: {
    siteName: field.text({ label: "Site name", required: true }),
    tagline: field.text({ label: "Tagline" }),
  },
});
```

Run configuration sync, then edit and publish it from the Site group in Admin.
Publishing a global requests a site build, because any page may show it.
`site.global(key)` returns the published global from the same build export, or
`undefined` while it has never been published, so keep static fallbacks. Its
`fields` are untyped JSON; check each value before use, as in this
`SiteHeader.astro` component:

```astro
---
import type { PublishedSite } from "@lacecms/sdk";

interface Props {
  readonly site: PublishedSite;
}

const { site } = Astro.props;
const settings = site.global("settings")?.fields ?? {};
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;
const siteName = text(settings.siteName) ?? "My site";
const tagline = text(settings.tagline);
---

<header>
  <a href={import.meta.env.BASE_URL}>{siteName}</a>
  {tagline === undefined ? null : <p>{tagline}</p>}
</header>
```

Pass the `site` your page already loaded down to the header
(`<SiteHeader site={site} />`, or through your layout's props) instead of
calling `getSite()` again. A published global's
`media(id)` and `image(id, usageAlt?)` resolve media like an entry's.

A global can also allow blocks. Site-wide navigation is a global that allows
only the `navigation` block:

```ts
defineGlobal({
  key: "navigation",
  version: 1,
  label: "Navigation",
  description: "Links shown in the header of every page.",
  blocks: ["navigation"],
});
```

Render its published blocks with `LaceBlocks` and the same block map as your
pages, and keep static links until it is published. A published global without
blocks renders no navigation:

```astro
---
import LaceBlocks from "@lacecms/astro/LaceBlocks.astro";
import type { PublishedSite } from "@lacecms/sdk";
import { blocks } from "../lace/blocks";

interface Props {
  readonly site: PublishedSite;
}

const { site } = Astro.props;
const navigation = site.global("navigation");
---

{navigation === undefined ? (
  <nav aria-label="Main" class="site-nav">
    <ul>
      <li><a href={import.meta.env.BASE_URL}>Home</a></li>
    </ul>
  </nav>
) : (
  <LaceBlocks blocks={blocks} entry={navigation} mediaUrl={site.mediaUrl} />
)}
```

The header changes only when Navigation is published and the site rebuilt;
saved drafts stay out of the build. The same block can also be added to a
page's content for local navigation, such as links to `#anchor` targets on that
page; it shows its own links, not the global's. Anchors of global blocks are not
checked against the anchors of the page, so leave the site navigation without
an anchor.

## 8. Group and list fields in your models

Models and block definitions can describe structured content with
`field.group` (one object with named child fields) and `field.list` (an ordered
array whose items share one field, a scalar or a group). For example, a page
with a team section:

```ts
definePage({
  key: "about",
  version: 2,
  path: "/about",
  fields: {
    contact: field.group({
      label: "Contact",
      fields: {
        email: field.text({ label: "Email" }),
        phone: field.text({ label: "Phone" }),
      },
    }),
    team: field.list({
      label: "Team",
      itemLabel: "name",
      maxItems: 12,
      item: field.group({
        fields: {
          name: field.text({ label: "Name", required: true }),
          photo: field.media({ label: "Photo" }),
          links: field.list({ label: "Links", item: field.url() }),
        },
      }),
    }),
  },
});
```

Your route reads them from `entry.fields` as plain JSON (check each value, as
for globals), and `entry.image(id, usageAlt?)` resolves nested media.
`itemLabel` names the child field shown as each item's summary in Admin.

Limits are enforced by the API and shown in the editor:

- a list holds at most 100 items, or its lower `maxItems`; `minItems` and
  required children apply only when publishing;
- one entry holds at most 500 list items in total, counting every list in its
  fields and in all of its blocks (hidden blocks and nested lists included):
  10 groups with 20 links each count 210;
- a field branch has at most six groups and lists, at most two groups directly
  inside each other, and no list directly inside a list (put it in a group);
- nested values count toward the existing JSON size limits and the
  200-media-reference limit of an entry.

Changing these fields later follows the configuration sync rules: raise the
model version; added children and defaults fill existing items; a child
renamed in place declares `renamedFrom` with its former key, and a removed
child is listed in the model's `removedFields` as a pointer where `*` stands
for every list item (`"/team/*/photo"`); tightening a limit is refused while
stored content exceeds it, and sync never truncates a list. Block data changes
still need a block version and a migration. Media used in
nested fields appears in the Media library usage list and cannot be deleted
while referenced. See the operations guide for sync and backups.

## 9. Add SEO metadata, a sitemap and robots.txt

Opt routable models into per-entry SEO in `cms/lace.config.ts` with
`seo: true`, or name fallback fields with
`seo: { description: "excerpt", image: "cover" }`; raise the model version and
run configuration sync. One global may map site-wide defaults from its own
fields:

```ts
defineGlobal({
  key: "settings",
  version: 2,
  label: "Site settings",
  fields: {
    siteName: field.text({ label: "Site name", required: true }),
    description: field.textarea({ label: "Site description" }),
    image: field.media({ label: "Share image" }),
  },
  seoDefaults: { siteName: "siteName", description: "description", image: "image" },
});
```

`site.seo(entry)` resolves the head metadata: the SEO title, otherwise the
entry title through the title template (default `%s | {siteName}`); the SEO
description, then the model's mapped field, then the site default; the same
chain for the image (image media only); the SEO canonical, otherwise
`LACE_BUILD_SITE_URL` plus the entry path. Render it in your layout's `<head>`
with the adapter's head component, which also writes Open Graph and
`twitter:card` tags; pass `type="article"` for posts:

```astro
---
import LaceSeo from "@lacecms/astro/LaceSeo.astro";
import type { PublishedEntry, PublishedSite } from "@lacecms/sdk";

interface Props {
  readonly entry: PublishedEntry;
  readonly site: PublishedSite;
  readonly type?: "article" | "website";
}

const { entry, site, type } = Astro.props;
---

<head>
  <meta charset="utf-8" />
  <LaceSeo seo={site.seo(entry)} type={type} />
</head>
```

Add two endpoints next to your pages. A `sitemap.xml.ts` page lists every
indexable published entry with `lastmod` from its publication time; pass
`{ include: (entry) => ... }` to keep only entries your site has routes for:

```ts
import { sitemapResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace";

export async function GET(): Promise<Response> {
  return sitemapResponse(await getSite());
}
```

A `robots.txt.ts` page allows everything and names the sitemap:

```ts
import { robotsResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace";

export async function GET(): Promise<Response> {
  return robotsResponse(await getSite());
}
```

Without `LACE_BUILD_SITE_URL` the build warns, writes no `sitemap.xml`, and
pages have no canonical URL or `og:url`. With `LACE_SITE_INDEXING=off` every
page is marked `noindex, nofollow` and `robots.txt` disallows everything.
Entries marked _noindex_ in Admin get `noindex, follow` and are left out of the
sitemap. Crawlers read `robots.txt` only at the host root, so a site served
under a path must publish its robots rules at the root itself; one sitemap
holds at most 50,000 URLs.

## 10. Customize rich text

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

## 11. Style through the hooks

Target `data-lace-model`, `data-lace-entry`, `data-lace-block`,
`data-lace-block-key` and `data-lace-part`; tag names and incidental classes are
not part of the contract. A block's `id` and its editor class name are content
that editors choose and change, so style them only for classes you offer
editors on purpose (and keep those classes in any CSS purge safelist):

```css
/* Style Lace content only through the public data-lace-* hooks. */
[data-lace-block="hero"] [data-lace-part="heading"] {
  font-size: 3rem;
}
[data-lace-model="posts"] [data-lace-block="quote"] {
  border-inline-start: 4px solid currentColor;
}
```

The gallery exposes the parts `title`, `items`, `item`, `media` and `caption`;
the navigation exposes `list`, `item`, `link`, `label`, `submenu`, `toggle` and
`children`. Neither component ships styles. This CSS lays galleries out as an
adaptive grid that crops images around their focal point, and navigation as a
vertical list on narrow screens and a row with dropdown submenus from `48rem`:

```css
:where([data-lace-block="gallery"]) [data-lace-part="items"] {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}
:where([data-lace-block="gallery"]) figure {
  margin: 0;
}
:where([data-lace-block="gallery"]) [data-lace-part="media"] {
  aspect-ratio: 4 / 3;
  display: block;
  height: auto;
  object-fit: cover;
  width: 100%;
}
:where([data-lace-block="navigation"]) ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
:where([data-lace-block="navigation"]) [data-lace-part="list"] {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
:where([data-lace-block="navigation"]) [data-lace-part="children"] {
  display: grid;
  gap: 0.25rem;
  margin-block-start: 0.5rem;
  padding-inline-start: 1rem;
}
@media (min-width: 48rem) {
  :where([data-lace-block="navigation"]) [data-lace-part="list"] {
    flex-flow: row wrap;
    gap: 0.5rem 1.5rem;
  }
  :where([data-lace-block="navigation"]) [data-lace-part="submenu"] {
    position: relative;
  }
  :where([data-lace-block="navigation"]) [data-lace-part="children"] {
    background: Canvas;
    border: 1px solid;
    inset-block-start: 100%;
    inset-inline-start: 0;
    min-width: 12rem;
    padding: 0.75rem;
    position: absolute;
    z-index: 1;
  }
}
```

## 12. Images: variants, placeholder and lightbox

The `image`, `gallery` and `hero` components render media through
`@lacecms/astro/LaceImage.astro`. During the build it fetches each original
from the public media path under `LACE_API_BASE_URL` (the origin the build
already reads the export from) and, through Astro's image pipeline, writes WebP
variants 960 and 1920 pixels wide, each capped at the original width, to
`dist/_astro/`. The `<img>` lists them in `srcset` with the `sizes` the component
passes, keeps the original `width` and `height`, and loads lazily with
`decoding="async"`; the hero loads eagerly with `fetchpriority="high"`. Animated
GIFs become animated WebP. A 64-pixel WebP of each opaque image is inlined as a
blurred `background-image` until the image loads; transparent images and GIFs
get none.

Allow the media path as an Astro remote image:

`astro.config.mjs`:

```js
import { laceImageConfig } from "@lacecms/astro";
import { defineConfig } from "astro/config";

export default defineConfig({ image: laceImageConfig(process.env), output: "static" });
```

`laceImageConfig(env)` allows exactly `<LACE_API_BASE_URL>/api/v1/public/media/*`
and nothing without that variable. Astro does not load `.env` for its config
file; the starter's `astro.config.mjs` reads the project `.env` with Node's
`util.parseEnv` and overlays `process.env`. Pass `optimizeImages: false` to
`createAstroSiteLoader` to render the public media URLs as before, without
variants.

The `image` and `gallery` blocks have an _Open full screen_ setting (off by
default). When an editor turns it on, each image becomes a button that opens
the original from its public URL in a modal `<dialog>` with a _Close_ button;
Escape and a click on the backdrop also close it. It uses HTML invoker
commands and no script, so it works in Chrome 135, Firefox 144, Safari 26.2 and
later; older browsers show the image without the action. The original is
downloaded only when the dialog opens. Style it through the
`lightbox-trigger`, `lightbox`, `lightbox-close` and `lightbox-media` parts
(see the starter stylesheet).

The `image` block and every gallery item also have an optional _Link_ (a URL
field with the usual safe URL rules: site paths, `#fragments`, `http(s)`,
`mailto:` and `tel:`). A linked image is wrapped in an
`<a data-lace-part="link">` that opens the link in the same tab, and it never
gets a lightbox, even with _Open full screen_ on; images without a link keep
the lightbox. The image's alt text names the link; when it is empty, the
caption, then the URL, becomes the link's `aria-label`, so give linked images
alt text that describes the destination. Style the wrapper through the `link`
part (see the starter stylesheet).

Astro keeps downloaded originals and variants in `node_modules/.astro/assets/`
and revalidates them with the media `ETag`; Lace keeps placeholders in
`node_modules/.astro/lace/placeholders/`. Keep that directory between builds
to avoid downloading every original again. The Compose builder does this for
you: it links the site's `node_modules/.astro` to its persistent
`builder-cache` volume, together with the pnpm package store, clears the whole
cache when it grows above 2 GiB and drops the Astro part after a failed build.
The generated Cloudflare Pages workflow restores and saves the same directory
with `actions/cache`.

Variants, scripts and styles land in `dist/_astro/` with a content hash in
their names, so browsers may keep them: the Compose web proxy serves
`/_astro/` with `Cache-Control: public, max-age=2592000, immutable` (30 days)
while pages keep revalidating. On Cloudflare Pages the starter site's
`public/_headers` applies the same rule; for an existing site, add
`public/_headers` with:

```text
/_astro/*
  Cache-Control: public, max-age=2592000, immutable
```

A site that changes Astro's `build.assets` directory gets no long-lived
caching: its assets keep revalidating.

## 13. Build

```sh
pnpm astro build
```

The build fails instead of emitting partial pages when the token is missing or
rejected, the API is unreachable, a media original cannot be fetched, a block
has no component, or block data or rich text breaks the CMS rules.

## Organize admin forms without changing site data

Models, block data and group fields (including list-item groups) can declare
`layout: { mode: "sections" | "tabs", groups: [{ key, label, description?, fields }] }`.
For example, alongside a model's `fields: { author: field.text(), excerpt: field.textarea() }`,
use `layout: { mode: "tabs", groups: [{ key: "copy", label: "Copy", fields: ["excerpt"] },
{ key: "details", label: "Details", fields: ["author"] }] }`. Each group and
its field list must be nonempty; keys must be unique field-style identifiers,
labels nonblank and references immediate siblings with no duplicates or paths.
Unlisted fields appear afterwards in declaration order. Scalars/lists do not
accept layout; a list's group item does. A block's `settingsLayout` refers only
to its declared settings. System title, slug, SEO and block envelope controls
keep their established placement.

Visual sections/tabs add no data objects, paths or defaults. Sites read the
same JSON; tabs preserve rich-text/media/list state and validation-summary
links reveal nested fields. No model/block version increase or database/content
migration is needed. Synchronize metadata as usual: public version advances
and a build is requested/coalesced, without changing stored content/revisions.
Deploy matching content/config/contracts/API/admin packages before adoption;
remove layout options before rollback to an older engine.

The collection Create entry dialog suggests an ASCII slug from title until
manual editing (including clearing it); explicitly re-enable Suggest from title
to resume. NFKD accents are removed (`Café` → `cafe`), separators become hyphens,
and the maximum is 100 characters with no boundary hyphens. Non-Latin/empty
titles have no fallback or transliteration; enter a slug manually or draft
without one. Suggestions do not guarantee uniqueness; publication reports route
conflicts normally. Creation saves the slug atomically and opens a clean
editor. Existing entries and duplicates retain their slug until explicitly
edited or the editor's opt-in suggestion control is enabled.

## Reusable list layouts (Gallery v4)

Gallery imports its site-owned `ListLayout.css` companion. `lace add block gallery`
installs both under the configured components directory and records both hashes
in the same item. CSS/component conflicts preserve the entire active item; inspect
`--dry-run` and `--write-new`, then merge and rerun instead of overwriting edits.

Custom lists spread `listLayoutSettings()` from `@lacecms/content` into scalar
settings, set `settingsVisibility: listLayoutSettingsVisibility()` on the block
(using the companion export from `@lacecms/content`), and reuse the installed CSS
by relative import. Mark their outer element
`data-lace-layout-container`, list `data-lace-layout`, `data-lace-wrap` and
`data-lace-preset` from validated settings, and direct items `data-lace-layout-item`.
Do not claim a second registry ownership of the shared file. The `lace-layout`
layer has zero-specificity structural rules; site CSS controls decoration and
image crop. Set `--lace-list-gap` (default 0) and `--lace-list-item-min` (14rem).
Unlayered site rules override it; order theme layers after `lace-layout` otherwise.
Vertical wrap needs an explicit site-defined height. Grid thresholds are container
widths of 32/48/64rem; all seven preset names are in the content-modeling guide.
Schematics explain composition, not site appearance. Default grid/auto preserves
Gallery sizes; other modes use conservative `100vw`, tunable in your component.

For a v3 upgrade, back up content and site first, upgrade compatible engine/admin/
CLI/site packages, install the v4 renderer and companion with conflict review,
remove old unlayered Gallery display/columns rules, keep 1rem spacing through
`--lace-list-gap`, and preserve your image/theme rules. Increment model versions
that structurally include Gallery; deploy matching definitions/renderer, then run
normal `lace content sync`. Migration 4 preserves data, links, order, envelopes
and lightbox and fills absent layout defaults (`grid`, true, `auto`); migrations
2/3 remain. Interrupted sync resumes by rerunning. No new SQL migration is needed.
After sync, rollback requires the pre-upgrade backup with matching older code;
there is no automatic down-migration of v4 blocks.

Layout visibility shows Wrap items only for flex and Grid preset only for grid.
Inactive values remain stored and validated; a relevant validation error reveals
its control for correction. The optional map requires matching updated CMS/admin
packages. Changing it needs ordinary content sync, which preserves snapshots but
retains existing published-version and build-request behavior. No Gallery v4
migration, SQL migration or Astro source/CSS update is needed for visibility.

## Video embeds

New starters include `videoEmbed`. Existing sites can install it with
`pnpm exec lace add block videoEmbed --site site` (use your actual site path).
Use matching content/render/adapter/CLI packages. Review the component and its
`VideoEmbed.css` companion together; use `--dry-run` and `--write-new` to resolve
local source conflicts. Register `builtInBlocks.videoEmbed`, allow the type in
selected CMS models, advance their versions and run configuration sync.

The block accepts YouTube watch/share/shorts/embed URLs and Vimeo video/player
URLs. For example, `https://youtu.be/dQw4w9WgXcQ` or an unlisted Vimeo URL
`https://vimeo.com/76979871/abc123def` (substitute the owner's real privacy hash).
Title is required for accessibility; poster image and caption are optional.
Provider restrictions and media references are validated in the CMS.

Without a poster the component renders a lazy iframe. A poster uses LaceImage,
including existing image optimization/focal point, with an empty decorative alt
inside a named button. Activating it loads one iframe and moves focus there;
playback never autostarts and can need a second click on Play. No provider
requests or thumbnails are loaded before that activation. A source link remains
available without JavaScript or if embedding fails. Provider privacy/domain
restrictions must permit the site. URL playback/tracking parameters are not
forwarded; only a Vimeo privacy hash is retained.

The renderer is site-owned. It is the sole built-in with a small local activation
script; there is no provider SDK or framework hydration. `VideoEmbed.css` reserves
a responsive 16:9 area in `@layer lace-layout`; site CSS owns decoration. Hooks:
`data-lace-part="preview|play|player|caption|source"` on the corresponding elements.
`describeVideoEmbed` from `@lacecms/render` supplies canonical player data without
network access. Source URLs are content strings; only posters use media storage.
Video-file upload support is separate deferred work.

For an optional manual playback smoke check, publish an owner-approved public
YouTube video and a Vimeo video allowed on your domain, with and without a poster.
Open the published site, verify keyboard activation and then press the provider's
Play control. Automated tests stub provider frames and do not prove external
availability or permissions. Keep renderers deployed while published content uses
the type; rolling back to a site without its renderer will fail the build.
