## MODIFIED Requirements

### Requirement: Loader configuration is explicit and framework-neutral
The SDK SHALL provide a published-site loader factory that takes its configuration only from its arguments: an optional environment record (`LACE_API_BASE_URL`, `LACE_BUILD_TOKEN`, `LACE_PUBLIC_BASE_URL`, `LACE_EXPECTED_PUBLISHED_VERSION`, `LACE_BUILD_SITE_URL`, `LACE_SITE_INDEXING`) and optional explicit API base URL, build token, public media base URL, expected published version, site URL and indexing values that take precedence over the record. Empty or whitespace-only values SHALL count as absent. The loader SHALL NOT read process or bundler environment globals itself and SHALL NOT import any UI framework. Configuration SHALL be resolved when the loader is first called, not when it is created. A missing API base URL, a missing build token, an invalid API base URL, an expected version that is not a non-negative integer, a site URL that is not an absolute `http` or `https` URL without credentials, query or fragment, or an indexing value other than `on` or `off` SHALL fail with the `missing_configuration` code and name the setting without revealing the token or the rejected value.

#### Scenario: Explicit values override the environment record
- **WHEN** a loader is created with an environment record naming one API origin and an explicit base URL naming another
- **THEN** the build-export request goes to the explicit base URL

#### Scenario: A build token is missing
- **WHEN** a loader is called without a configured build token
- **THEN** it fails with `missing_configuration` naming `LACE_BUILD_TOKEN` and sends no request

#### Scenario: A loader is created before configuration exists
- **WHEN** a loader is created with an empty environment record but never called
- **THEN** creation succeeds and no error is raised

#### Scenario: An invalid site URL is configured
- **WHEN** a loader is called with `LACE_BUILD_SITE_URL=https://user:secret@example.com/` or `LACE_BUILD_SITE_URL=/blog`
- **THEN** it fails with `missing_configuration` naming `LACE_BUILD_SITE_URL`, sends no request and does not include the configured value in the message

#### Scenario: An invalid indexing switch is configured
- **WHEN** a loader is called with `LACE_SITE_INDEXING=no`
- **THEN** it fails with `missing_configuration` naming `LACE_SITE_INDEXING` and stating that it accepts `on` or `off`

## ADDED Requirements

