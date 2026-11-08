## Why

`openspec/specs` holds 84 capabilities without an index or ownership rules.
Gallery behavior is spread over `block-registry` and `block-source-registry`,
`admin-draft-editor` is 2,154 lines covering five editor surfaces, and RF8A
found spec text that disagrees with code (`image` revision 6 and `hero`
revision 4 against 7 and 5; a seven-block starter against nine) and spec text
that still names roadmap codes (`CE10`, `CE7`, `33F`, `Step 26`, `Session
11A`). A reader cannot tell where a rule lives or whether it is current.

This is roadmap Step RF8, session **RF8B — OpenSpec specifications**
([refactoring roadmap](../../../docs/refactoring-roadmap.md)), after RF8X and
RF8Y removed pre-rc1 behavior and release history.

## What Changes

- New `openspec/specs/README.md` groups every capability by domain, with one
  ownership rule per group (for example: descriptor shape →
  `field-descriptors`; value validation → `content-validation`; lifecycle →
  `content-domain-rules`; visibility → `conditional-fields`).
- New capability `gallery-block` owns the gallery definition (moved out of
  the `block-registry` starter-block requirement), its mode-specific setting
  visibility (moved from `block-registry`), its component markup (moved out
  of the `block-source-registry` canonical-source requirement) and its video
  playback (moved from `block-source-registry`). The two source requirements
  are re-added under new titles without the gallery parts.
- `admin-draft-editor` keeps a thin core (layout, read-only viewers,
  validation summary, global editor and site defaults, unsaved drafts and
  saving); 50 requirements move unchanged to `admin-draft-editor-fields`,
  `admin-draft-editor-media-lists`, `admin-draft-editor-blocks` and
  `admin-draft-editor-publication`.
- Spec/code disagreements are fixed: `block-source-registry` gives `image`
  revision 7 and `hero` revision 5, the starter lock and block map list every
  built-in, and `block-installation-cli` installs nine components with their
  companions. The `rest-contracts` contradiction about a first export page
  without `globals`/`seo` was already removed by RF8X (both variants now
  reject it); no change.
- Roadmap codes leave requirement text in 13 capabilities; where a code was in
  a title or scenario name, the requirement is re-added under a neutral title.
- Two pre-rc1 upgrade scenarios ("Updating a gallery component" from
  revision 6, "Updating an older embed component" from revision 1) are not
  carried over (owner decision 11).
- Architecture pointers in `docs/architecture/` that name `admin-draft-editor`
  or the gallery requirements point at the new owners.

No product behavior changes.

## Capabilities

### New Capabilities

- `gallery-block`: the built-in Gallery block definition, settings
  visibility, registry component markup and video item playback.
- `admin-draft-editor-fields`: field rendering, rich text, SEO, composite,
  URL and conditional controls, guidance and layouts in the draft editor.
- `admin-draft-editor-media-lists`: media fields and list-item authoring in
  the draft editor.
- `admin-draft-editor-blocks`: block aggregate, block cards, Settings tab,
  hidden blocks and palette in the draft editor.
- `admin-draft-editor-publication`: publication, concurrency, conflict
  recovery and lifecycle actions in the draft editor.

### Modified Capabilities

- `admin-draft-editor`: 50 requirements move to the four sub-surface
  capabilities.
- `block-registry`: starter-block requirement re-added without the gallery
  definition; gallery visibility requirement moved.
- `block-source-registry`: canonical-source requirement re-added without the
  gallery markup and roadmap codes; gallery video requirement moved; image
  component revisions, starter lock and block map corrected.
- `block-installation-cli`: installation requirement re-added with the nine
  current components and no roadmap code.
- `admin-application-shell`: route requirement re-added without session codes.
- `prepublication-consumer-security`, `content-validation`,
  `conditional-fields`, `field-descriptors`, `admin-introductory-tour`,
  `local-product-acceptance`, `rest-contracts`,
  `content-model-configuration`, `upgrade-planner`,
  `generated-project-onboarding`, `workspace-governance`: roadmap codes
  removed from requirement text.

## Impact

- `openspec/specs/**`: 89 capabilities after archive (84 + 5 new); one new
  README.
- `docs/architecture/content-configuration.md` and `admin.md` pointers;
  `docs/refactoring-roadmap.md` log and inventory row.
- No code, test or public documentation change; the change archive stays
  complete (owner decision 4).
