# Block registry and site rendering

Part of the [Lace architecture](README.md).

## 11. Block registry and rich text

The block registry maps each `block_type` to a stable key, a human-readable
label and optional one-sentence description, a schema version, a runtime
validation schema, serializable form metadata, and optional default data,
declared settings and migrations. Definitions, the built-in blocks and every
validation rule are specified in
[block-registry](../../openspec/specs/block-registry/spec.md).

- **Fields.** `defineBlock({ fields })` accepts bounded composite data (nested
  groups and lists without block identity of their own). Rename hints are
  forbidden at every block-data depth: changes to stored block data are
  expressed through block versions and migrations.
- **Settings.** `defineBlock({ settings })` declares presentational settings,
  kept separate from block content and limited to scalar `select`, `boolean`,
  `number` and `text` fields that each declare a `defaultValue`. Settings
  enter the block metadata only when declared, so blocks without settings
  keep their hashes. They are structural: changing a setting needs a block
  version increase and a migration. Stored blocks keep their settings with
  defaults applied, and the admin and public block contracts carry them.
- **Migrations.** `defineBlock({ version, migrations })` keys pure,
  synchronous migrations by target version in one contiguous range ending at
  the block's version. Migrations are runtime-only: like the validator they
  never enter the metadata projection, the canonical structure or any hash.
  Only configuration synchronization runs them
  ([content-configuration.md §8](content-configuration.md),
  [schema-evolution](../../openspec/specs/schema-evolution/spec.md)); a
  migration is kept for as long as any environment may still hold blocks of
  an older version.
- **Display metadata.** A block's label and description reach the admin
  through the block projection, change the configuration projection hash and
  never change the structural hash. Block icons are not configuration: the
  admin maps the built-in types to icons and gives any other type a default
  icon.

Runtime schemas are implemented with Valibot ([ADR 0022](../adr/0022-hono-rest-valibot-schemas.md)). The public field DSL
never exposes raw Valibot schemas as its serialized admin contract: a field
definition produces serializable form metadata, a runtime schema, an inferred
TypeScript type and, where needed, JSON Schema
([field-descriptors](../../openspec/specs/field-descriptors/spec.md)). The admin
renders block forms from that serializable metadata; exact site rendering and
custom admin editors are not required for every block.

### Rich text

Tiptap JSON is stored only inside rich-text field or rich-text block data; a
page never becomes one Tiptap document ([ADR 0026](../adr/0026-code-defined-models-two-snapshots.md)).

The allowed Tiptap node and mark set is explicit, closed and shared by
validation and rendering. Every rich-text field and default, including
composite leaves and block data, uses this one format, without field-specific
feature sets and without counting toward list budgets. Raw HTML nodes,
scriptable URL schemes, inline event handlers and arbitrary style attributes
are rejected. The node and mark set, link attributes and permitted URL forms
are specified in
[content-validation](../../openspec/specs/content-validation/spec.md) under
"Safe rich-text documents and URL values"; the format and its compatibility
with earlier documents are recorded in
[ADR 0014](../adr/0014-expanded-rich-text-format.md).

Stored link attributes are limited to `href`, `target: "_blank"` and
`rel: "nofollow"`. The renderer derives `noopener noreferrer` for a new tab, so
stored JSON never holds generated safety tokens. Ordinary URL fields stay
strings.

The allowlist and URL rules have one implementation in `@lacecms/content`. The
render core's `describeRichText` reuses it exclusively, and framework adapters
escape text and render only the resulting element description. Sites never
keep their own allowlist copies. Consumers that read structured JSON without
the render core remain responsible for an equally safe renderer.

### Blocks on the site

Sites render blocks through a block map that pairs each block definition with
a user-owned component (§13). The definitions a site uses are the same
`defineBlock` definitions the configuration uses. A site that cannot render a
block type, or whose definition version differs from the published block,
fails its build with the model, entry and block identifiers.

## 13. Site rendering and block installation

Sites consume Lace through three layers
([ADR 0006](../adr/0006-shared-rendering-core-and-installed-block-source.md)):

1. framework-neutral loading in `@lacecms/sdk` and parsing and rich-text
   description in `@lacecms/render`;
2. a thin framework adapter (`@lacecms/astro`) that renders those results;
3. user-owned visual block source installed from the block registry.

This section fixes the package boundaries, ownership and safety rules; the
public names, inputs, outputs and error codes are specified by the capability
specs linked below. The public wire schema is published-only
([api.md §12](api.md), [ADR 0009](../adr/0009-media-metadata.md)).

