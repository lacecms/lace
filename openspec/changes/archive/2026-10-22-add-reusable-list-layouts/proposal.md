## Why

Editors need to choose list composition without knowing CSS, while site developers
need to retain control of markup and styling. Gallery currently has one site-defined
grid and no layout settings; this change makes layout a reusable capability of
ordinary block settings, with schematic thumbnails rather than image previews.

## What Changes

- Select **LIST1 — reusable list layouts**, one implementation session unit,
  independent of the active video-upload change. Deliver descriptors, admin
  controls, gallery adoption, CSS installation and verification together: a
  setting without an installed site implementation would promise behavior the
  product cannot deliver.
- Add portable, optional choice-card presentation to select descriptors: labels,
  descriptions and bounded rectangle diagrams. Preserve ordinary selects and
  the common field renderer; no block-type dispatch or custom block editor.
- Export a reusable scalar settings factory with `layoutMode`, `layoutWrap` and
  `layoutPreset`. Support horizontal/vertical flex, wrap on/off, and seven grids:
  auto, two/three/four columns, narrow-wide, wide-narrow and featured-first.
- Show schematic thumbnails for mode and grid choices. Keep all fields visible
  with applicability guidance; inactive mode-specific values are retained and
  validated normally. Do not introduce partial conditional forms.
- **BREAKING:** advance Gallery definition 3 to 4 with a migration preserving
  content and lightbox settings and adding layout defaults. Coordinate site
  definition/component upgrades through the existing version checks.
- Install a reusable, neutral layout stylesheet beside the user-owned Gallery
  component. Extend registry items to allow stylesheet companions and apply
  existing per-item hash/conflict protection to the complete file set.
- Keep theme, image proportions/cropping and decorative styles in site CSS.
  Expose stable layout attributes and CSS variables, low-specificity layered
  rules, responsive grids and CSS-only overrides.

Non-goals: actual-photo previews, exact site previews, drag-to-compose layouts,
arbitrary editor-authored CSS, masonry, carousels, reverse/dense reordering,
per-item layout fields, new list data structures, and conditional forms. Other
built-in lists are not automatically opted in.

## Capabilities

### New Capabilities

- `list-layout`: reusable settings, seven preset semantics, flex behavior,
  responsive structural CSS and the site override contract.

### Modified Capabilities

- `field-descriptors`: portable select choice-card metadata and safe diagrams.
- `content-model-configuration`: descriptor-aware projection identity for the
  new presentation metadata, without content rewrites.
- `admin-draft-editor`: accessible generic choice cards with schematic thumbnails
  and ordinary save, validation, conflict and read-only behavior.
- `block-registry`: Gallery version 4 adopts the shared settings and migrations.
- `block-source-registry`: Gallery layout attributes, CSS companions and updated
  image-source revision compatibility.
- `block-installation-cli`: install and guard component plus stylesheet as one item.
- `astro-reference-site`: updated Gallery fixture version and acceptance of
  shared structural styles with site-owned image/theme rules.

## Impact

Governing architecture: `docs/mvp-architecture.md` sections 4.3, 6, 8 (field
metadata, settings, projection and synchronization), 11, 13.5 and 17. These
preserve code-first structure, serializable metadata, scalar settings,
user-owned visual sources and generic forms. Accepted capability sources are
the seven existing specs named above under `openspec/specs/`.

Likely packages: `content`, `config`, `application` (schema diff classification),
`contracts`/OpenAPI, admin entities/shared controls, CLI registry validation and
installation, registry Gallery sources, starter/reference/existing-site fixtures,
and public/internal documentation. No database schema change, API endpoint,
new runtime service, or infrastructure adapter is required. Node and Cloudflare
use identical descriptors, validation and migration behavior.

Dependencies are the accepted block envelope, field layout, schema evolution,
registry installer and image-delivery capabilities. The video change is neither
a prerequisite nor a target. Implementing LIST1 must preserve its unrelated work.
