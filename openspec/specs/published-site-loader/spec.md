# published-site-loader Specification

## Purpose
Defines the framework-neutral loader that turns the authenticated published build export into a validated, published-only site view, so every Lace site reads content, checks consistency, and reports failures the same way.

## Requirements

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

### Requirement: Static mode reads one export per loader
By default the loader SHALL read the build export once, as one complete page
traversal, and return the same site view to every later and concurrent call.
Concurrent first calls SHALL share one traversal. A failed traversal SHALL NOT
be cached; the next call SHALL start a new one.

#### Scenario: A static build renders many pages
- **WHEN** a static-mode loader is called several times, including
  concurrently, for an export of three pages
- **THEN** exactly one traversal of three page requests is made, and every
  call receives the same site view

#### Scenario: A static read fails transiently
- **WHEN** the first call fails because the API is unavailable during the
  second page and a later call succeeds
- **THEN** the later call starts a new traversal from the first page and
  returns the site view

### Requirement: Revalidate mode issues conditional reads
When revalidation is enabled, the loader SHALL issue a first-page build-export
request on every call, sending the entity tag of the last successful export.
Concurrent calls SHALL share one in-flight read.

- A `304` response SHALL return the previous site view without further page
  requests.
- A changed first page SHALL start a complete traversal whose assembled export
  replaces the view.
- A failed revalidation SHALL fail that call and keep the previous entity tag
  for the next call.
- A `304` received without any previous export SHALL fail with
  `invalid_export`.

The loader SHALL preserve the validator from the latest successful first-page
`200` or `304`, including its weak prefix, for subsequent requests. The
standard published-site and Astro loaders SHALL support normal fetch
compression negotiation without a custom fetch override.

#### Scenario: A publication appears on reload
- **WHEN** a revalidating loader returned version 3 and the API now serves version 4
- **THEN** the next call sends the version-3 entity tag, follows every
  version-4 page and returns the version-4 view

#### Scenario: Unchanged content is reused
- **WHEN** a revalidating loader calls the API and receives `304`
- **THEN** it returns the previous site view without parsing a response body
  or requesting another page

#### Scenario: Concurrent dev requests share one read
- **WHEN** several calls start while a revalidation read is in flight
- **THEN** they all resolve from that single read

#### Scenario: Development reloads through compression
- **WHEN** a standard loader receives a compressed export with a weak tag, then a matching `304`, then a new publication
- **THEN** reload reuses the prior site on `304` and replaces it with the new publication on `200` without overriding fetch

### Requirement: Expected published version is enforced
When an expected published version is configured, the loader SHALL compare
it with the first page's version before requesting any continuation page. On
a difference it SHALL fail with `version_mismatch`, naming both versions. In
this mode the loader SHALL disable traversal restarts. A
`BUILD_EXPORT_VERSION_CHANGED` failure on any page SHALL fail with
`version_mismatch`, naming the expected and the received version.

Without an expected version, any export version SHALL be accepted, and
traversal restarts SHALL be enabled. When restarts are exhausted, the loader
SHALL fail with `version_mismatch`, stating that published content kept
changing during the export.

#### Scenario: Content changes during a build
- **WHEN** the expected published version is 7 and the first page reports
  version 8
- **THEN** the loader fails with `version_mismatch`, requests no continuation
  page and returns no site view

#### Scenario: A publication lands between pages of an expected build
- **WHEN** the expected version is 7, the first page reports 7 and the second
  page fails with `BUILD_EXPORT_VERSION_CHANGED` for actual version 8
- **THEN** the loader fails with `version_mismatch` naming 7 and 8, without
  restarting

#### Scenario: A development export keeps changing
- **WHEN** no expected version is configured and two traversals are each
  interrupted by `BUILD_EXPORT_VERSION_CHANGED`
- **THEN** the loader fails with `version_mismatch` explaining that content
  kept changing

