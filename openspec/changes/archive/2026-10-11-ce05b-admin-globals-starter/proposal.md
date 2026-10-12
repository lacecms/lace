## Why

CE5A made `global` a stored, publishable, delivered model kind, but nobody can
edit one: the admin filters globals out of navigation and treats them as
collections on the model route, and neither the starter nor the reference site
reads one. This change implements session **CE5B — Admin and starter** of step
CE5 in [`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md),
which completes CE5 and unblocks CE4 (site-level SEO defaults live in a global).

## What Changes

- **Admin *Site* group.** The sidebar gains a *Site* group, between
  Collections and Library, that lists every configured global by label and
  links straight to its singleton editor (or to the content overview's *Site*
  section while the entry is not yet synchronized). The breadcrumb of a global
  editor reads *Content › label*, like a page. The introductory tour gains a
  *Site* step when the group exists.
- **Content overview and model route.** The overview gains a *Site* section of
  global cards (label, status, last edit and editor; no path) and its intro and
  empty-state copy name globals. `/content/<globalKey>` shows the singleton
  placeholder that pages use instead of a collection list.
- **Global editor.** No path, slug, title input, public-URL row or "Open on
  site" link; the heading names the global. The publish confirmation says the
  change affects every page that shows the content after the next site build,
  and the publish and unpublish dialogs call it site content rather than an
  entry. Delete and duplicate stay unavailable (already true since CE5A).
- **Starter and reference site.** Both configurations gain
  `defineGlobal({ key: "settings", label: "Site settings", fields: { siteName,
  tagline } })`. The base layout receives the published site and renders a
  site header from `site.global("settings")`, falling back to static values
  when the global is unpublished or a field is empty. Navigation stays static
  until CE7. The reference export fixture gains a published `settings` global.
- **Template `0.24.0`.** `TEMPLATE_VERSION` advances; upgrade instructions add
  migration `0007_content_model_global_kind` (Compose and Cloudflare steps,
  backup required, rollback by restore once a global exists) and explain the
  global kind and how to adopt the optional starter `settings` global and
  layout by hand (both files are user-owned). The managed Astro site guide
  documents `site.global()`. Generated-project snapshots are regenerated.
- **Acceptance.** Browser tests open, edit, publish and revert a global with
  the keyboard; the reference site and the packed starter build with and
  without a published global.
- **Documentation.** Architecture section 17 (Site group, global editor),
  `docs/compatibility.md` (template `0.24.0`, optional starter global), the
  roadmap (CE5 done).

No API, database or SDK change: CE5A delivered them.

Not in this change: a navigation or footer global (CE7), `seoDefaults` (CE4A),
real-stack admin acceptance or cross-runtime browser journeys for globals,
creating globals from the admin.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-application-shell`: the *Site* navigation group, global navigation
  links and global breadcrumbs.
- `admin-remote-state-and-lists`: the content overview's *Site* section and
  the singleton model route for globals.
- `admin-draft-editor`: the global editor without title, slug or public URL,
  and the global publication wording.
- `admin-introductory-tour`: a *Site* step when the group exists.
- `astro-reference-site`: the `settings` global, the site header and its
  fallback.
- `project-generator`: template `0.24.0`, the starter `settings` global and
  layout, and its upgrade instructions.
- `generated-project-acceptance`: the packed starter builds with and without a
  published global.

## Impact

- Code: `apps/admin` (navigation, sidebar, tour, content overview, model page,
  entry editor, publication details, publish/unpublish/revert dialogs),
  `apps/site` (layout, pages, fixture, build test), root `lace.config.ts`,
  `apps/api/src/project-config.test.mjs`, `packages/create-lace` (templates,
  inventory version, tests), `packages/cli` upgrade tests,
  `scripts/generated-project-acceptance.mjs`,
  `tests/fixtures/generated-project/*.json`.
- Tests: admin unit and Playwright e2e, reference-site fixture and live build,
  create-lace and CLI upgrade tests, generated-project snapshots and
  `acceptance:starter`.
- APIs, database, SDK: unchanged. Root configuration gains a global, so local
  development and cross-runtime fixtures synchronize one more singleton.
- Architecture sections 17 and 8 (starter example), `docs/compatibility.md`,
  roadmap. Depends on CE5A.
