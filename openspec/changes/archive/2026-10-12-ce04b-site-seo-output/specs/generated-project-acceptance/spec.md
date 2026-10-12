## MODIFIED Requirements

### Requirement: CI builds a starter generated from packed packages
Continuous integration SHALL, in addition to building the reference site, pack the Lace packages the generated project depends on, generate a project, install it from those tarballs outside the source workspace, and build its starter site against a local published-export server. The phase SHALL build the starter once from an export with a published `settings` global, stored SEO values and a configured `LACE_BUILD_SITE_URL`, and once from an export without globals and without a site URL. The phase SHALL fail when the install resolves a Lace package from the source workspace, when the build emits fewer than the five built-in block types, when a build makes more than one export read, when the site header does not show the published site name with a published global or the static fallback without one, when the head metadata, `sitemap.xml` or `robots.txt` output differs from the expectations below, or when the build token appears in any static output file.

#### Scenario: Shipped starter builds
- **WHEN** the starter phase runs on a clean checkout
- **THEN** the packed generated project installs, builds all five blocks from the served export, and contains no build token in its output

#### Scenario: Starter builds with and without a published global
- **WHEN** the starter phase serves an export with a published `settings`
  global and then one without globals
- **THEN** the first build shows the published site name and tagline, the
  second shows the static fallback site name, and each build reads the export
  once

#### Scenario: Starter builds with a site URL
- **WHEN** the starter is built with a published `settings` global, a post
  with a stored SEO description and `LACE_BUILD_SITE_URL`
- **THEN** the home page title is formatted with the published site name, the
  post has the stored description, `og:type` `article` and a canonical URL
  under the site URL, `sitemap.xml` lists the home page and the post, and
  `robots.txt` names the sitemap

#### Scenario: Starter builds without a site URL
- **WHEN** the starter is built from an export without globals and without
  `LACE_BUILD_SITE_URL`
- **THEN** the build succeeds, pages have a title and no canonical link or
  `og:url`, no `sitemap.xml` is written, and `robots.txt` allows everything
  without a `Sitemap:` line

#### Scenario: Template references an unpublished helper
- **WHEN** the starter imports a module that exists only in the source workspace
- **THEN** the packed install or build fails the phase
