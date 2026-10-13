## Context

See proposal.md for motivation. Relevant current state:

- `builtInBlocks` (`packages/content/src/index.ts`) is a frozen record of five
  definitions. `tests/block-sources.test.mjs` requires the registry item names
  to equal `Object.keys(builtInBlocks)` and every Lace-maintained site
  (`apps/site`, `packages/create-lace/templates/site`,
  `tests/fixtures/existing-astro-site`) to install all of them with identical
  block maps; the CLI bundles `registry/` byte-for-byte at build time.
- Composite descriptors (`field.group`, `field.list` with `minItems`,
  `maxItems`, `itemLabel`, `defaultValue`) are validated recursively by the
  shared rules used by API, sync and render core; the admin edits them with the
  generic `FieldRenderer` (CE7C). `isSafeUrl` already guards every `url`
  field, nested ones included.
- `createImageDescriber` accepts any media ID from the export's media
  dictionary, so nested media IDs work unchanged. `PublishedGlobal`
  structurally satisfies the render core's `RenderableEntry`.
- `BaseLayout.astro` (reference and starter) receives the page's `site` view
  and renders a header from `site.global("settings")` with static fallbacks.
  Block components carry no `<style>`; presentation lives in the site-owned
  stylesheet (`apps/site/src/styles/site.css`, starter `global.css`).
- `apps/site` uses the root `lace.config.ts`; adding a model there changes
  model lists asserted by API, Node server, Worker and config tests.
- Cross-runtime verification (`pnpm verify:34a`) seeds both runtimes through
  `scripts/cross-runtime-api.mjs`, builds `apps/site` from each actual export
  (`scripts/cross-runtime-astro.mjs`) and compares against
  `tests/fixtures/cross-runtime/expected.json`.

## Goals / Non-Goals

**Goals:**

- Two useful first-party blocks expressed only with the public DSL, proving the
  composite pipeline from configuration to static HTML.
- A site-wide navigation that editors control through normal global
  publication, with a safe fallback.
- No change to REST, database, export, SDK or admin code.

**Non-Goals:**

- Inherited-alt placeholders for media/alt pairs nested inside groups (the
  CE3B hint stays a top-level block feature; see D7).
- JavaScript menu behavior, mega menus, lightbox, carousel, `srcset`.
- Updating the Docker Node journey, the pre-publication consumer journey and
  the existing-Astro consumer journey: they keep exercising the five earlier
  blocks; Gallery and Navigation are verified by the reference fixture, the
  packed starter and cross-runtime delivery.

## Decisions

### D1 — Gallery and Navigation are built-ins, not starter-only custom blocks

Add both to `builtInBlocks` so configurations import them like the other
built-ins, the CLI installs them from the registry with version checks, and
the block map imports their definitions from `@lacecms/content`.

Alternative rejected: project-defined blocks inside the starter's
`lace.config.ts` with scaffolded components. The registry/version/parity
tooling only covers built-ins, the reference site and existing-site guide
would each need copies of the definition, and owner decision 7 asks for
shipped blocks.

Adding built-ins does not touch configurations that do not register them
(hashes derive from registered definitions); a test pins this.

### D2 — Schemas

```ts
gallery: defineBlock({
  type: "gallery", version: 1, label: "Gallery",
  description: "A grid of images with optional captions.",
  fields: {
    title: field.text({ label: "Title" }),
    images: field.list({
      label: "Images", defaultValue: [], minItems: 1, maxItems: 50, itemLabel: "caption",
      item: field.group({ fields: {
        media: field.media({ label: "Image", required: true }),
        alt: field.text({ label: "Alt text",
          description: "Leave empty to use the media item's alt text." }),
        caption: field.text({ label: "Caption",
          description: "Leave empty to use the media item's caption." }),
      } }),
    }),
  },
}),
navigation: defineBlock({
  type: "navigation", version: 1, label: "Navigation",
  description: "A list of links with optional one-level submenus.",
  fields: {
    name: field.text({ label: "Navigation name",
      description: "Read by screen readers, for example Main or On this page." }),
    links: field.list({
      label: "Links", defaultValue: [], minItems: 1, maxItems: 20, itemLabel: "label",
      item: field.group({ fields: {
        label: field.text({ label: "Label", required: true }),
        url: field.url({ label: "URL",
          description: "Optional when the link has submenu links." }),
        children: field.list({
          label: "Submenu links", maxItems: 20, itemLabel: "label",
          item: field.group({ fields: {
            label: field.text({ label: "Label", required: true }),
            url: field.url({ label: "URL", required: true }),
          } }),
        }),
      } }),
    }),
  },
}),
```