### Requirement: The site view exposes only published content
The loader SHALL return a site view with the export `version` and lookups by resolved path, by model key, and by model key and slug, plus a public media URL builder and media lookups. Each entry SHALL expose its identifier, model key, CMS-resolved path, optional slug, title, publication time, field values, and blocks ordered by position, all taken from the published entry of the export; the view SHALL expose no draft snapshot, draft-shaped property, or editorial metadata. Lookups SHALL return no entry rather than fail when nothing matches, and listing an unknown model SHALL return an empty list. Entries listed by model SHALL be ordered by path. The view SHALL use each entry's CMS-resolved path as-is and SHALL NOT derive routes from patterns or depend on particular model keys. The site and each entry SHALL expose `media(id)`, returning the resolved media item of the export's media dictionary or nothing for an unknown ID, and `image(mediaId, usageAlt?)`, returning that item with its `alt` replaced by the effective alt text: the usage alt text when it is non-blank, otherwise the media item's alt text, otherwise an empty string. When a public media base URL is configured, resolved media URLs and the media URL builder SHALL use it; otherwise resolved media URLs SHALL be the URLs from the export, and the media URL builder SHALL return the export URL for a known ID and an API-base URL for an unknown ID. The view SHALL be immutable.

#### Scenario: A page looks up its entry by path
- **WHEN** a site requests the entry at `/` and a published entry has that resolved path
- **THEN** the view returns that entry's published title, publication time, fields, and ordered blocks and no draft data

#### Scenario: A route is not published
- **WHEN** a site requests a path, slug, or model with no published entry
- **THEN** the path and slug lookups return no entry and the model listing is empty

#### Scenario: Any model key can be listed
- **WHEN** an export contains published entries of a model named `recipes`
- **THEN** listing `recipes` returns those entries ordered by path without any loader change

#### Scenario: Media URLs use the public origin
- **WHEN** a public media base URL differs from the API base URL
- **THEN** media URLs from the view, including resolved media items, use the public media base URL and contain no build token

#### Scenario: Media URLs follow the export without a public origin
- **WHEN** no public media base URL is configured and the export's media dictionary gives an item the URL on the API's public origin
- **THEN** `media(id).url` and `mediaUrl(id)` both return that URL

#### Scenario: Usage alt text overrides media alt text
- **WHEN** a site calls `image(id, "Team at work")` for media whose alt text is `Office`
- **THEN** the returned item has alt `Team at work`, and `image(id)` returns alt `Office`

#### Scenario: No alt text anywhere
- **WHEN** a site calls `image(id)` for media without alt text
- **THEN** the returned item has an empty alt text

### Requirement: Inconsistent exports are rejected
The loader SHALL fail with `invalid_export` when an export contains two entries with the same path, two entries of the same model with the same slug, two globals with the same model key, or a global whose model key is also the model key of an entry, naming the conflicting path, model and slug, or model key. An export whose entries, globals or media dictionary violate the public contract SHALL fail as a contract violation before a site view exists.

#### Scenario: Duplicate slugs in a model
- **WHEN** two published entries of model `posts` share the slug `hello`
- **THEN** the loader fails with `invalid_export` naming `posts` and `hello`

#### Scenario: Duplicate paths across models
- **WHEN** two published entries of different models resolve to the same path
- **THEN** the loader fails with `invalid_export` naming that path

#### Scenario: Duplicate global keys
- **WHEN** an export lists two globals with model key `settings`, or a global
  and an entry share the model key `settings`
- **THEN** the loader fails with `invalid_export` naming `settings`

### Requirement: Loader failures carry stable codes and hints
Loader failures SHALL be SDK errors with one of these stable codes:

- `missing_configuration`;
- `rejected_token` for HTTP 401 or 403 from the build export;
- `api_unavailable` for transport failures, including timeouts;
- `version_mismatch`;
- `invalid_export`.

An export whose `formatVersion` is newer than the SDK supports SHALL fail with
`invalid_export`. Its message SHALL name both format versions and advise
upgrading `@lacecms/sdk`. Other SDK failures, such as other HTTP errors and
other contract violations, SHALL propagate unchanged. Messages SHALL be
project-neutral, SHALL never contain the build token, and SHALL preserve the
underlying failure as the cause. A caller-supplied hint for a code SHALL be
appended to that code's message.

