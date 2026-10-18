## ADDED Requirements

### Requirement: Template 0.32.0 delivers build-time image variants and the lightbox setting
The generator SHALL advance the managed template version to `0.32.0`. The
generated `lace.config.ts` SHALL keep registering all seven built-in blocks
and SHALL raise the `home` page and the `posts` collection to model version 3.
In starter mode the user-owned site SHALL contain the `image`, `gallery` and
`hero` components byte-identical to their new registry revisions, recorded in
`lace.site.json`; its `package.json` SHALL declare `sharp` at the version
Astro's image service uses; its `astro.config.mjs` SHALL read the project `.env` when
present, overlay the process environment and pass `laceImageConfig` of that
environment as the Astro `image` configuration; and its stylesheet SHALL
contain the lightbox rules. The managed Astro site guide SHALL
document the variants and their widths, the placeholder and when it is left
out, the `lightbox` setting and its browser support, `sizes`, the
`optimizeImages` loader option, the remote image allowance and the build
cache. Template upgrade instructions SHALL state that no database migration
is required; that engine, admin and site packages move together; that the
next content sync migrates stored `image` and `gallery` blocks to versions 3
and 2 and therefore requires the new registry components before the next
site build; and that adoption is manual because `lace.config.ts` and site
files are user-owned: bump the models that allow `image` or `gallery`, run
sync, run `lace add block image gallery hero` (or merge the changes into
edited components), adopt the `astro.config.mjs` image configuration and the
stylesheet rules. Upgrades SHALL preserve user-owned files and retain
deterministic managed hashes and existing conflict detection.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.32.0`, `home` and `posts` are at
  version 3, the site holds the new `image`, `gallery` and `hero` revisions
  with a matching lock, its `package.json` declares `sharp`, and
  `astro.config.mjs` configures the media remote pattern

#### Scenario: Existing project upgrades to 0.32.0
- **WHEN** a 0.31.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe the coordinated package upgrade,
  the absence of a migration, the block version migration on sync and the
  manual adoption steps, and user-owned files including `lace.config.ts`,
  `lace.site.json` and site sources are unchanged