- `defaultValue: []` lets a new block show *Add* immediately; `minItems: 1`
  makes an empty gallery/navigation a publication-only problem (draft save
  allowed, consistent with CE7A).
- Depth: gallery 2 containers, navigation 4 (list → group → list → group),
  well inside the CE7A limits. Worst case navigation = 20 + 400 = 420 list
  elements (< 500). Gallery ≤ 50 media references (< 200 per entry).
- `name` (not `label`) for the block-level accessible name avoids confusion
  with the link `label`.
- Field labels/descriptions are projection-only; changing them later needs no
  version bump.

### D3 — Gallery markup

```astro
<section class:list={["gallery", className]} data-lace-block data-lace-block-key id={anchor}>
  {title && <h2 data-lace-part="title">{title}</h2>}
  <ul data-lace-part="items" role="list">
    {images.map((item) => <li data-lace-part="item"><figure>
      <img alt data-lace-part="media" height loading="lazy" src style width />
      {caption && <figcaption data-lace-part="caption">…</figcaption>}
    </figure></li>)}
  </ul>
</section>
```

`image(item.media, item.alt)` gives the CE3 effective alt and focal point;
caption = `item.caption ?? media.caption`. `role="list"` keeps list
semantics when CSS removes markers (Safari). The `<h2>` level is a reasonable
default inside page content; site owners own the component and may change it.

### D4 — Navigation markup and disclosure behavior

```astro
<nav aria-label={name} class:list={["navigation", className]} data-lace-block … id={anchor}>
  <ul data-lace-part="list">
    <li data-lace-part="item"><a data-lace-part="link" href aria-current>Home</a></li>
    <li data-lace-part="item"><details data-lace-part="submenu">
      <summary data-lace-part="toggle">Docs</summary>
      <ul data-lace-part="children">
        <li data-lace-part="item"><a data-lace-part="link" href="/docs">Docs</a></li>
        <li data-lace-part="item"><a data-lace-part="link" href="/guide">Guide</a></li>
      </ul>
    </details></li>
    <li data-lace-part="item"><span data-lace-part="label">Plain text</span></li>
  </ul>
</nav>
```

Rules:

- A parent with at least one child **is** the disclosure; its own URL (if
  any) becomes the first submenu link with the same label. This keeps one
  interaction per item, works for touch and keyboard, and avoids split
  buttons.
- Native `<details>`/`<summary>`: focusable, toggled with Enter/Space, exposes
  expanded state to assistive technology, needs no JavaScript or CSP
  exception. Escape-to-close and closing on outside click are not provided
  (documented); site owners may add a script.
- `aria-current="page"`: computed from `Astro.url.pathname` for root-relative
  URLs without `?`/`#`, comparing with one trailing slash removed (except
  `/`). Absolute URLs never match (the site URL is optional and may differ).
- An item with neither URL nor children renders a `label` span (still
  publishable; documented as a heading-like separator).
- Without `name`, no `aria-label` is emitted; docs recommend naming each
  navigation when a page has several.

Alternative rejected: a JavaScript disclosure button with `aria-expanded`
(WAI pattern). It needs an inline script in a user-owned component, CSP
consideration and hydration-free event wiring for a static site; the native
element meets the keyboard requirement.

### D5 — Styling lives in the site stylesheet

Responsive CSS ships in `apps/site/src/styles/site.css`, the starter
`global.css` and the managed guide (for existing sites), using
`:where([data-lace-block="gallery"])`-style selectors (zero specificity):

- Gallery: `ul` grid `repeat(auto-fill, minmax(min(14rem, 100%), 1fr))`,
  images `width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover`
  (focal `object-position` then matters).
- Navigation: flex row with wrap; at `min-width: 48rem` submenus are
  absolutely positioned under their item; below it the list stacks
  vertically and submenus are inline and indented. No horizontal scrolling at
  320px.

Alternative rejected: Astro `<style>` in components. Scoped styles add
`data-astro-cid-*` attributes, changing markup that tests and site owners rely
on, and would duplicate site CSS in every installation.

### D6 — Navigation global and layout

Configuration (reference and starter):

```ts
defineGlobal({ key: "navigation", version: 1, label: "Navigation",
  description: "Links shown in the header of every page.",
  fields: {}, blocks: ["navigation"] })
```

Layout:

