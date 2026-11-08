# Admin application

Part of the [Lace architecture](README.md).

## 17. Admin application

The admin is a client-rendered React and Vite single-page application with no
SSR requirement ([ADR 0023](../adr/0023-admin-spa-stack.md)). Its client stack
is listed in [§19](workspace.md#19-dependency-policy); forms validate through
`@hookform/resolvers/valibot`, and dnd-kit gives accessible block ordering.

TanStack Query owns remote state, TanStack Router owns route and
search-parameter state, and React component state owns transient UI state. No
separate global state library is added until a concrete need appears. Every
authorization-dependent affordance comes from the server-computed session
permissions ([§14](security.md)); the API remains the authorization boundary.

### Routes and navigation

The primary routes are `/login`; the public `/accept-invite`,
`/forgot-password` and `/reset-password`; `/account` for any signed-in user;
`/content`, `/content/:modelKey` and `/content/:modelKey/:entryId`; `/media`;
`/builds`; `/users` (`users:manage`); and `/settings` (`settings:manage`)
([admin-application-shell](../../openspec/specs/admin-application-shell/spec.md)).

- The content-model response drives navigation and field forms. Pages and
  globals open their singleton editor directly; collections open a paginated
  entry list; the model route of a page or global only points back to the
  content overview.
- Shell surfaces never show internal entry or user IDs; the users list and
  the editor's publication card show no raw IDs, and that card shows no ISO
  timestamps.
- Collection-list search, status, sort and field filters live in the route's
  URL search parameters. The opaque cursor never enters the URL, any
  effective query change resets paging, and a rejected continuation offers a
  restart instead of retrying the stale cursor
  ([admin-remote-state-and-lists](../../openspec/specs/admin-remote-state-and-lists/spec.md),
  [collection-query-options](../../openspec/specs/collection-query-options/spec.md)).
- Any unmatched admin path is a protected catch-all rendered inside the shell,
  so anonymous visitors sign in first.

### Accounts, users and settings

- Accept and reset screens read the token from the URL fragment, remove it
  from the address bar and keep it only in component state, never in the query
  string, router state, query cache or browser storage
  ([admin-account-screens](../../openspec/specs/admin-account-screens/spec.md)).
- No admin screen collects another person's password. A link or token shown
  once (an undelivered invitation or reset, a new build or import token) lives
  only in its dialog's state
  ([admin-users-and-settings](../../openspec/specs/admin-users-and-settings/spec.md)).
- Settings shows administrators a read-only MCP section in both states, read
  from the authenticated settings status; "enabled" describes configuration,
  not verified connectivity. Deployment configuration stays operator-owned:
  there is no browser toggle and no public status endpoint.
- With MCP enabled, `/admin/mcp/consent` reuses the session and sign-in, and
  only administrators can grant publication; `/admin/account` lists owned
  connections through session-only routes, hidden by a server-derived
  capability when MCP is disabled. OAuth credentials never enter browser
  storage ([mcp-oauth-delegation](../../openspec/specs/mcp-oauth-delegation/spec.md)).

### Media

The library keeps its search, filters, sort and view in the URL; the media
picker reuses its grid with a local query that resets on each opening and
offers only active items. Thumbnails load lazily through the authenticated
admin preview endpoint. Uploads are checked for type and size in the browser
and go through `XMLHttpRequest` to report bytes sent; every other request uses
`fetch`, and both share error mapping and response validation. A media field
resolves its stored ID through the media detail read, never by searching
loaded pages, and keeps the ID in the draft until the writer replaces or
removes it ([admin-media-library](../../openspec/specs/admin-media-library/spec.md)).

### Entry editor

The editor makes draft, published and build status visible and surfaces
optimistic-concurrency conflicts rather than overwriting a newer draft
([admin-draft-editor](../../openspec/specs/admin-draft-editor/spec.md)).

- "Save and publish" validates, saves and publishes the saved revision with
  one idempotency key; a failed validation or save publishes nothing.
  Lifecycle actions are offered only as permissions and entry state allow
  ([ADR 0008](../adr/0008-entry-lifecycle-commands.md)), and pending lifecycle
  requests lock content mutations. Menus are non-modal Radix menus whose
  confirmations open after the menu closes and return focus to its button.
- Controls hold a cleared value as `null` in form state, because React Hook
  Form would show the loaded default again for `undefined`; the editor strips
  those values before it saves or copies a draft. Dates are parsed textually
  so days never shift.
- Viewers see the editor read-only: native controls sit in a disabled
  fieldset, rich text is not editable and there is no Save or Publish.
- A global has no title input and saves its stored title unchanged
  ([ADR 0010](../adr/0010-global-models.md)). The admin cannot see
  `LACE_SITE_INDEXING`, so the SEO preview describes the entry, not the
  deployment ([ADR 0011](../adr/0011-seo-system-group.md)).
- Block cards edit the envelope in a Settings tab
  ([ADR 0012](../adr/0012-block-envelope.md)). A hidden card is muted without
  lowering text contrast; reorder announcements name blocks by label and
  position, never by key.
- Composite fields keep UI item identities as transient sidecars that never
  enter stored or public JSON, count normalized defaults, nested lists and
  hidden blocks in the 500-element entry budget, and never silently drop list
  slots ([ADR 0013](../adr/0013-bounded-composite-fields.md)).
- Hidden tabs, settings and conditional fields stay mounted but leave focus
  and the accessibility tree; a relevant error reveals its control
  ([block-settings-visibility](../../openspec/specs/block-settings-visibility/spec.md),
  [conditional-fields](../../openspec/specs/conditional-fields/spec.md)).
  Changing settings visibility affects only the configuration projection:
  synchronization preserves snapshots, audit and media references and
  baseline concurrency guards, and keeps published-version advancement and
  build coalescing.
- Guidance (required markers, bounds, counters, placeholders) never
  materializes absent values or blocks an otherwise valid draft save.
- The Tiptap schema declares only allowlisted attributes, so every document
  the editor produces passes the shared validator; rendering derives
  `noopener noreferrer` instead of storing it. Paste follows the shared safe
  document rules, with no dedicated Word or Google Docs cleanup
  ([ADR 0014](../adr/0014-expanded-rich-text-format.md)).
- A focused summary links every validation problem to its control; server
  JSON Pointers, including deep rich-text paths, map to the same locations,
  and unplaceable issues are listed as text.

### Component source and design tokens

Admin UI components are Lace-owned source: shadcn/ui is a generator whose
Radix-based components are copied into the admin once and then edited like any
other Lace code, and no themed component library is a runtime dependency
([ADR 0005](../adr/0005-admin-owned-component-source.md)).

Design tokens are CSS custom properties in the shadcn naming convention plus
typography, spacing, radius, shadow, focus and motion tokens. One theme file is
the only place in admin source that may contain color values; Tailwind's
default palette is removed and components are styled only through utilities
that resolve to tokens. `pnpm lint` rejects raw color literals elsewhere and
arbitrary utility values that replace a typography, radius, shadow,
focus-width or motion token; layout values may stay arbitrary. Light and dark
token sets are scoped by a `data-theme` selector on the document root, so
components need no theme-specific source, and both meet the same contrast
pairs. The System/Light/Dark preference is kept in local storage and applied
before the first screen renders. Inter is self-hosted with a 13px base size
([admin-design-system](../../openspec/specs/admin-design-system/spec.md)).

### Accessibility acceptance

Every admin route and main dialog is audited in the browser with axe against
the WCAG 2.x A and AA rules, in both themes, and any violation fails the suite.
No rule is disabled globally. The same browser suite completes the main
editorial flow with the keyboard alone, checks visible focus along it, and
checks 375px layouts, including the entry column stacking below the blocks.
The local product acceptance walkthrough repeats the audits on real data.

### Source layers

Admin source is organized into layers with a single import direction
([admin-source-structure](../../openspec/specs/admin-source-structure/spec.md)):

```text
app → pages → widgets → features → entities → shared
```

`app` owns bootstrap, providers, the router tree and global styles; `pages`
holds one slice per route screen; `widgets` holds composite screen sections
such as the shell or an entry list; `features` holds user actions such as
publish, upload or sign in; `entities` holds domain-facing models, queries and
presentation of content, media, users and sessions; `shared` holds the API
client, generic UI primitives, utilities and configuration with no knowledge
of Lace domain slices.

- A module imports only from layers to its right. Slices of the same layer do
  not import each other.
- `pages`, `widgets`, `features` and `entities` are divided into slices that
  expose their public API only through their `index.ts`. `app` and `shared`
  are not sliced: their public units are the shallowest directories with an
  `index.ts` (such as `app/router` or `shared/ui/Button`), and units of the
  same unsliced layer import each other through those indexes.
- Every React component lives in its own PascalCase folder with its test and
  an `index.ts`; code outside the folder imports it only through that index.
- Only the source-root entry module (`main.tsx`) and test-environment setup in
  `test/` live outside the layers; the entry module may import any layer's
  public API. Test files may also import any layer's public API, so a page or
  widget test can mount the real router, but never another unit's internals.
- Router state is read below `app` through TanStack Router `getRouteApi` with
  string route ids typed by the `Register` augmentation in `app/router`, so no
  runtime import points upward.
- Imports are relative with explicit `.js` extensions; there are no path
  aliases.

`scripts/check-boundaries.mjs`, run by `pnpm lint`, enforces the layer
direction, the slice and component-folder public APIs and component-folder
completeness.