### 13.1 SDK client

`@lacecms/sdk` is a small fetch-based client usable during site builds and by
external consumers. Its published-content operations and the paged build
export, which it assembles and checks for consistency across pages and
restarts when content changes during the traversal, are specified in
[public-sdk](../../openspec/specs/public-sdk/spec.md).

The build token is read-only and may access published content only. It never
grants admin-session capabilities and is used only in server-side build or
dev-server code, never in client bundles.

### 13.2 Published-site loader

`createPublishedSiteLoader(options)` in `@lacecms/sdk` returns a loader that
resolves to a `PublishedSite` view. It imports no framework and never reads
`process.env` or `import.meta.env` itself; configuration arrives as an
environment record or explicit values. Configuration, static and revalidate
modes, the expected-version check, the view's lookups (entries, globals, media,
images, links, site URL, indexing, SEO, sitemap and robots) and the error codes
are specified in
[published-site-loader](../../openspec/specs/published-site-loader/spec.md).

The loader's invariants:

- The view exposes published content only, with no draft-shaped property.
  Hidden blocks are never delivered to sites.
- The loader trusts the CMS-resolved `path`, never re-derives route patterns
  and never names model keys; it rejects exports with duplicate paths, slugs
  or global keys.
- Lookups return `undefined` when absent, so routes choose between 404 and
  failure.
- Failures carry stable codes. Messages are project-neutral and never include
  the token; generated projects pass hints that name their own commands.

### 13.3 Render core

`@lacecms/render` depends only on `@lacecms/content` and imports no UI
framework, SDK transport or REST contract. It reuses the content package's
publish validation, defaults and budgets for block data, envelopes and rich
text, so it accepts what the CMS accepts for its rendering input (it does not
validate fields or hidden blocks absent from that input). It never migrates
block data. Its behavior is specified in
[render-core](../../openspec/specs/render-core/spec.md):

- `parseBlock` validates a block against its definition and fails on a type or
  schema-version mismatch;
- `defineBlockMap`, `resolveBlock` and `prepareBlocks` resolve every rendered
  block type, skip hidden blocks and return each mapped component with its
  `BlockProps` (parsed data, typed settings, envelope, context, media URL
  builder, image describer and link resolver), so adapters only render the
  result;
- the image describer returns an `ImageDescription` from resolved media;
- `describeRichText` returns a neutral tree of text and allowlisted element
  nodes and never produces a raw HTML string;
- `describeVideoEmbed` describes a provider URL without network calls.

The render core's block input is structural: both the public and the admin
block DTOs satisfy `RenderableBlock` without conversion. Failures are
`LaceRenderError`s naming the model, entry, block key and field path, with the
content validation error as cause.

### 13.4 Astro adapter

`@lacecms/astro` depends only on `@lacecms/render` and `@lacecms/sdk` among Lace
packages, declares a peer dependency on the supported Astro range, and ships
Astro component source next to its compiled server module in `dist/`. It
contains no visual blocks, no client scripts and no Astro integration. Its
components and helpers are specified in
[astro-adapter](../../openspec/specs/astro-adapter/spec.md):

| Export | Responsibility |
| --- | --- |
| `createAstroSiteLoader` | Server-only loader glue over the published-site loader |
| `LaceBlocks.astro` | Renders an entry's or global's visible blocks through the block map, with no wrapper markup |
| `RichText.astro` | Renders the validated rich-text description; overrides typed by `RichTextOverrideProps` |
| `LaceImage.astro` | Build-time WebP variants, blurred placeholder and script-free lightbox |
| `LaceSeo.astro` | Head metadata from a resolved SEO value |
| `sitemapResponse`, `robotsResponse` | Endpoint responses for user-owned routes |
| `laceImageConfig` | Allows only the public media path of the API origin as a remote image source |

Adapter invariants:

- Sites pass `{ env: { ...import.meta.env, ...process.env }, dev:
  import.meta.env.DEV }` from their loader file, because `import.meta.env` is
  not reliably transformed inside externalized dependencies. The loader module
  fails fast when evaluated in a browser; `LACE_BUILD_TOKEN` never reaches a
  client bundle.
- `RichText.astro` renders with Astro's escaping and never uses `set:html`;
  overrides receive only the validated element and its rendered children.
- Image placeholders are cached in `node_modules/.astro/lace/placeholders/`
  by source URL. Sites declare `sharp`, which Astro's image service loads from
  the site.

### 13.5 Block registry and `lace add block`

