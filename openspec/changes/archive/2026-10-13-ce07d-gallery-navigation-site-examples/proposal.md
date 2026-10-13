## Why

CE7A–CE7C made bounded `field.group` / `field.list` composites storable,
evolvable and editable, but nothing Lace ships uses them: the registry still
has five flat blocks, the starter header navigation is static site source, and
site owners have no worked example of composite data reaching an Astro page.
Step CE7 of [`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
closes with session **CE7D — Gallery, Navigation and shipped site examples**,
per owner decisions 7 and 8 (Gallery and Navigation built from the public
builders; a route-less `navigation` global rendered by the shared layout).
Architecture sections 8 ("Initial built-in blocks", "Starter and reference
site"), 11 and 13.3–13.7 and [ADR 0013](../../../docs/adr/0013-bounded-composite-fields.md)
govern the change.

## What Changes

- **Built-in blocks (`@lacecms/content`):** `builtInBlocks` gains
  - `gallery` v1: optional `title`; `images` list (default `[]`, publication
    minimum 1, maximum 50, item label `caption`) of groups with required
    `media`, optional `alt` override and optional `caption`;
  - `navigation` v1: optional `name` (the landmark's accessible name);
    `links` list (default `[]`, publication minimum 1, maximum 20, item label
    `label`) of groups with required `label`, optional `url` and an optional
    `children` list (maximum 20) of groups with required `label` and `url`.

  Both use only the public field DSL, declare no settings, and are edited by
  the generic CE7C composite controls. Existing built-ins are unchanged.
- **Registry items** `gallery` and `navigation` (revision 1) with Astro
  components that honor the CE6 envelope (root `id` from the anchor, class
  name after the component's own class) and document `data-lace-part` hooks:
  - Gallery renders a `<section class="gallery">` with an optional heading and
    a list of figures; each image uses the image describer with the item's alt
    override (CE3 fallback: item alt, media alt, `""`), dimensions, focal-point
    `object-position`, lazy loading, and the item caption falling back to the
    media caption.
  - Navigation renders a `<nav>` named by `name`, a list of links, and one
    submenu level as a native `<details>`/`<summary>` disclosure (keyboard
    operable without JavaScript). A parent with children becomes the
    disclosure; its own URL, if any, is the first link of the submenu. A
    root-relative link to the current page gets `aria-current="page"`.
- **Site styling:** responsive grid and navigation CSS (including the narrow
  screen layout) ship in the site-owned stylesheets of the starter and the
  reference site and in the managed site guide, using the `data-lace-*` hooks;
  components carry no `<style>` blocks.
- **Astro adapter:** the block list accepts a published global as its entry,
  so a layout can render global blocks through the normal block map
  (verified by tests; no API change expected).
- **Reference site (root `lace.config.ts`, `apps/site`):** all routable models
  allow the seven built-ins (versions bumped); a new `navigation` global
  (label "Navigation") allows only the Navigation block; `BaseLayout` renders
  the published global's blocks in the site header from the already-loaded site
  view and falls back to static links while the global is unpublished. The
  fixture export adds a published navigation global with a submenu, a gallery,
  and local "On this page" navigation in page content.
- **Starter template `0.27.0`:** the same two components and lock entries,
  `home`/`posts` allowing all seven built-ins (version 2), the `navigation`
  global, the layout and stylesheet changes, managed-guide documentation and
  upgrade instructions for manual adoption (`lace add block gallery
  navigation`, configuration, sync, layout). No database migration.
- **Acceptance:** the packed starter build asserts the gallery and the
  published navigation (with submenu disclosure) and the fallback without
  globals; cross-runtime verification publishes the navigation global and a
  gallery on both runtimes, saves a later draft and compares the built output.
- **Documentation:** configuration examples for model-level groups/lists and
  both blocks, the limit counters, nested evolution and media behavior in
  `docs/composite-fields.md` and the managed site guide; architecture,
  `docs/site-styling.md`, `docs/compatibility.md`, the CLI/starter READMEs and
  the roadmap.
- **BREAKING (alpha, site sources):** sites whose block map lacks the two new
  types keep building; projects that adopt the new starter configuration must
  install the components first, or builds fail with the existing unknown-block
  diagnostic. Older engine packages do not know `builtInBlocks.gallery` /
  `builtInBlocks.navigation`, so configuration using them requires the new
  content package.

Not in this change: a lightbox, carousel or responsive `srcset` (CE11);
entry-reference links (CE10); a mega-menu renderer beyond one submenu level;
JavaScript menu behavior (Escape-to-close, off-canvas toggle); block-specific
React editors; an inherited-alt placeholder for media/alt pairs nested inside
groups; database, REST or export changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `block-registry`: seven built-ins, with the Gallery and Navigation schemas.
- `block-source-registry`: registry items, markup and hooks for Gallery and
  Navigation; the starter lock and block map list seven items.
- `block-installation-cli`: a fresh install of every built-in reproduces the
  seven-component starter files.
- `astro-adapter`: the block list renders a published global's blocks.
- `astro-reference-site`: seven-block vocabulary, a navigation global rendered
  by the layout with a fallback, a gallery and local navigation in the
  fixture, and the new part hooks.
- `generated-project-onboarding`: starter models permit every built-in block;
  the existing-site guide installs every built-in component.
- `project-generator`: template `0.27.0` with the blocks, the navigation
  global and adoption instructions.
- `generated-project-acceptance`: the packed starter verifies the gallery and
  the published and fallback navigation.
- `cross-runtime-product-verification`: both runtimes deliver a gallery and a
  published navigation global with draft isolation to the built site.

## Impact

- Code: `packages/content` (definitions, tests), `packages/render` and
  `packages/astro` (tests), `packages/cli` (tests that used `gallery` as an
  unknown type), `registry/` (two items and index), `apps/site` (components,
  lock, block map, layout, stylesheet, fixture, tests), root `lace.config.ts`
  and the tests that pin its models (API content-sync, Node server, Cloudflare
  Worker, config fixtures), `tests/fixtures/existing-astro-site`,
  `packages/create-lace` (templates, inventory, `TEMPLATE_VERSION`, tests,
  README), `scripts/generated-project-acceptance.mjs` and its snapshots,
  `scripts/cross-runtime-*.mjs` and `tests/fixtures/cross-runtime/expected.json`.
- APIs: two additive `builtInBlocks` members. No REST, database, export or
  SDK change.
- Depends on CE7A–CE7C (composite contract, evolution and editor) and CE5
  (globals), CE6 (envelope), CE3 (media metadata).
