## Context

See proposal.md for motivation. State after CE5A that shapes this session:

- **Admin.** `ContentModelDto.kind` already includes `"global"` (no `path` or
  `route`), entry DTOs carry `model.kind`, and `entryActions` already limits
  delete and duplicate to collections. Everything else branches on
  `kind === "page"` or `"collection"` and drops or mis-handles a global:
  - `widgets/admin-shell/navigation.ts` builds Pages and Collections with
    `filter`; globals vanish. `breadcrumbsFor` gives only pages the short
    crumb, so a global falls through to the collection crumb.
  - `SidebarNav.tsx` dispatches on `NavigationItem.kind`; `PageLink` finds the
    singleton with `useEntryOverview(modelKey)` and falls back to
    `/content#pages`.
  - `tour.ts` emits a step per group key `pages | collections`.
  - `ContentPage.tsx` renders Pages and Collections sections only.
  - `ModelPage.tsx` renders `PagePlaceholder` for pages and `CollectionEntries`
    for everything else, so a global shows a collection list.
  - `EntryPage.tsx` always renders the title input; `EntryPublicationDetails`
    renders a "Public URL" fact that reads "No public URL yet" when
    `resolvedPublicPath` is `undefined` (it is for a global).
  - `PublishEntryDialog` has no kind; `UnpublishEntryDialog` already has the
    global consequence text but titles it "Unpublish this entry?".
- **Server.** `ContentUseCases.save` replaces a global's submitted title with
  the model label, and payload validation rejects a slug on a global.
- **Sites.** The starter (`packages/create-lace/templates/site`) and the
  reference site (`apps/site`) share the same `BaseLayout` shape: props
  `entry` and `title`, no header. Pages already hold `site` from `getSite()`.
  A static build caches the export (`createPublishedSiteLoader` without
  `revalidate`), dev mode revalidates on every `getSite()` call.
  `site.global(key)` returns `PublishedGlobal | undefined` with untyped
  `fields`.
- **Template.** `TEMPLATE_VERSION = "0.23.0"`; `lace.config.ts` and every
  `site/**` file are user-owned, so upgrades never change them; the managed
  `.lace/upgrade-instructions.json` lists `database` and `configuration`
  guidance newest first, and CE5A deliberately left migration `0007` out of it.
- **Fixtures.** `apps/site/src/fixtures/published-export.json` has no
  `globals` key and is also read by `scripts/generated-project-acceptance.mjs`
  (starter journey), `tests/existing-astro-site.test.mjs` and
  `tests/regression-helpers.test.mjs`. The root `lace.config.ts` drives the
  dev stack, the reference site, `apps/api/src/project-config.test.mjs` and
  the cross-runtime fixture.

## Goals / Non-Goals

**Goals:**

- One kind-aware notion of "singleton" in the admin so pages and globals share
  navigation, breadcrumb, overview and model-route behavior, with explicit
  branches only where they differ (path, title, wording).
- A starter and reference layout that render published settings without an
  extra export read and without failing when the global was never published.
- Upgrade guidance that is honest about migration `0007` and about the fact
  that adopting the starter global is manual.

**Non-Goals:**

- New API, SDK, database or contract behavior.
- A typed settings accessor in the SDK (fields stay untyped JSON; the layout
  narrows them).
- Real-stack admin acceptance or cross-runtime browser journeys for globals;
  mocked Playwright e2e covers the admin flow.
- Head metadata from settings (`<title>` suffixes, descriptions): CE4 owns
  `<head>`.

## Decisions

### D1. A `site` navigation group and a shared singleton link

`NavigationGroup.key` gains `"site"` (label "Site", order Pages, Collections,
Site, Library, Admin), and `NavigationItem` gains `kind: "global"` with the
lucide `Globe` icon. `SidebarNav` renders page and global items with one
`SingletonLink` component (the former `PageLink`, parameterized by the
overview anchor: `#pages` or `#site`). `breadcrumbsFor` uses the short crumb
for any singleton kind. A small `isSingletonModel(model)` helper in
`entities/content` replaces the inline `kind === "page"` checks that mean
"singleton" (breadcrumbs, model page, sidebar); checks that mean "has a fixed
path" stay page-only.

*Alternative:* list globals inside the Pages group. Rejected: the roadmap asks
for a Site group, and mixing them would suggest globals have URLs.

### D2. Overview `GlobalCard` and singleton model route

`ContentPage` adds a `Site` section (`id="site"`) after Collections with a
`GlobalCard` built from the same overview hook as `PageCard` (status, relative
edit time, editor name; missing singleton shows the sync guidance), without
path. `ModelPage` renders the existing placeholder for any singleton model,
with wording that does not say "page" for a global.

### D3. Global editor: hide title, path and URL; keep the save payload stable

