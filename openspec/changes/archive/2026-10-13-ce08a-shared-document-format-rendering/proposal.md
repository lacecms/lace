## Why

Wave 4 session CE8A establishes the shared document format and rendering contract before CE8B authoring tools produce it. The current validator and renderer support only H1–H3 and href-only links, with no horizontal rules or plain code blocks.

## What Changes

- Extend the single content-owned rich-text grammar with H4, `horizontalRule`, plain `codeBlock`, and optional link `target: "_blank"` and `rel: "nofollow"` attributes. Omission represents an unchecked switch.
- Describe and render these nodes safely, preserving code whitespace and escaping code text. New-tab links automatically render `noopener noreferrer`, independently merged with `nofollow`.
- Validate defaults, nested field values and block data through the same grammar, preserving existing documents and CE7 budgets and save/publication rules.
- Update architecture sections 11 and 13 to describe the expanded format, record the decision, add compatibility guidance and a reference rendering fixture. Section 17 authoring changes belong to CE8B.
- Verify validation/rendering parity, all four link combinations, unsupported attributes and unsafe URLs through content, render and actual Astro rendering tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-validation`: expand the closed rich-text grammar and restricted link attributes.
- `field-descriptors`: explicitly cover expanded rich-text defaults under the same validator.
- `render-core`: extend the element description with H4, rules, plain code and safe link attributes.
- `astro-adapter`: render expanded descriptions, escape code, preserve whitespace and pass validated attributes to overrides.

## Impact

Depends on completed CE7 recursive fields and the existing shared validation and rendering boundaries (architecture sections 6, 8, 11, 13 and 17; roadmap session CE8A). Implementation touches `packages/content/src/index.ts`, `packages/render/src/rich-text.ts`, `packages/astro/src/RichTextNodes.astro`, their tests/type tests, `apps/site` rendering fixtures and `docs/compatibility.md`.

No database migration, automatic document rewrite, new dependency, block schema-version change or per-field feature configuration is required. Existing documents keep their meaning. Once expanded documents are stored, older engines/renderers may reject them; engine and site rendering packages must be upgraded together before authoring expanded documents. Ordinary URL fields remain strings with the existing URL policy.

Non-goals: CE8B toolbar/extensions/bubble menu/paste/product browser checks, CE9 forms, language selection, syntax highlighting, raw HTML, rich-text tables/media, Word/Google Docs cleanup and implementation of the remaining wave sessions. This change is independently verifiable without admin production of the new format.