### Requirement: The site view exposes the site URL and indexing switch
The site view SHALL expose `url`, the configured site URL normalized to end with `/`, or `undefined` when none is configured; `indexing`, `true` unless the indexing switch is `off`; `urlFor(path)`, the absolute URL of a public path resolved under the site URL (a path's leading slashes are ignored so a site URL with a base path keeps it), or `undefined` without a site URL; and `allEntries()`, every published entry of the export sorted by path in code-unit order. In revalidate mode the values SHALL reflect the configuration of the call that produced the view.

#### Scenario: A site URL with a base path
- **WHEN** the site URL is `https://example.com/blog` and an entry's path is `/posts/hello`
- **THEN** `site.url` is `https://example.com/blog/` and `site.urlFor("/posts/hello")` is `https://example.com/blog/posts/hello`

#### Scenario: The home path
- **WHEN** the site URL is `https://example.com/` and `site.urlFor("/")` is called
- **THEN** it returns `https://example.com/`

#### Scenario: No site URL
- **WHEN** neither `LACE_BUILD_SITE_URL` nor the explicit site URL is configured
- **THEN** `site.url` and every `site.urlFor()` result are `undefined`, `site.indexing` is `true`, and the site view is otherwise unchanged

#### Scenario: Indexing is switched off
- **WHEN** `LACE_SITE_INDEXING=off` is configured
- **THEN** `site.indexing` is `false`

#### Scenario: All entries across models
- **WHEN** an export holds a page at `/`, posts at `/blog/a` and `/blog/b`, and a published global
- **THEN** `site.allEntries()` returns the three entries ordered `/`, `/blog/a`, `/blog/b` and no global

### Requirement: The SDK resolves entry SEO with fallbacks and site defaults
The SDK SHALL export a pure resolver and SHALL bind it as `site.seo(entry)` for entries of the same site view. The resolver SHALL take the entry, the model's fallback mapping from the export `seo` section, the published defaults global named by that section, the site's media lookup, the site URL and the indexing switch, and SHALL return `{ title, description?, image?, canonical?, robots?, siteName? }` without reading any other state. Text values from mapped fields SHALL count only when they are strings that are not blank after collapsing whitespace runs to single spaces and trimming; the collapsed value SHALL be used. Media values SHALL count only when they name media resolved in the export with an `image/` MIME type. The resolution SHALL be:

- `siteName`: the defaults global's mapped site-name field, when published and non-blank;
- `title`: the stored SEO title unchanged; otherwise the entry title inserted at the first `%s` of the defaults global's title template when that template is non-blank and contains `%s`; otherwise `{entry title} | {siteName}` when a site name exists; otherwise the entry title. Insertion SHALL be literal, so `$` sequences in titles have no special meaning;
- `description`: the stored SEO description, then the model's mapped description field, then the defaults global's mapped description field, otherwise absent;
- `image`: the stored SEO image, then the model's mapped media field, then the defaults global's mapped image field, otherwise absent; the image SHALL be the resolved media with its effective alt text (media alt, otherwise `""`);
- `canonical`: the stored SEO canonical, otherwise the site URL of the entry's path, otherwise absent;
- `robots`: `noindex, nofollow` when indexing is off; otherwise `noindex, follow` when the stored group has `noindex: true`; otherwise absent.

An entry of a model without SEO, a model absent from the export `seo` section, an export without a defaults global, and an unpublished defaults global SHALL resolve through the remaining steps without failing.

#### Scenario: Stored SEO values win
- **WHEN** an entry has a stored SEO title, description, image and canonical
- **THEN** the resolved title, description, image and canonical are those values and the title is not passed through the template

#### Scenario: The title template applies
- **WHEN** an entry titled `Hello` has no SEO title and the published defaults global has the title template `%s — Acme`
- **THEN** the resolved title is `Hello — Acme`

#### Scenario: The default template uses the site name
- **WHEN** an entry titled `Hello` has no SEO title, the defaults global has no title template and its site name is `Acme`
- **THEN** the resolved title is `Hello | Acme` and `siteName` is `Acme`

#### Scenario: No defaults global is published
- **WHEN** the export names a defaults global that is not published and the entry has no stored SEO values
- **THEN** the title is the entry title, and the description, image and site name are absent

#### Scenario: A template without a placeholder
- **WHEN** the defaults global's title template is `Acme` and its site name is `Acme Inc`
- **THEN** an entry titled `Hello` resolves to `Hello | Acme Inc`

#### Scenario: A replacement pattern in the title
- **WHEN** an entry titled `Save $& now` is formatted by the template `%s | Acme`
- **THEN** the resolved title is `Save $& now | Acme`

#### Scenario: Description falls back to the mapped field
- **WHEN** a model maps `summary` as its description, the entry has no SEO description and its `summary` is `  Short\n  intro  `
- **THEN** the resolved description is `Short intro`

#### Scenario: Description falls back to the site default
- **WHEN** the entry has no SEO description, its mapped field is blank and the defaults global's description is `Site intro`
- **THEN** the resolved description is `Site intro`

#### Scenario: Image falls back past non-image media
- **WHEN** the entry has no SEO image, its mapped media field names a PDF and the defaults global's image names a resolved PNG with alt text `Logo`
- **THEN** the resolved image is the PNG with alt `Logo`, its URL, width and height

#### Scenario: Unresolved media are skipped
- **WHEN** the stored SEO image names media missing from the export's media dictionary
- **THEN** the resolver continues with the mapped field and the site default and does not fail

#### Scenario: Canonical from the site URL
- **WHEN** the entry at `/blog/hello` has no SEO canonical and the site URL is `https://example.com/`
- **THEN** the resolved canonical is `https://example.com/blog/hello`

#### Scenario: No site URL and no stored canonical
- **WHEN** no site URL is configured and the entry has no SEO canonical
- **THEN** the canonical is absent

#### Scenario: An entry excluded from indexing
- **WHEN** the entry's stored group has `noindex: true` and indexing is on
- **THEN** `robots` is `noindex, follow`

#### Scenario: Indexing switched off
- **WHEN** indexing is off
- **THEN** every entry resolves `robots` to `noindex, nofollow`, whatever its stored `noindex`

#### Scenario: A model without SEO
- **WHEN** an entry of a model that does not enable SEO is resolved with a published defaults global
- **THEN** the title uses the template, the description and image come from the site defaults, and the canonical comes from the site URL

### Requirement: The SDK renders sitemap and robots text from the published site
The SDK SHALL export a sitemap renderer and a robots renderer that read only the site view. The sitemap renderer SHALL return `undefined` when the site has no URL. Otherwise it SHALL return a UTF-8 XML `urlset` in the sitemaps.org 0.9 namespace with one `url` element per published entry in path order, holding the entry's absolute URL as `loc` and its `publishedAt` timestamp as `lastmod`, with XML special characters escaped. It SHALL leave out entries whose stored group has `noindex: true`, entries whose stored SEO canonical differs from their own absolute URL, and entries rejected by an optional caller-supplied filter. Globals SHALL never appear. The robots renderer SHALL return `User-agent: *` and `Disallow: /` when indexing is off. Otherwise it SHALL return `User-agent: *` and `Allow: /`, followed by a `Sitemap:` line with the absolute URL of `sitemap.xml` under the site URL when a site URL exists.

#### Scenario: Sitemap with excluded entries
- **WHEN** the site URL is `https://example.com/` and the export holds `/` (published `2026-10-01T00:00:00.000Z`), `/blog/a` with `noindex`, and `/blog/b` whose canonical is `https://other.example/b`
- **THEN** the sitemap contains exactly one `url` with `loc` `https://example.com/` and `lastmod` `2026-10-01T00:00:00.000Z`

#### Scenario: A canonical equal to the own URL
- **WHEN** an entry's stored canonical equals its own absolute URL
- **THEN** the entry is listed in the sitemap

#### Scenario: Caller filter
- **WHEN** the caller passes a filter that accepts only entries of model `posts`
- **THEN** only published, indexable posts are listed

#### Scenario: No site URL
- **WHEN** the site has no URL
- **THEN** the sitemap renderer returns `undefined`, and the robots text allows everything without a `Sitemap:` line

#### Scenario: Robots with a site URL
- **WHEN** the site URL is `https://example.com/blog/` and indexing is on
- **THEN** the robots text allows everything and names `https://example.com/blog/sitemap.xml`

#### Scenario: Robots with indexing off
- **WHEN** indexing is off and a site URL is configured
- **THEN** the robots text disallows everything and has no `Sitemap:` line