For `model.kind === "global"` the editor does not render the title input; the
form still holds the loaded title and sends it unchanged in the complete-draft
save (the server overwrites it with the label anyway, so dirty-tracking stays
correct and no new payload shape is needed). The heading stays `Edit
{label}` and the model description is shown under it when configured.
`EntryPublicationDetails` omits the Public URL fact (and therefore the "Open
on site" link) when the model is a global, instead of showing "No public URL
yet". `hasEntryFields` keeps its rule (`fields > 0` for non-collections).

*Alternative:* show the title read-only. Rejected: the title is never public
and equals the heading, so it is noise.

### D4. Dialog wording through a `kind` prop

`PublishEntryDialog` gains an optional `kind` prop. For a global the titles
are "Publish this site content?" / "Save and publish this site content?" and
the description appends "It affects every page that shows it after the next
site build." instead of the `at <path>` target. `UnpublishEntryDialog` titles
a global "Unpublish this site content?" (its consequence text exists).
Revert stays unchanged (its text is kind-neutral).

### D5. Layout receives `site`; settings are narrowed in the layout

Both `BaseLayout.astro` files gain a `site: PublishedSite` prop; every page
passes the `site` it already loaded. The layout reads
`site.global("settings")`, narrows `siteName` and `tagline` with a
`typeof value === "string" && value.trim() !== ""` check, and falls back to
constants in the layout (starter: site name "Lace starter", no tagline;
reference: "Lace reference site", no tagline). It renders
`<header class="site-header">` with the name as a link to
`import.meta.env.BASE_URL` and an optional tagline paragraph, before `<main>`,
plus a few lines of CSS in the site stylesheet. Navigation remains absent
(static navigation can be added by owners; CE7 brings a navigation global).

*Alternative:* call `getSite()` inside the layout. Rejected: it hides a data
dependency, and in dev mode causes a second conditional export request per
render. *Alternative:* a separate `site/src/lib/settings.ts` helper. Rejected:
one more user-owned template file and inventory entry for six lines.

The reference fixture gains `"globals": [{ id, modelKey: "settings", fields:
{ siteName: "Lace Journal", tagline: "Notes from the reference site" },
blocks: [], publishedAt }]`. The live-build test serves a copy without
`globals` to prove the fallback. The starter journey serves the fixture with
`globals` replaced by an acceptance-specific settings global, then again with
`globals` removed, and asserts the header both times and one export read per
build.

### D6. Template `0.24.0` and upgrade instructions

`TEMPLATE_VERSION` becomes `0.24.0`. The generated `lace.config.ts` (every
site mode) gains the `settings` global; starter layout and pages change as in
D5; `docs/lace-astro-site.md` (managed) gains a "Site-wide content (globals)"
section. `upgrade-instructions.json` prepends three `database` entries
(0007 meaning and rollback-by-restore, Compose steps, Cloudflare steps,
following the 0005/0006 wording) and one `configuration` entry starting
"Template 0.24.0:" that explains the global kind, the Site group, the public
endpoint and `globals` export key, deploying API, admin and site packages
together, and how to adopt the starter global by hand (add the
`defineGlobal`, run sync, publish it in Admin, pass `site` to the layout).
Tests that pin the version and instruction order (`create-lace`
`index.test.mjs`, CLI `upgrade-command.test.mjs`) and the six
generated-project snapshots are updated.

### D7. Root configuration gains the same global

The root `lace.config.ts` adds the `settings` global so the dev stack and the
reference site match the starter. `apps/api/src/project-config.test.mjs` adds
it to the expected list. The cross-runtime fixture synchronizes all models
from the root configuration; a global singleton is created by sync and needs
no journey change, which is checked by running the fixture's sync path in the
narrow tests.

## Risks / Trade-offs

- [Existing projects never receive the starter global or layout automatically]
  → The upgrade instruction gives the exact snippet and steps; nothing breaks
  when a project does not adopt it.
- [Adding a global to the root configuration changes tests that enumerate
  models or navigation groups] → Run the API config test, admin acceptance
  selectors and cross-runtime fixture sync; update expectations rather than
  special-casing.
- [Hiding the title input relies on the server ignoring the submitted title]
  → CE5A's use-case test covers the label override; the admin sends the
  loaded title unchanged, so even an older server stores a correct value.
- [Shared fixture gains `globals`] → Consumers parse it through the export
  schema (globals optional) or read `entries` only; the existing-site and
  regression tests are run to confirm.

## Migration Plan

No database or API change in this session. Projects upgrading to template
`0.24.0` run migration `0007` (delivered by CE5A) as the upgrade instructions
describe, then optionally adopt the starter global. Rollback of the template
is a normal upgrade-file revert; rollback of the engine after a global exists
needs the pre-migration backup, as recorded in CE5A.
