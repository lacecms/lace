## ADDED Requirements

### Requirement: Template 0.25.0 delivers site SEO output
The generator SHALL advance the managed template version to `0.25.0`. The
generated `lace.config.ts` SHALL declare `seo: true` on the `home` page,
`seo: { description: "summary" }` on the `posts` collection, and on the
`settings` global optional fields `description` (textarea) and `image`
(media) with `seoDefaults` mapping `siteName`, `description` and `image`.
In starter mode the user-owned base layout SHALL render the adapter's SEO head
component from `site.seo(entry)` instead of a bare `<title>`, the post route
SHALL render with `og:type` `article`, and user-owned `sitemap.xml` and
`robots.txt` endpoints SHALL use the adapter's helpers. Generated deployment
files SHALL pass the optional `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`
settings to every site build they define: the Compose builder service and the
Cloudflare Pages workflow (repository variables). The generated `.env.example`
SHALL document both settings, their defaults and their effect on canonical
URLs, the sitemap and robots output. The managed Astro site guide and the
deployment guides SHALL document `site.seo()`, `site.url`, `<LaceSeo>`, the
sitemap and robots helpers, both settings (including for Git-connected Pages
projects and staging builds) and that `robots.txt` is only honoured at the
host root. Template upgrade instructions SHALL state that the engine requires
the additive migration `0008_content_snapshot_seo`, with the Compose and
Cloudflare backup, migration and sync sequence, and that rolling back the
API keeps working because the migration only adds a column. They SHALL explain
the `seo` model option, `seoDefaults`, the model version bump and sync they
require, the two build settings, and that the starter configuration, layout
and endpoints are adopted by hand because `lace.config.ts` and site files are
user-owned. Upgrades SHALL preserve user-owned files and retain deterministic
managed hashes and existing conflict detection.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.25.0`, its configuration enables
  SEO on `home` and `posts` and declares `seoDefaults` on `settings`, its base
  layout renders the SEO head component, and its site has `sitemap.xml` and
  `robots.txt` endpoints

#### Scenario: Deployment files pass the build settings
- **WHEN** a starter project is generated
- **THEN** its Compose builder service and its Cloudflare Pages workflow pass
  `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING` to the site build, and its
  `.env.example` documents both

#### Scenario: Existing project upgrades to 0.25.0
- **WHEN** a 0.24.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe migration `0008`, the SEO options
  with their version bump and sync, the build settings and manual adoption,
  and user-owned files including `lace.config.ts` and site sources are
  unchanged
