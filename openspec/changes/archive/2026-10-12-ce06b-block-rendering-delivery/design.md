## Context

CE6A (archived as `2026-10-12-ce06a-block-envelope-contract`) stores and
delivers the block envelope:

- public blocks are `{key, type, schemaVersion, position, anchor?, className?,
  settings, data}`; hidden blocks are never public, and a missing `settings`
  parses as `{}`. Admin blocks also carry `hidden: boolean`;
- `@lacecms/content` exports `isBlockAnchor`, `normalizeBlockClassName`,
  `validateBlockSettings(definition, value, path)` (draft mode, defaults
  applied, unknown keys rejected) and `BlockSettingsValues<Settings>`;
  `BlockDefinition<Fields, Settings>` has a second type parameter that
  defaults to `ModelFieldDefinitions`, and `defineBlock` infers
  `NoBlockSettings` when none are declared;
- the SDK's `PublishedBlock` is the public block DTO and the loader keeps
  every envelope key (covered by `published-site.test.mjs`).

The render side still predates the envelope:

- `packages/render/src/blocks.ts`: `RenderableBlock` is
  `{key, type, schemaVersion, position, data}`; `prepareBlocks` maps every
  block to `{component, props: {block, context, data, image, mediaUrl}}`;
  `AnyBlockDefinition` is `BlockDefinition<any>`.
- `LaceBlocks.astro` spreads the prepared props into each component.
- The five registry sources in `registry/astro/*` (revisions `cta` 1,
  `hero` 2, `image` 3, `quote` 1, `richText` 1) put `data-lace-block` and
  `data-lace-block-key` on their root, with attributes in alphabetical order.
  The starter, `apps/site` and `tests/fixtures/existing-astro-site` hold
  byte-identical copies, enforced by `tests/block-sources.test.mjs` and the
  `lace.site.json` hashes.
- `packages/cli/src/blocks-map.ts` `renderCustomScaffold` emits a
  `<section data-lace-block=… data-lace-block-key=…>` root.
- Template is `0.25.0`; its upgrade instructions do not yet mention migration
  `0009`.
- `isSafeUrl` accepts `#fragment` URLs, so URL fields and rich-text links can
  already point at an anchor.

## Goals / Non-Goals

**Goals:**

- Block components get the envelope as typed props, so sources write
  `id={anchor}` and merge `className` without reading the raw block.
- The render core is the single, defensive gate: it skips hidden blocks and
  re-checks envelope values that bypassed the SDK's strict parsing.
- Every built-in block keeps byte-identical markup when a block has no
  envelope, so existing CSS and acceptance expectations hold.

**Non-Goals:**

- Anchor uniqueness across several entries rendered on one page (for
  example a global rendered inside a page layout). Anchors are unique per
  entry only; the guide says so.
- Settings on built-in blocks, a settings-driven example block in the
  reference site, or settings in the custom scaffold.
- Any SDK code change; its envelope pass-through already exists and is
  tested.

## Decisions

### D1. Render-core types

```ts
interface RenderableBlock {
  readonly anchor?: string | undefined;
  readonly className?: string | undefined;
  readonly data: unknown;
  readonly hidden?: boolean | undefined;
  readonly key: string;
  readonly position: number;
  readonly schemaVersion: number;
  readonly settings?: unknown;
  readonly type: string;
}

type BlockSettingsOf<Definition> =
  Definition extends BlockDefinition<infer _Fields, infer Settings>
    ? BlockSettingsValues<Settings> : never;

interface BlockProps<Definition> {
  readonly anchor?: string;
  readonly block: RenderableBlock;
  readonly className?: string;
  readonly context: BlockContext;
  readonly data: BlockDataOf<Definition>;
  readonly image: ImageDescriber;
  readonly mediaUrl: MediaUrlBuilder;
  readonly settings: BlockSettingsOf<Definition>;
}
```

`AnyBlockDefinition` becomes `BlockDefinition<any, any>` so definitions with
declared settings fit block maps. All new `RenderableBlock` members are
optional, so the public DTO (no `hidden`), the admin DTO (`hidden: boolean`)
and older structural inputs all satisfy it; the members admit `undefined`
because Valibot types optional DTO keys that way. The existing contract type
test gains the public DTO. With `exactOptionalPropertyTypes`, `anchor` and
`className` are present in props only when set, so `{...props}` never passes
an explicit `undefined`.

*Alternative:* nest the envelope under `props.envelope`. Rejected: the
roadmap names `anchor` and `settings` as block props, and flat props read
naturally in a component (`const { anchor, className } = Astro.props`).

### D2. One parse step per block, hidden first

`prepareBlocks` filters `block.hidden === true` before building the context,
then for each visible block: resolve → `parseBlock` (data, unchanged) →
`parseBlockEnvelope(definition, block, context)` → image describer. The
envelope parse:

- `anchor`: absent stays absent; otherwise `isBlockAnchor` or fail with path
  `["anchor"]`;
- `className`: absent stays absent; otherwise `normalizeBlockClassName`, so
  `"wide  dark"` becomes `"wide dark"`, or fail with path `["className"]`;
- `settings`: `validateBlockSettings(definition, block.settings ?? {},
  ["settings"])`; a `ContentValidationError` maps to
  `LaceRenderError("invalid_block_envelope", issue.message, {cause, context,
  fieldPath: issue.path})`.

