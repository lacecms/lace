# ADR 0005: Generate admin components as Lace-owned source

- Status: Accepted
- Date: 2026-09-26
- Governing architecture: [section 17](../architecture/admin.md#17-admin-application) and [section 19](../architecture/workspace.md#19-dependency-policy)

## Context

Steps 16–20 rebuild the admin against a single visual direction: a neutral
inset-panel shell, indigo accent, Inter, 13px base text, stacked block cards,
and a right-hand editor column. The admin already uses Tailwind CSS and Radix
primitives, but its components were hand-written against ad hoc CSS classes
and variables that contained raw color values. Rebuilding every screen needs a
complete, accessible component set, consistent tokens, and a path to a later
dark theme, without surrendering visual control to a third-party theme or
coupling Lace upgrades to a component library's release cycle.

## Decision

- shadcn/ui is used as a source generator. Its Radix-based components are
  generated once into the admin source and committed; from then on they are
  Lace code, reviewed, tested, and edited like any other module. No shadcn,
  Radix Themes, or other themed component package is a runtime dependency.
- Design tokens are CSS custom properties in the shadcn naming convention,
  defined in one admin theme file in OKLCH and mapped into Tailwind through
  `@theme inline`. Tailwind's default color palette is removed. Components use
  only token-backed utilities; `pnpm lint` rejects raw color literals outside
  the theme file.
- Theme values are scoped by a `data-theme` root attribute. The MVP ships only
  the light theme; a dark theme can later supply alternative values without
  component changes.
- Tailwind's text scale is overridden so `text-sm` is the 13px body size used
  by generated components; `text-xs` is 11px and larger steps follow.
- Approved admin UI dependencies: `lucide-react` (icons), `sonner`
  (notifications), `@tanstack/react-table` (headless tables), `react-dropzone`
  (upload selection), `react-day-picker` (date selection),
  `@fontsource-variable/inter` (self-hosted Inter), and `clsx`,
  `tailwind-merge`, and `class-variance-authority` (class composition). Each is
  added to the pnpm catalog by the change that first imports it.

## Consequences

- Lace controls markup, styling, and accessibility behavior of every admin
  component, and upstream shadcn changes are adopted deliberately by
  regenerating and reviewing a diff.
- Generated components must be kept to the admin layering and folder rules,
  and Lace owns their tests.
- The font is served from the admin origin; no third-party font host is
  contacted.
- Color and theme changes happen in one file, and the lint gate keeps literal
  colors from reappearing in components.

## Alternatives considered

- A themed runtime library (MUI, Mantine, Chakra UI, Radix Themes) was rejected
  because theming stops at the library's extension points and upgrades would
  follow the library's release and breaking-change cadence.
- Installing shadcn/ui components as an npm dependency was rejected; shadcn is
  designed as copied source and a wrapper package would recreate the themed
  dependency problem.
- Continuing hand-written component CSS was rejected because it duplicates
  accessible behavior Radix and shadcn already provide and drifted into raw
  color literals.
- Loading Inter from a font CDN was rejected for privacy, offline development,
  and self-hosted deployment reasons.