Canonical block sources live in the repository `registry/` directory and are
bundled with, and versioned by, the `@lacecms/cli` release; the CLI never
fetches registry content over the network. `registry/registry.json` lists the
items; each item lives in `registry/<framework>/<item>/` with a manifest. An
item holds exactly one component plus optional `.css` stylesheet companions.
Installed sources, stylesheets included, are site-owned; no runtime package
exports visual CSS. The registry, manifests and the site-local lock are
specified in
[block-source-registry](../../openspec/specs/block-source-registry/spec.md).

The site-local `lace.site.json` records the framework, the components
directory, the block map file and its hash, an optional `definitions` module
that exports custom block definitions (only imported, never written), and per
installed item its revision and per-file SHA-256 hashes. The generated block
map file imports definitions and components and exports
`blocks = defineBlockMap({...})`. Built-in definitions come from
`@lacecms/content`; custom definitions come from the recorded `definitions`
module, which `lace.config.ts` also uses. Definitions are imported, never
copied.

`lace add block <type...>` resolves item dependencies, writes component and
stylesheet files, updates the map file, checks installed package versions
against item ranges and built-in definition versions against
`lace.config.ts`, and scaffolds a typed component for a configured custom
block that has no registry item
([block-installation-cli](../../openspec/specs/block-installation-cli/spec.md)).
It never overwrites a site edit: a conflict leaves every file of the item and
its lock record unchanged. Ownership and conflict rules are in
[distribution.md §7](distribution.md).

Rules every registry component and scaffold follows:

- The block's `anchor` is the root element's `id` and its `className` follows
  the component's own classes in the root `class`; there is no wrapper
  element, and a block without an envelope renders unchanged markup.
- Components keep the documented `data-lace-*` styling hooks.
- Built-in components carry no `<style>`; presentation stays in the site
  stylesheet. Only `videoEmbed` and `gallery` carry a small local `<script>`
  for video activation and ambient mounting, with no player SDK or framework
  hydration.
- Media images render through `LaceImage.astro`, including the lightbox for
  blocks whose `lightbox` setting is on.
- Rendering stays static: no live ambient video iframe appears in static
  HTML, and source links remain available with or without JavaScript. Ambient
  playback has no pause control, a documented WCAG 2.2.2 gap for motion
  longer than five seconds.
- Structural list-layout CSS is limited to zero-specificity rules in
  `@layer lace-layout`; site CSS owns decoration, image proportions and
  cropping and overrides the baseline
  ([list-layout](../../openspec/specs/list-layout/spec.md)).

Built-in markup, image sizes, lightbox identifiers and video behavior are
specified in block-source-registry and
[video-embeds](../../openspec/specs/video-embeds/spec.md). Every
Lace-maintained site holds byte-identical copies of the registry sources it
records.

### 13.6 Framework selection

Registry items, `lace.site.json` and adapters are keyed by framework. `astro`
is implemented and is the default; `react`, `vue` and `svelte` are reserved
keys that fail with an explicit "framework not supported yet" error, and their
adapters would be named `@lacecms/react`, `@lacecms/vue` and `@lacecms/svelte`.
All adapters share the render core. How `lace add block` selects the framework
is specified in block-installation-cli.

### 13.7 Typical Astro site files

The site files below are user-owned unless marked generated. The engine
reference site and the generated starter show complete examples
([astro-reference-site](../../openspec/specs/astro-reference-site/spec.md)).

| File | Responsibility |
| --- | --- |
| `src/lib/lace.ts` | Exports `getSite = createAstroSiteLoader({ env, dev })` with the merged environment (§13.4) |
| `src/lace/blocks.ts` (generated by `lace add block`) | Exports `blocks = defineBlockMap({...})` pairing definitions with installed components |
| `src/components/lace/*.astro` (installed) | Block components typed with `BlockProps<typeof definition>`, keeping the `data-lace-*` hooks |
| Page routes | Read `site.byPath(...)` or `site.bySlug(...)` and render `<LaceBlocks entry blocks mediaUrl>` |
| Layouts | Render a published global's blocks (such as `navigation`) through `LaceBlocks`, with a static fallback while it is unpublished, and `<LaceSeo seo={site.seo(entry)}>` in the head |
| `src/pages/sitemap.xml.ts`, `robots.txt.ts` | Return `sitemapResponse(site)` and `robotsResponse(site)` |

Collection routes read the entry by slug on each render, not only in
`getStaticPaths`, so dev revalidation shows publications on reload.

The CMS describes route patterns for validation and preview URLs, but it does
not generate or own the user's Astro route files.
