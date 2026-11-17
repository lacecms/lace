## 1. Architecture and shared component

- [x] 1.1 Revise architecture §13.4 and §13.5 to allow the shared player's local script and retain site ownership of block sources and stylesheets. Verify the architecture document checks and the boundaries in ADR 0006.
- [x] 1.2 Implement the typed `LaceVideo.astro` figure and player markup, with the existing provider description, poster image pipeline, optional caption, source link and caller hooks. Verify static output for both providers and modes, including inert templates, iframe permissions, no provider requests during builds and no-script output.
- [x] 1.3 Implement the instance-scoped playback script. Verify keyboard and pointer activation and focus, ambient mounting and source-link focus, reduced-motion fallback and repeated initialization after Astro navigation.
- [x] 1.4 Export and package `LaceVideo.astro` using the adapter's existing source and dist paths. Verify workspace resolution and build a consumer using the packed subpath.

## 2. Registry and maintained sites

- [x] 2.1 Switch the site-owned `videoEmbed` and `gallery` renderers to `LaceVideo`. Verify block envelope and figure hooks, existing defaults and captions, provider URLs, poster behavior, gallery ordering and image-lightbox indexes.
- [x] 2.2 After a compatible candidate is selected in an explicit release session, advance both registry item revisions with a package range that includes the new export. Regenerate maintained source copies, locks and affected starter inventory and fixtures. Verify both items install independently, an older adapter produces the existing package guidance, and local component or stylesheet conflicts preserve the item and lock.
- [x] 2.3 Update the site and upgrade docs for the shared component, site-owned CSS, ambient accessibility limitation and renderer-only adoption on existing compatible definitions. Verify the docs checks and that the documented steps match the CLI behavior.

## 3. End-to-end verification

- [x] 3.1 Run the packed adapter, registry and Astro site verification. Use browser coverage for direct and poster players, reduced motion and JavaScript disabled, mixed pages, independent upgrades in both directions, and a narrow gallery viewport with no horizontal overflow. Verify a clean existing-site upgrade builds from the same published export.
- [x] 3.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate shared-astro-video-player --type change --strict`. Record results and keep all content-definition versions and media contracts unchanged.

## Verification

- Passed adapter, registry and CLI tests, maintained source parity, documentation checks, and the reference and existing Astro site suites.
- Built the site with local `0.1.0-rc6` tarballs. Chromium verified both independent renderer upgrades, direct and poster playback, reduced motion, disabled JavaScript, Astro navigation, and no horizontal overflow at 320 px. The existing site built before and after the CLI update using the same published export.
- Passed root typecheck, lint, format check, and strict OpenSpec validation (91 items). Block definitions and media contracts are unchanged.
- After aligning the release metadata with `0.1.0-rc6` and template `0.51.0`, `pnpm release:check`, all 65 generator tests, and reproducible generation in all six template variants passed.
