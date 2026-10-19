## ADDED Requirements

### Requirement: Template 0.34.0 delivers image links
The generator SHALL advance the managed template version to `0.34.0`. The
generated `lace.config.ts` SHALL keep registering all seven built-in blocks
and SHALL raise the `home` page and the `posts` collection to model version 4.
In starter mode the user-owned site SHALL contain the `image` and `gallery`
components byte-identical to their new registry revisions, recorded in
`lace.site.json`, and its stylesheet SHALL contain the image link focus rule.
The managed Astro site guide SHALL document the `link` field of `image` and
gallery items, its precedence over the lightbox and the `link` part. Template
upgrade instructions SHALL state that no database migration is required; that
engine, admin and site packages move together; that the next content sync
migrates stored `image` and `gallery` blocks to versions 4 and 3 and therefore
requires the new registry components before the next site build; and that
adoption is manual because `lace.config.ts` and site files are user-owned:
bump the models that allow `image` or `gallery`, run sync, run
`lace add block image gallery` (or merge the changes into edited components)
and copy the stylesheet rule. Upgrades SHALL preserve user-owned files and
retain deterministic managed hashes and existing conflict detection.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.34.0`, `home` and `posts` are at
  version 4, and the site holds the new `image` and `gallery` revisions with
  a matching lock

#### Scenario: Existing project upgrades to 0.34.0
- **WHEN** a 0.33.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe the coordinated package upgrade,
  the absence of a migration, the block version migration on sync and the
  manual adoption steps, and user-owned files including `lace.config.ts`,
  `lace.site.json` and site sources are unchanged
