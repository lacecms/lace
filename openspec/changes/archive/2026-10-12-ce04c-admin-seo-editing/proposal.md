## Why

CE4A stores a per-entry SEO group and CE4B renders it on the site, but editors
still cannot see or change it: the admin only sends the loaded `seo` value back
unchanged, and nothing tells an editor which values a page inherits from its
own fields or from the site defaults global. This change implements session
**CE4C — Admin SEO editing** of step CE4 in
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md),
which completes CE4.

## What Changes

- **SEO card in the entry editor.** For pages and collections with SEO enabled
  (`model.seo` present), the editor's right-hand column gains an *SEO* card
  after *Fields* with: an SEO title input, an SEO description text area, an SEO
  image chosen through the existing media picker, a canonical URL input and a
  "Hide from search engines" (`noindex`) switch. The values are part of the
  draft form: they mark it unsaved, are saved with Save or Save and publish,
  reset with discard, revert, conflict reload and publish, and are included in
  the "Copy my JSON" draft.
- **Counters and soft warnings.** Title and description show a live character
  count against the recommended length (60 and 160). Above it, a warning says
  search results may shorten the text; it never blocks saving. The hard API
  limits (200 and 500 code points, single line, absolute `http`/`https`
  canonical without credentials or fragment) are validated locally with
  sentences, and server issues under `/seo/*` map to the SEO controls and the
  validation summary.
- **Inherited values as placeholders.** An empty input shows what the site
  will use instead, following the ADR 0011 chain: "Uses entry title", "Uses
  {mapped field label}: …" or "Uses site description: …", "Uses this page's
  URL: …"; an empty image says which image is inherited (mapped field or site
  default) or that there is none. Placeholders are part of the accessible
  description. Site defaults come from the published entry of the global that
  declares `seoDefaults`.
- **Search-result preview.** The card shows a static preview of the resolved
  title (with the site's title template), URL and description, computed from
  the current form values and published site defaults, and says when the entry
  is hidden from search engines.
- **Site defaults global.** In the editor of the global that declares
  `seoDefaults`, each mapped field states which site default it provides (site
  name, title template, default description, default image), for writers and
  viewers.
- **Shared title formatting.** The title template rule and SEO text
  normalization move from `@lacecms/sdk` into `@lacecms/contracts` (re-exported
  unchanged by the SDK), together with re-exports of `isCanonicalUrl` and
  `normalizeSeoText`, so the admin preview and the site resolve titles the same
  way.
- **Browser tests.** A mocked keyboard-only Playwright spec edits SEO values,
  checks counters, warnings, placeholders, the preview and the exact save
  request; the accessibility spec audits an SEO-enabled editor and the
  defaults global.
- **Documentation.** Architecture section 17 (SEO card), ADR 0011 (admin
  editing), the roadmap (CE4 done).

Not in this change: SEO for globals, a social-card (Open Graph) preview,
editing site defaults outside the global editor, real-stack admin acceptance
for SEO, template or API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: the SEO card (inputs, counters, soft warnings, local
  and server validation, inherited placeholders, search preview, save
  payload) replaces "Saving preserves stored SEO values until the editor
  edits them", and the defaults global annotates its mapped fields.

## Impact

- Code: `apps/admin` (`entities/content` form values, validation, issue
  mapping, validation summary and a pure SEO preview helper; `pages/entry`
  editor and a new SEO card; `widgets/media-library/MediaPicker` label prop;
  `FieldRenderer` annotation), `packages/contracts` (shared `seoText`,
  `formatSeoTitle` and re-exports), `packages/sdk/src/seo.ts` (imports them).
- Tests: admin unit tests, new `apps/admin/e2e/seo.e2e.ts`, the accessibility
  e2e, contracts and SDK unit tests.
- APIs, database, templates, starter: unchanged. Public SDK exports unchanged.
- Docs: `docs/mvp-architecture.md` section 17, `docs/adr/0011-seo-system-group.md`,
  `docs/content-editor-roadmap.md`. Depends on CE4A and CE4B (merged on this
  branch).
