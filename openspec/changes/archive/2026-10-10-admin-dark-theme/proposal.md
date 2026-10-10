## Why

The MVP roadmap is complete and the admin was built dark-ready: tokens are
scoped by a `data-theme` selector, Tailwind's `dark:` variant is bound to
`data-theme="dark"`, and the generated primitives already carry `dark:`
refinements. Editors who work in dark environments or follow a dark system
preference still get a bright admin, because the MVP deliberately shipped the
light theme only. The owner now asks for a dark theme and a remembered theme
switcher.

This is post-MVP product work outside the archived roadmap sessions; it is a
standalone just-in-time change.

## What Changes

- Ship a `dark` token set in the admin theme source under
  `:root[data-theme="dark"]`, with every foreground/surface pair meeting WCAG AA
  4.5:1, and `color-scheme: dark`.
- Add a theme preference with three values: `system` (default), `light`, and
  `dark`. `system` follows `prefers-color-scheme` and reacts to OS changes.
- Persist the preference in browser `localStorage`; unreadable, invalid, or
  unavailable storage falls back to `system` without blocking the admin. Other
  tabs of the same admin follow a change.
- Apply the resolved theme to the document root before the first React render
  on every admin screen, including sign-in and setup.
- Add a keyboard-operable Theme choice (System / Light / Dark) to the shell
  user menu.
- Let the toast notifications follow the resolved theme.
- Remove the `dark:bg-destructive/60` overrides in the generated Button and
  Badge primitives so destructive surfaces use the contrast-checked token pair.
- Extend the browser accessibility audits of routes, sign-in, and main dialogs
  to the dark theme.
- Update the architecture's "Accessibility acceptance" paragraph, which stated
  the MVP ships the light theme only.

Non-goals: per-user server-side theme storage, themes other than light and
dark, theming the public Astro site, and changing the light token values.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-design-system`: the light-only theme requirement is replaced by a
  light-and-dark requirement; a new requirement defines the stored theme
  preference and how it resolves.
- `admin-application-shell`: the user menu gains theme selection, and the
  route/dialog accessibility audits run in both themes.

## Impact

- `apps/admin/src/app/styles/theme.css` and its test.
- New theme preference module in `apps/admin/src/shared/lib` (storage,
  resolution, document application) used by `main.tsx`.
- `apps/admin/src/widgets/admin-shell/UserMenu`, `shared/ui/Toaster`,
  `shared/ui/Button`, `shared/ui/Badge`.
- `apps/admin/e2e/accessibility.e2e.ts`.
- `docs/mvp-architecture.md` (Accessibility acceptance paragraph).
- No API, persistence, package, or runtime-adapter changes; no new
  dependencies. Node and Cloudflare serve the same static admin build.
