## Why

Portfolio and landing pages often use an image as a link: a project
thumbnail opens its case study, a partner logo opens the partner's site. The
built-in `image` and `gallery` blocks can only show an image or open it full
screen, so editors fall back to a separate call-to-action block or custom
blocks.

## Roadmap unit

**Step D of the image-delivery plan** recorded in `backlog.md` (A–C archived
2026-10-18). Selected by the owner on 2026-10-18 as an addition after C: an
optional link on `image` blocks and on each `gallery` item. It is one session
unit, verifiable through content tests, registry component tests, the
reference fixture build and generated-project fixtures, and does not depend on
the video plan.

Owner decisions taken while planning (2026-10-18):

- The `gallery` link lives on **each item**, next to its alt text and caption.
- **The link wins over the lightbox:** a linked image renders as a link and
  gets no lightbox; images without a link keep the lightbox when it is on.
  The field description tells editors so.
- **No "open in a new tab" option:** links open in the same tab, like the
  links of `cta`, `hero` and `navigation`.

## What Changes

- **Block definitions.** `image` moves to version 4 with an optional URL
  field `link`; `gallery` moves to version 3 with an optional URL field `link`
  in each `images` item. Both use identity migrations, keep the `lightbox`
  setting and follow the existing safe URL rules (relative paths, fragments,
  `http(s)`, `mailto:`, `tel:`).
- **Registry revisions.** `image` revision 6 and `gallery` revision 3 wrap a
  linked image in `<a href data-lace-part="link">` and render no lightbox for
  it; the anchor is named by the effective alt text, then the caption, then
  the URL. Components still carry no `<style>` or `<script>`. The adapter's
  `LaceImage` is unchanged.
- **Admin.** No admin code change: the URL field and its description render
  through the existing field editors, including inside gallery items.
- **Reference site and fixtures.** The fixture export gains a linked `image`
  and a linked gallery item; the reference stylesheet gains the link focus
  ring. Root `lace.config.ts` models that allow the blocks move up one version.
- **Template 0.34.0.** Starter `lace.config.ts` bumps `home` and `posts` to
  version 4; the starter site gets the new components, lock and stylesheet
  rule; the site guide and upgrade instructions describe adoption.

No database migration and no API change. **Breaking for sites**, as in step
B: content synchronized with the new definitions requires the new registry
components (the old ones reject `image` version 4 and `gallery` version 3
with `block_version_mismatch`).

## Non-goals

- A link on the `hero` image, link titles, `target`/`rel` options or
  per-link tracking attributes.
- Entry references (`entry:<id>`) as link targets; that is CE10.
- Cross-field validation forbidding a link together with the lightbox.
- Linking the lightbox's full-screen image.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `block-registry`: `image` version 4 and `gallery` version 3 with the
  optional `link` field.
- `block-source-registry`: linked images render as anchors that take
  precedence over the lightbox.
- `astro-reference-site`: the fixture covers linked images.
- `project-generator`: template 0.34.0.

## Impact

- Architecture: `docs/mvp-architecture.md` built-in block list and §13.5
  registry components; `docs/site-styling.md` (`link` part).
- Code: `packages/content` (built-in `image` v4, `gallery` v3),
  `registry/astro/{image,gallery}`, `apps/site`,
  `tests/fixtures/existing-astro-site`, root `lace.config.ts`,
  `packages/create-lace/templates` (config, site, docs, upgrade
  instructions, inventory version).
- Tests and fixtures whose pinned model versions, hashes, block versions or
  markup change: content unit and type tests, config projection fixture,
  API project-config/content-sync/node-server tests, Worker tests, CLI
  registry/block/upgrade tests, adapter registry-block tests, reference
  fixture build, generated-project snapshots, cross-runtime expectations.
- `backlog.md`: D recorded and marked done on archive.
- Dependencies: none.
