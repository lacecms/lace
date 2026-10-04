# ADR 0006: Share rendering logic as packages and install block markup as source

- Status: Accepted
- Date: 2026-10-04
- Governing architecture: [section 6](../mvp-architecture.md#6-repository-structure),
  [section 7](../mvp-architecture.md#7-generated-user-project),
  [section 11](../mvp-architecture.md#11-block-registry-and-rich-text), and
  [section 13](../mvp-architecture.md#13-site-rendering-and-block-installation)
- Related: [ADR 0001](./0001-package-dependency-boundaries.md),
  [ADR 0005](./0005-admin-owned-component-source.md), onboarding feedback §7

## Context

Every Lace site needs the same non-visual work: read the published build export
with a read-only token, keep one export per static build but revalidate in
`astro dev`, check the expected published version, validate block data against
block definitions, and render rich text through the shared allowlist. It also
needs visual block markup, which site owners restyle and rewrite.

Through Step 29 the generated starter `site/` and the engine's `apps/site` each
carried private copies of all of it: `lib/site-data.ts` (SDK client creation,
ETag reads, memoization, version check, actionable errors, local export type
copies, and a starter-only derivation hard-coding `home` at `/` and `posts` at
`/blog/<slug>`), `lib/rendering.ts` (hand-written field readers duplicating the
`builtInBlocks` definitions although `validateBlockData` and `BlockDataValues`
exist), `lib/rich-text.ts`, a closed `BlockRenderer.astro` `if` chain over five
block types, `RichText*.astro`, and five visual blocks.

The copies had already drifted from the CMS. The site-local rich-text check
accepts any URL whose parsed protocol is allowed, so it accepts
`https:example.com` and `mailto:` without an `@` that `isSafeUrl` in
`@lacecms/content` rejects, and it accepts invalid nesting such as a paragraph
inside a paragraph that `validateRichTextDocument` rejects. The architecture
requires one allowlist shared by validation and rendering.

Connecting an existing Astro site (onboarding feedback §7) meant hand-copying
these files and their transitive helpers out of a generated `cms/site/`. The
owner asked for a shadcn-style command that installs editable block sources,
keeps future React, Vue, or Svelte variants possible, and never silently
overwrites user edits. The first alpha is published, so Step 30 may break the
alpha starter layout deliberately to avoid later rework.

## Decision

Split rendering into packaged logic and user-owned markup:

- **Framework-neutral packages carry all logic that is not markup.** The
  published-site loader lives in `@lacecms/sdk` next to the transport it uses.
  Block parsing, the block map and resolver, and the rich-text element
  description live in a new framework-neutral `@lacecms/render` package that
  depends only on `@lacecms/content` and reuses `validateBlockData`,
  `validateRichTextDocument`, and `isSafeUrl` exclusively.
- **A thin adapter per framework carries only framework-bound code.**
  `@lacecms/astro` provides `<LaceBlocks>`, `<RichText>`, and Astro environment
  glue for the loader. It depends on `@lacecms/render` and `@lacecms/sdk` and
  ships no visual blocks. Astro is the only adapter now and the default
  framework; `react`, `vue`, and `svelte` are reserved keys.
- **Visual block markup is never published as a runtime package.** It is
  versioned source in a repository `registry/` directory, bundled with
  `@lacecms/cli`. `lace add block` copies items into a site, records them in a
  site-local `lace.site.json` with content hashes, and maintains a generated
  block map file. Installed files become user-owned; the CLI updates a file only
  while its hash proves it unchanged and otherwise reports a conflict, reusing
  the `lace upgrade` hash, conflict, and journal mechanisms.
- **The starter and reference site consume the same packages and registry
  sources.** The `create-lace` starter is a minimal product template and is
  optional at project creation (starter, existing site, or no site);
  `apps/site` is the engine playground and build fixture and never ships. A
  parity test keeps their block copies identical to `registry/`.
- The public build-export DTO is unchanged; the loader hides that public entries
  reuse the content-entry schema.

The exact package edges, file locations, ownership rules, and public API names
are specified in architecture sections 6, 7, and 13.

## Consequences

- Loading, parsing, and rich-text safety have one implementation shared with
  the CMS; fixing the allowlist fixes every site that upgrades the packages.
- Site owners keep full control of block markup and styles, including the
  Step 21.5 `data-lace-*` hooks, and an existing Astro site connects by
  installing packages and running `lace add block` instead of copying files.
- Sites declare four Lace dependencies (`@lacecms/astro`, `@lacecms/render`,
  `@lacecms/sdk`, `@lacecms/content`); the starter preconfigures them and the
  CLI prints the exact install command.
- The CLI gains a registry, a site-local lock file, and a second hash-guarded
  write path, which must share code with `lace upgrade` rather than duplicate it.
- Block definitions used by the site must match the CMS configuration version;
  parsing fails on schema-version mismatch and the installer reports
  definition-version mismatches.
- Alpha-era generated sites need manual migration of their user-owned `site/**`;
  `lace upgrade` still never rewrites it.

## Alternatives considered

- **Copy-only starter (status quo).** Zero package surface and full user
  control, but every site owns a security-relevant allowlist and loader that
  silently drift from the CMS, as the inventory shows, and existing sites must
  copy files by hand. Rejected.
- **npm-packaged renderers.** Ship default Astro block components in a package.
  Upgrades reach users automatically and there is no copy step, but markup and
  styling stop at the package's props and slots, every visual change becomes a
  breaking-change question, and each future framework needs its own themed
  component library. This recreates the themed-dependency problem ADR 0005
  rejected for the admin. Rejected.
- **Source-only installer.** Copy everything — loader, parsing, rich text, and
  markup — as editable source with `lace add`. Users control everything, but the
  non-visual logic is the part that must never drift from the CMS and that users
  have no reason to edit; copying it repeats the drift problem with better
  tooling. Rejected.
- **Hybrid (chosen).** Package what must stay identical to the CMS, install what
  users are expected to change. It costs a small package graph and an installer,
  and keeps the registry and adapter model open to other frameworks without
  restructuring.
