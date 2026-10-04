## ADDED Requirements

### Requirement: Rendering-core template upgrade protects ownership
The generator SHALL advance the managed template version to `0.9.0` and generate the adapter-based starter: the user-owned loader file, pages, layout, styles, block map file, `lace.site.json`, and five registry block components, with site dependencies on the Lace adapter, render core, SDK, and content packages pinned to the release version. Every generated file SHALL appear in the ownership inventory; the starter SHALL contain no site-local loader, rendering, or rich-text helper files. It SHALL deliver the existing-site connection guide as a managed file, updated managed operations guidance, and template upgrade instructions that list explicit manual migration steps for an alpha project's user-owned `site/**`. Upgrades SHALL preserve user-owned README, `lace.config.ts` and site source and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh generation
- **WHEN** a project is generated with template `0.9.0`
- **THEN** its site contains `src/lib/lace.ts`, `src/lace/blocks.ts`, `lace.site.json`, and `src/components/lace/` with the five block components, and contains none of `src/lib/site-data.ts`, `src/lib/rendering.ts`, `src/lib/rich-text.ts`, or `src/components/BlockRenderer.astro`

#### Scenario: Upgrade from 0.8.0
- **WHEN** a consumer with unmodified 0.8.0 managed files applies the 0.9.0 template upgrade
- **THEN** managed guidance is updated, the connection guide is added, instructions describe the manual site migration, and every existing user-owned site file is unchanged and no new site file is written