#### Scenario: The API rejects the token
- **WHEN** the build export responds with HTTP 401
- **THEN** the loader fails with `rejected_token`, the message omits the token, and the HTTP error is the cause

#### Scenario: A generated project names its commands
- **WHEN** a loader created with a hint for `api_unavailable` cannot reach the API
- **THEN** the `api_unavailable` message ends with that hint

#### Scenario: An unrelated HTTP failure
- **WHEN** the build export responds with HTTP 500 and a valid error envelope
- **THEN** the loader rethrows the SDK HTTP error unchanged

#### Scenario: The API serves a newer export format
- **WHEN** the API returns an export with `formatVersion: 2` to a loader whose
  SDK supports format 1
- **THEN** the loader fails with `invalid_export`, the message advises
  upgrading `@lacecms/sdk`, and the SDK contract error is the cause

### Requirement: The site view exposes published globals
The site view SHALL expose `global(modelKey)`, returning the published global
of that model from the export or nothing when the global is unpublished,
unknown or names a page or collection. A published global SHALL expose its
identifier, model key, publication time, field values and blocks ordered by
position, and the same `media(id)` and `image(mediaId, usageAlt?)` lookups and
media URL rules as entries; it SHALL expose no path, slug, title, draft or
editorial metadata and SHALL be immutable. Globals SHALL never appear in path,
slug or model listings.

#### Scenario: A layout reads site settings
- **WHEN** an export contains the published `settings` global with a
  `siteName` field and a logo media field
- **THEN** `site.global("settings")` returns its fields and `image()` resolves
  the logo with its effective alt text

#### Scenario: A global was never published
- **WHEN** the export has no `settings` global
- **THEN** `site.global("settings")` returns nothing and building continues

#### Scenario: Globals are not routes
- **WHEN** an export contains a published global
- **THEN** no path lookup or model listing returns it

### Requirement: Published entries pass stored SEO values through
A `PublishedEntry` SHALL expose `seo` exactly as the export carries it: the
stored values with `null` for unset values, for entries of SEO-enabled models,
and `undefined` otherwise. The loader SHALL not resolve fallbacks or apply
site defaults; that is the SEO resolver's responsibility.

#### Scenario: Entry with SEO
- **WHEN** the export entry for `/blog/hello` carries
  `seo: {title: "Hello", description: null, image: null, canonical: null, noindex: true}`
- **THEN** `site.byPath("/blog/hello").seo` equals that object

#### Scenario: Entry without SEO
- **WHEN** an export entry has no `seo` key
- **THEN** the published entry's `seo` is `undefined`

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

### Requirement: Resolved media carry a build source URL
Each resolved media item of the site view SHALL carry `sourceUrl`, the public media URL of the item under the configured API base URL (the origin the build already reads the export from), independent of the public media base URL and of the export's media URL. The build token SHALL never appear in `sourceUrl`. The loader SHALL accept an `optimizeImages` option, default `true`; when it is `false`, resolved media items SHALL carry no `sourceUrl`, and every other view value SHALL be unchanged. The media item returned by `image(mediaId, usageAlt?)` SHALL carry the same `sourceUrl` as `media(mediaId)`.

#### Scenario: Build source differs from the public URL
- **WHEN** the API base URL is `http://api:8787/lace` and the public media base URL is `https://cms.example.com`
- **THEN** `media(id).url` is `https://cms.example.com/api/v1/public/media/<id>` and `media(id).sourceUrl` is `http://api:8787/lace/api/v1/public/media/<id>`

#### Scenario: Build source without a public origin
- **WHEN** no public media base URL is configured
- **THEN** `media(id).url` is the export's URL and `media(id).sourceUrl` is the item's public media URL under the API base URL

#### Scenario: Optimization switched off
- **WHEN** a loader is created with `optimizeImages: false`
- **THEN** no resolved media item or `image()` result carries `sourceUrl`, and URLs, dimensions and alt texts are unchanged

#### Scenario: Token stays out of build sources
- **WHEN** a view is built with a build token
- **THEN** no `sourceUrl` contains the token
