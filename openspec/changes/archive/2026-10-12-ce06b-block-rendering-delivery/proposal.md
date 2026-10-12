## Why

CE6A stores a block envelope (`anchor`, `className`, `hidden`, `settings`) and
delivers it in public blocks, but no site uses it yet. The render core ignores
it, block components never place an anchor or a class, and a hidden block
reaching the render core through a non-SDK path would still render. Editors
cannot link to a block section, and the declared settings never reach a
component. Step CE6 of
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
closes that gap in session **CE6B — Rendering and site delivery**, per owner
decisions 2, 4, 5 and 6 and [ADR 0012](../../../docs/adr/0012-block-envelope.md).

## What Changes

- **Render core (`@lacecms/render`):**
  - `RenderableBlock` gains optional `anchor`, `className`, `hidden` and
    `settings`, so both the public and the admin block DTOs still satisfy it
    without mapping.
  - `prepareBlocks` skips hidden blocks before resolving them, so a hidden
    block of an unknown type or an old version never fails a build.
  - `BlockProps<Definition>` gains `anchor?`, `className?` (normalized) and
    typed `settings` (`BlockSettingsOf<Definition>`, every declared key
    present). Settings are validated against the definition with defaults
    applied.
  - A new error code `invalid_block_envelope` reports an invalid anchor,
    class name or settings value with the model, entry, block key and field
    path.
- **Astro adapter (`@lacecms/astro`):** `LaceBlocks` passes the new props
  unchanged and still adds no wrapper. No code change beyond tests and
  documentation; the SDK already delivers the envelope as `PublishedBlock`.
- **Registry block revisions:** all five built-in Astro blocks get a new
  revision (`cta` 2, `hero` 3, `image` 4, `quote` 2, `richText` 2) whose root
  element carries `id={anchor}` and merges `className` into its `class`.
  Without an envelope the markup is byte-for-byte unchanged. The starter, the
  reference site and the existing-site fixture get the same bytes and lock
  hashes.
- **Custom block scaffold:** `lace add block` scaffolds new custom block
  components with the same anchor and class convention.
- **Reference site:** the fixture export gives blocks anchors and classes,
  including an in-page `#get-started` link to an anchored block, and the
  fixture build asserts the rendered `id`, `class` and link.
- **Starter template `0.26.0`:**
  - the five block sources and `lace.site.json` at the new revisions;
  - upgrade instructions with the `0009_content_block_envelope` database
    steps (Compose and D1), the breaking migration signature for
    user-written block migrations, and adoption of the block revisions with
    `lace add block --all` (site files stay user-owned);
  - the managed Astro site and operations guides document anchors, classes,
    settings and the hidden-block rule.
- **Generated-project acceptance:** the packed starter build asserts the
  anchor `id`, the merged class and a working in-page anchor link; the Node
  journey saves a hidden block and an anchored block through the admin API
  and asserts the hidden block's text is absent from the built page.
- **Documentation:** architecture sections 11 and 13.3–13.5 and 13.7, an
  ADR 0012 rendering note, `docs/site-styling.md`, `docs/compatibility.md`
  and the roadmap.
- **BREAKING (site sources, alpha):** block components written by hand do not
  place anchors or classes until updated; they keep rendering. The
  `BlockProps` additions are additive for TypeScript.

Not in this change:

- the admin *Content*/*Settings* tabs, the *Hidden* badge and anchor editing
  (CE6C);
- settings on built-in blocks;
- a wrapper element around blocks, or page-wide anchor uniqueness across
  several entries rendered on one page;
- REST, database or export changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `render-core`: hidden-block skip, envelope block props, typed settings and
  the `invalid_block_envelope` error.
- `astro-adapter`: the block list passes anchor, class name and settings and
  renders no hidden block.
- `block-source-registry`: built-in block sources place the anchor and the
  class on their root element.
- `block-installation-cli`: custom block scaffolds place the anchor and the
  class on their root element.
- `astro-reference-site`: anchored and classed blocks and an in-page anchor
  link in the fixture build.
- `project-generator`: template `0.26.0` with the block revisions, the `0009`
  upgrade steps and envelope documentation.
- `generated-project-acceptance`: starter and Node journeys verify anchors,
  classes and hidden blocks.

## Impact

- Code: `packages/render` (blocks, errors, tests, type tests),
  `packages/astro` (tests), `packages/cli` (scaffold, bundled registry,
  tests), `registry/astro/*`, `apps/site` (components, lock, fixture, test),
  `tests/fixtures/existing-astro-site`, `packages/create-lace/templates`
  (site components, lock, docs, upgrade instructions) and
  `TEMPLATE_VERSION`, `scripts/generated-project-acceptance.mjs` and its
  snapshots.
- APIs: additive `@lacecms/render` types and one error code. No REST,
  database or export change.
- Architecture sections 11, 13.3, 13.4, 13.5 and 13.7.
- Depends on CE6A (envelope storage and public delivery). CE6C builds the
  admin controls on the same contract.
