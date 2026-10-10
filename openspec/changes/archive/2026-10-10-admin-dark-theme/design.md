## Context

The admin theme source (`apps/admin/src/app/styles/theme.css`) defines one
`:root, :root[data-theme="light"]` token block and binds Tailwind's `dark:`
variant to `[data-theme="dark"]`. Generated primitives (Button, Badge, Input,
Textarea, Select, Tabs, Calendar, DropdownMenu) already contain shadcn `dark:`
refinements that are inert today. The Toaster pins Sonner to `theme="light"`.
`theme.test.ts` checks the light token set and AA contrast pairs and asserts
that no dark block exists. The introductory tour already stores a local
preference in `localStorage` with an in-memory fallback
(`widgets/admin-shell/tour-storage.ts`). No Content-Security-Policy is applied
to the admin today. See proposal.md for motivation and specs for behavior.

## Goals / Non-Goals

**Goals:**
- One preference module that reads, stores, resolves, and applies the theme,
  testable without a real browser.
- No visible theme flash on screens rendered by React.
- Dark tokens verified by the same contrast test as light tokens.

**Non-Goals:**
- Server-side or per-account theme storage.
- Theming non-admin surfaces (public site, Astro adapter, CLI output).

## Decisions

### Preference lives in `shared/lib/theme-preference.ts`
`shared` is the lowest layer, so `main.tsx`, the Toaster (`shared/ui`), and the
UserMenu (`widgets/admin-shell`) can all use it. It exports a factory
`createThemePreference({ storage, media, root })` for tests and a default
browser instance with:
- `preference()` → `"system" | "light" | "dark"`;
- `resolvedTheme()` → `"light" | "dark"`;
- `setPreference(value)` → stores, applies, notifies;
- `subscribe(listener)` for `useSyncExternalStore`;
- `start()` → applies the resolved theme to `document.documentElement` and
  attaches the `prefers-color-scheme` and `storage` listeners (idempotent);
- `useThemePreference()` hook returning `{ preference, resolvedTheme,
  setPreference }`.

The module always writes the resolved value (`light` or `dark`) to
`data-theme`, including for `system`, because the Tailwind `dark:` variant
matches only the attribute. Rejected: a CSS `@media (prefers-color-scheme:
dark) :root:not([data-theme])` block — it duplicates every token value and
`dark:` utilities would not follow it.

### Storage key and format
Key `lace:admin-theme`, value the plain string `system`, `light`, or `dark`.
Any other value reads as `system`. Writing `system` stores `system` (not a
removal) so an explicit return to System is visible in other tabs through the
`storage` event. Acquisition, read, and write are wrapped in `try`; on failure
the module keeps the choice in memory for the document, mirroring the tour
records. Rejected: scoping by user ID like the tour — the theme must apply on
sign-in and setup before any user is known, and it is a device preference.
Rejected: scoping by admin base path — one origin normally hosts one admin, and
a shared device preference is acceptable if it does not.

### Apply before the first render from `main.tsx`
`main.tsx` calls `themePreference.start()` before `createRoot().render()`.
The root element is empty until React renders, so every React screen renders
in the correct theme. Rejected: an inline `<script>` in `index.html` — it adds
inline script that a future CSP would need to allow, for at most one frame of
the page background before the module runs.

### Dark token palette
Neutral achromatic surfaces mirroring the light scale (background
`oklch(0.145 0 0)`, card/popover/sidebar `oklch(0.205 0 0)`, muted/secondary
`oklch(0.269 0 0)`, border `oklch(0.29 0 0)`, input `oklch(0.37 0 0)`), light
foregrounds (`oklch(0.985 0 0)`, muted foreground `oklch(0.72 0 0)`), an
indigo primary/ring lightened to `oklch(0.645 0.19 277)` with a
near-black primary foreground, an indigo-tinted accent, `oklch(0.704 0.191
22.216)` destructive with a near-black foreground, and dark-tinted
success/warning surfaces with light tinted foregrounds. The overlay darkens to
60% black. Shadow tokens stay shared. The contrast test computes every pair for
both blocks. The primary lightness is bounded on both sides: inline
`text-primary` links need 3:1 against body text (axe `link-in-text-block`), and
the `hover:bg-primary/90` button surface must keep 4.5:1 under the dark primary
foreground.

### Destructive primitives use the plain token pair
Button and Badge drop `dark:bg-destructive/60`; the 60% surface would sit
under `destructive-foreground` with a contrast the token test cannot see. Other
shadcn `dark:` refinements (`bg-input/30` fields, tab states, focus ring
alpha) only lighten neutral surfaces under high-contrast foregrounds and stay.

### User menu Theme group
`UserMenu` adds a labelled `DropdownMenuRadioGroup` ("Theme") with System,
Light, and Dark radio items (Monitor, Sun, Moon icons), between the user label
and the Introduction item. Radix gives `menuitemradio` roles, `aria-checked`,
arrow-key movement, and Enter/Space selection. Rejected: a header icon button —
the header holds per-screen page actions, and a three-state choice reads better
as a labelled group than a cycling button.

### Toaster follows the resolved theme
`Toaster` passes `resolvedTheme` from `useThemePreference()` to Sonner's
`theme` prop; colors still come from popover tokens.

### Accessibility audits in both themes
`accessibility.e2e.ts` loops sign-in, the route table, and the main dialogs
over `["light", "dark"]`, seeding the preference with `page.addInitScript`
writing `localStorage` before the admin loads.

## Risks / Trade-offs

- [One frame of light page background on a dark-preference reload before the
  module runs] → The root is empty during that frame; accepted to avoid inline
  script.
- [Generated `dark:` refinements were never exercised] → Covered by the dark
  axe audits of every route and main dialog.
- [Third-party surfaces (Tiptap content, Calendar) using browser defaults] →
  `color-scheme: dark` on the root makes native controls and scrollbars dark;
  the audits catch remaining contrast issues.

## Migration Plan

No data migration. Existing users have no stored key and get `system`, so
users with a dark OS preference see the dark theme after upgrading; choosing
Light restores the previous look. Rollback is a code revert; a leftover
`lace:admin-theme` key is ignored by older builds.