`parseBlockEnvelope` is exported next to `parseBlock` so other adapters can
reuse it. Checks run after the version check, so a settings failure on an
outdated block still reports `block_version_mismatch` first.

*Alternative:* two codes, `invalid_block_anchor`/`invalid_block_settings`.
Rejected: the field path already distinguishes them, and one code keeps the
adapter's error handling simple. *Alternative:* trust the input and skip
re-validation. Rejected: `RenderableBlock` is structural and sites may feed it
from their own fetches; the render core already re-validates data and rich
text for the same reason.

### D3. Block source convention

Each built-in root keeps its alphabetical attribute order and gains `id`
last:

- with an own class: `class:list={["cta", className]}` (`hero`, `cta`,
  `rich-text`). Astro drops `undefined` entries, so without a class name the
  output stays `class="cta"`;
- without an own class: `class={className}` (`figure`, `blockquote`); Astro
  omits an `undefined` attribute;
- `id={anchor}`, omitted when `undefined`.

The new revisions are `cta` 2, `hero` 3, `image` 4, `quote` 2, `richText` 2.
`requires` stays `0.1.0-alpha.4` until the release change sets the next
version, as CE3C did for `image` 3 and `hero` 2. The copies in the starter,
`apps/site` and the existing-site fixture are replaced byte for byte and
their lock hashes updated; the CLI's bundled registry follows from its build.

The custom scaffold root becomes
`<section class={className} data-lace-block={block.type} data-lace-block-key={block.key} id={anchor}>`
and destructures `anchor` and `className`. Settings are not scaffolded:
they are presentational and their use is site-specific.

*Alternative:* let `LaceBlocks` add a wrapper with `id`. Rejected by owner
decision 4 (no wrapper element; markup and CSS unchanged).

### D4. Reference fixture and acceptance data

`apps/site/src/fixtures/published-export.json`:

- `home-hero` body gains a second paragraph with a link `#get-started`
  ("See how to start");
- `home-cta` gets `anchor: "get-started"`, `className: "cta--highlight"`;
- `post-image` gets `className: "full-bleed"`;
- other blocks unchanged.

The fixture build test asserts the hero link, the single `id="get-started"`
on `<aside class="cta cta--highlight" …>`, the `full-bleed` figure without
`id`, and no `id` on about/note block roots. The packed starter journey uses
the first two fixture entries, so it asserts the same home markup. Hidden
blocks cannot appear in an export (strict public parsing rejects `hidden`),
so the Node journey covers them end to end: its edit adds `anchor: "intro"`
and `className: "hero--wide"` to the hero and a sixth block, a hidden quote
with text `Hidden acceptance quote`, and asserts the built page has
`id="intro"`, `class="hero hero--wide"` and neither the hidden text nor its
key.

### D5. Template 0.26.0

- `TEMPLATE_VERSION` `0.26.0`; starter block sources and `lace.site.json`
  follow D3.
- `upgrade-instructions.json`: three `database` entries for `0009`
  (description and rollback, Compose sequence, D1 sequence, shaped like the
  `0008` entries; unlike `0008`, rollback restores the backup once envelopes
  exist, because an older engine would deliver hidden blocks, as
  `docs/database-migrations.md` states) and one `configuration` entry "Template 0.26.0: block
  anchors, classes, settings and hidden blocks…" covering the envelope, the
  render props, the migration signature break with a before/after example,
  coordinated upgrade of API/admin/site packages, and `pnpm exec lace add
  block --all` adoption (edited components conflict; scaffolds by hand).
- `templates/docs/lace-astro-site.md`: a block-component section on
  `anchor`/`className`/`settings` with a custom block using a declared
  setting, plus the hidden-block rule; the styling section notes the
  editor-set `id` and class. `lace-operations.md` styling section gets the
  same note. Code blocks follow the `tests/consumer-guides.test.mjs` rules
  (no new "`path`:" fixture markers unless the fixture file exists).

### D6. Documentation

Architecture 13.3 (props, skip, `parseBlockEnvelope`, error code), 13.4
(block list passes the envelope, renders no hidden block), 13.5 (registry
convention), 13.7 (example source), and section 11 if it describes block
props. ADR 0012 gets a "Rendering (CE6B)" note. `docs/site-styling.md` adds
that the anchor `id` and editor classes are editor content, not contract
hooks. `docs/compatibility.md` replaces the "comes with CE6B" sentence with
the delivered render API and template `0.26.0`.

## Risks / Trade-offs

- [A hand-written component ignores `anchor`] → the block renders without an
  `id` and links to it do nothing; the upgrade note and guide explain the
  convention, and the CLI reports unchanged registry components as updatable.
- [Editor class names collide with site CSS or utility frameworks purge
  them] → documented as an escape hatch; sites safelist the classes they
  allow editors to use.
- [Two entries rendered on one page share an anchor] → per-entry uniqueness
  only; documented.
- [Settings re-validation rejects an export written by a newer definition]
  → only with a definition/version mismatch, which `block_version_mismatch`
  already reports first.

## Migration Plan

Site-side only. Sites upgrade `@lacecms/render`/`@lacecms/astro` together with
the API from the same release; `lace add block --all` updates unchanged
components. Rolling back the site packages keeps sites building because the
SDK of the same release still parses the envelope; components that use the
new props would need the matching render package.