```astro
import LaceBlocks from "@lacecms/astro/LaceBlocks.astro";
import { blocks } from "../lace/blocks";
const navigation = site.global("navigation");
…
<header class="site-header">
  …site name / tagline…
  {navigation === undefined
    ? <nav aria-label="Main" class="site-nav"><ul>…static links…</ul></nav>
    : <LaceBlocks blocks={blocks} entry={navigation} mediaUrl={site.mediaUrl} />}
</header>
```

- Reuses the page's `site` (no second loader call).
- Fallback only when unpublished; a published global without visible blocks is
  an editorial choice and renders nothing.
- Fallback links: reference — Home and About; starter — Home (no blog index
  route exists).
- Anchors of global blocks are not checked against page anchors (page-wide
  uniqueness across entries remains out of scope since CE6B); docs advise not
  anchoring the site navigation.
- Label "Navigation" in the admin Site group; the 0.24.0 upgrade text calls
  the group "Site", so no conflict.

### D7 — No nested inherited-alt hint in the admin

`mediaAltPair` drives the CE3B placeholder only for top-level block data.
Extending it to groups would need a media lookup inside the `entities/content`
recursive renderer, which the layer rules keep free of media features (the
warning component lives in `features/edit-media-metadata`). The gallery `alt`
and `caption` descriptions state the fallback instead. A generic nested
version can follow later without a schema change.

### D8 — Reference fixture and versions

- Root config: register seven blocks; `home` 5, `about` 4, `posts` 5,
  `notes` 4 allow all seven; add the `navigation` global.
- `published-export.json`: navigation global (`name: "Main"`, Home `/`, About
  `/about`, Writing → children "First post" `/blog/first-post` and "First note"
  `/notes/first-note`); a gallery in
  `first-post` (items using `post-media` without overrides and `note-media`
  with alt override and caption); on `home`, an "On this page" navigation
  between the hero and the call to action linking to the existing
  `#get-started` anchor (the about page keeps blocks without anchors, as CE6B
  requires).
- `fixture-build.test.mjs` scopes per-page block-root and part assertions to
  the `<main>` entry scope and adds header navigation assertions; the live
  no-globals test asserts the fallback.

### D9 — Starter, template 0.27.0 and acceptance

- Starter config: seven blocks; `home`/`posts` v2; `navigation` global.
  Inventory adds the two components (user-owned). `TEMPLATE_VERSION`
  `0.27.0`; upgrade instructions add one "Template 0.27.0: …" configuration
  entry (no database entry). Snapshots regenerate.
- `starterJourney` adds a home gallery and the navigation global to the served
  export and asserts the spec scenarios; the no-globals build asserts the
  fallback.

### D10 — Cross-runtime

`apiJourney` saves the `about` page with a `gallery-one` block (two items using
the cover: one with alt override "Gallery cover" and caption, one without), and
saves/publishes the `navigation` global's singleton draft with one navigation
block (Home `/`, Blog with child "Alpha" `/blog/alpha`); then it saves an
unpublished navigation draft with the label `DRAFT ONLY NAV`. `canonicalSite`
adds `globals` and replaces nested media IDs with `<cover>`. The Astro journey
checks header navigation on every route, per-image alt (`Published cover`,
`Gallery cover`, `""`) and expected media occurrences. The gallery stays off
`home` so browser block-ordering scenarios are unaffected.

## Risks / Trade-offs

- [Root config change breaks pinned model lists/hashes in API, Node, Worker,
  config and D1 budget tests] → update expectations in the same task; no
  production logic changes.
- [`gallery` used as an "unknown type" in render, CLI and test-utils tests]
  → rename those fixtures to `carousel` where the test needs an unknown type.
- [Native `<details>` lacks Escape/outside-click closing] → documented;
  owners can enhance their own component.
- [Global navigation anchors may duplicate page anchors] → documented; no
  enforcement across entries.
- [Docker Node journey not updated or run] → recorded as a non-goal; packed
  starter and cross-runtime cover the new blocks.
- [Cross-runtime verification needs local workerd/Playwright] → run
  `pnpm verify:34a`; if the environment cannot, record the limitation.

## Migration Plan

No database migration or data conversion. Existing projects keep building:
their block maps do not include the new types and their configurations do not
register them. Adoption is manual (upgrade instructions). Rollback: remove the
blocks from models (with `removedBlocks` if entries use them) or restore the
backup taken before sync; older content packages cannot load a configuration
that references the new built-ins.
