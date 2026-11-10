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
- Shell surfaces never show internal entry or user IDs; the publication card
  also hides ISO timestamps.
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
- With MCP enabled, `/admin/mcp/consent` reuses session and sign-in; only
  administrators can grant publication. `/admin/account` lists owned connections
  through session-only routes, hidden by a server-derived capability when MCP is
  disabled. OAuth credentials never enter browser storage
  ([mcp-oauth-delegation](../../openspec/specs/mcp-oauth-delegation/spec.md)).

### Media

The library keeps search, filters, sort and view in the URL. Its picker reuses
the grid, offers active items only and resets its local query on opening.
Thumbnails load lazily through the authenticated admin preview endpoint.
Uploads validated for type and size in the browser use `XMLHttpRequest` for
byte progress; other requests use `fetch`, with shared error mapping and response
validation. A media field resolves its stored ID through the detail read, not
loaded pages, and retains it until replaced or removed ([admin-media-library](../../openspec/specs/admin-media-library/spec.md)).

### Entry editor

The editor makes draft, published and build status visible and surfaces
optimistic-concurrency conflicts rather than overwriting a newer draft
([admin-draft-editor](../../openspec/specs/admin-draft-editor/spec.md),
[admin-draft-editor-publication](../../openspec/specs/admin-draft-editor-publication/spec.md);
fields, media lists and blocks have their own `admin-draft-editor-*` capabilities).

- "Save and publish" validates, saves and publishes the saved revision with
  one idempotency key; a failed validation or save publishes nothing.
  Lifecycle actions are offered only as permissions and entry state allow
  ([ADR 0008](../adr/0008-entry-lifecycle-commands.md)), and pending lifecycle
  requests lock content mutations. Menus are non-modal Radix menus whose
  confirmations open after the menu closes and return focus to its button.
- Cleared controls hold `null` in form state to prevent React Hook Form from
  restoring loaded defaults; the editor strips those values before save or
  copy. Dates are parsed textually so days never shift.
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
  Settings visibility changes only the configuration projection; sync preserves
  snapshots, audit, media references, concurrency guards, published-version
  advancement and build coalescing.
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

Browser axe audits cover every admin route and main dialog against WCAG 2.x A
and AA in both themes; any violation fails the suite and no rule is disabled
globally. The suite also checks the main editorial flow by keyboard, visible
focus and 375px layouts, including entry-column stacking below blocks. The
local product acceptance walkthrough repeats the audits on real data.

### Source layers

Admin source is organized into layers with a single import direction
([admin-source-structure](../../openspec/specs/admin-source-structure/spec.md)):

```text
app → pages → widgets → features → entities → shared
```

`app` owns bootstrap, providers, router and global styles; `pages` holds route
screens; `widgets` holds composite sections; `features` holds user actions;
`entities` holds domain-facing models, queries and presentation; `shared` holds
the API client, generic UI, utilities and configuration without domain-slice
knowledge.

- A module imports only from layers to its right. Slices of the same layer do
  not import each other.
- `pages`, `widgets`, `features` and `entities` are divided into slices that
  expose their public API only through their `index.ts`. `app` and `shared`
  are not sliced: their public units are the shallowest directories with an
  `index.ts` (such as `app/router` or `shared/ui/Button`), and units of the
  same unsliced layer import each other through those indexes.
- React components live in PascalCase folders with their test and an `index.ts`;
  code outside the folder imports them only through that index. A private
  PascalCase sibling component file with a colocated test may omit the folder
  when it is used only within its slice or unit and is not exported directly
  or transitively from that owner's public index.
- Only `main.tsx` and `test/` environment setup live outside the layers. The
  entry module and tests may import any layer's public API; tests may mount the
  real router but never import another unit's internals.
- Router state is read below `app` through TanStack Router `getRouteApi` with
  string route ids typed by the `Register` augmentation in `app/router`, so no
  runtime import points upward.
- Imports are relative with explicit `.js` extensions; there are no path
  aliases.

`scripts/check-boundaries.mjs`, run by `pnpm lint`, enforces the layer
direction, the slice and component-folder public APIs and component-folder
completeness.
