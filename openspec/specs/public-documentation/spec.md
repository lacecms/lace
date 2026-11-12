# Public Documentation Specification

## Purpose

Provide accessible public guidance for using and operating Lace, with durable locale/version identities and distinct product, contributor and internal documentation entry points.

## Requirements

### Requirement: Public documentation works independently of a CMS installation

The documentation SHALL be a separately runnable and buildable static application. Reading or building it SHALL NOT require a running Lace API, database, object store, Docker, credentials or access to a private service. It SHALL provide navigable pages, page headings and contents, code examples, light/dark appearance, keyboard-accessible navigation, responsive layouts, local site search and links to its repository/editable source. No CMS credentials SHALL be requested or embedded in the output.

#### Scenario: Standalone documentation build
- **WHEN** a contributor installs frozen workspace dependencies and builds the documentation without starting the CMS or supplying credentials
- **THEN** the static output is produced and its pages, resources and search work under the configured deployment base

#### Scenario: Keyboard and mobile reader
- **WHEN** a reader uses keyboard navigation or a narrow mobile viewport
- **THEN** navigation, search and page content remain usable with visible focus and without page-level horizontal overflow; long code examples can scroll within their own region

### Requirement: Documentation identities include language and version

Published documentation URLs SHALL carry explicit language and version segments. The initial English latest section SHALL be `/en/latest/` relative to the deployment base. The site root SHALL direct readers to that section. The supported language/version pair SHALL remain exactly `en`/`latest`, with target CMS version `0.1.0-rc2`. Pages SHALL identify the current documentation target and that latest follows `main`, without inferring publication or deployment verification from that label.

Locale/version definitions SHALL be explicit and validated independently of page prose. The structure SHALL allow another locale or version section to be registered and built without renaming existing English/latest routes or rewriting shared page templates. Unsupported pairs SHALL NOT appear in navigation, selectors or search as available documentation. A missing requested page SHALL NOT silently display a different version or language as if it matched.

#### Scenario: Initial entry and identity
- **WHEN** a reader opens the documentation root
- **THEN** the reader reaches the English latest landing page and can identify `0.1.0-rc2` as the target of documentation following `main`

#### Scenario: Additional variant fixture
- **WHEN** verification registers fixture content for an additional locale and a fixed version
- **THEN** those pages build with distinct locale/version routes while existing `/en/latest/` routes retain their identities

#### Scenario: Unsupported version
- **WHEN** a reader requests a nonexistent version or translation
- **THEN** the site returns its static not-found behavior rather than substituting latest or English content without disclosure

#### Scenario: Only one variant is available
- **WHEN** the production site is built
- **THEN** it publishes only English latest content and exposes no redundant or empty locale/version selectors

### Requirement: Current user journeys have complete maintained guidance

The initial site SHALL contain substantive English guidance for: product overview and prerequisites; project creation and site modes; first-admin setup and first publication; content configuration including pages, collections, globals, fields, composite fields, form organization, SEO, blocks and configuration synchronization; editor workflows including rich text and media; users/roles and account operations; Astro integration, SDK and installed block source; Docker/VPS and Cloudflare deployment; updates, migrations, backups, recovery, build diagnostics and tokens; CLI and environment/configuration reference; and access to existing API documentation.

Guidance SHALL distinguish generated-consumer commands from engine-checkout commands, draft save from CMS publication and site deployment, Node/VPS from Cloudflare setup, minimum tool eligibility from tested pins, and target version from released artifact availability. It SHALL remain consistent with accepted capability behavior and maintained compatibility guidance. The site SHALL provide a downloadable committed OpenAPI document and explain enabling the installation's existing `/api/docs`; it SHALL NOT require a live API to render reference pages or introduce a second interactive request console.

#### Scenario: New user completes onboarding
- **WHEN** a reader follows the getting-started journey for a generated project
- **THEN** the guide explains prerequisites, matching artifacts, setup, content synchronization, publication and site visibility using commands appropriate to that generated layout

#### Scenario: Operator chooses a runtime
- **WHEN** a reader follows the deployment and recovery material
- **THEN** separate Node/VPS and Cloudflare instructions explain persistent data, secrets, builds, backup/restore and upgrade boundaries without claiming unverified real deployments

#### Scenario: API reference without installation
- **WHEN** a reader opens API guidance without a running CMS
- **THEN** the overview and OpenAPI download work, and interactive usage is described as an optional feature of the reader's own installation

### Requirement: Product and contributor entry points serve distinct audiences

The root `README.md` SHALL present concise English product information: what Lace is, its intended users and core capabilities, supported deployment choices, current maturity, and a prominent public-documentation link to English latest. It SHALL link to a separate root `DEVELOPMENT.md` for development of the CMS itself. It SHALL NOT remain the full contributor setup/acceptance/operations manual or advertise unsupported features or stable-release readiness.

`DEVELOPMENT.md` SHALL preserve or link the useful existing README contributor guidance, including prerequisites, local lifecycle, first-admin setup, content sync/live-site behavior, acceptance, quality gates and troubleshooting. It SHALL identify the maintained `docs/` materials as internal engineering documentation and explain the documentation application's local development/check commands.

#### Scenario: Prospective adopter reads README
- **WHEN** a prospective user opens the repository root README
- **THEN** the user can understand the product and maturity and directly reach the public docs without reading engine-development instructions

#### Scenario: Existing contributor follows development link
- **WHEN** a contributor opens the linked development guide
- **THEN** the existing engine setup and verification procedures remain discoverable with valid internal links after their move from README

### Requirement: Public and internal documentation retain explicit ownership

Repository `docs/**` materials SHALL remain maintained internal engineering documents listed in the internal documentation index with a status; the public site SHALL NOT publish the directory wholesale. Public guidance SHALL live in the documentation application, internal architecture/specs SHALL retain their existing authority, and generated-project guides SHALL remain version-matched consumer assets of the project template that are not published as site pages.

Each user-facing topic SHALL be described in exactly one place. A `docs/*.md` note other than the two indexes SHALL either be promoted or remain internal:

- A promoted note's user guidance SHALL move into public pages. When no engineering content remains, the note SHALL be deleted; the index SHALL record the deleted file and the public page that replaced it.
- A note that remains SHALL carry only engineering content (implementation invariants, verification, release or real-account procedures, contributor workflows). Its index row SHALL have status `internal note` and SHALL name the public page that owns its user-facing topic, if any. It SHALL link to that page instead of restating its procedures, settings or examples.

An internal document MAY be consolidated into another or deleted only when the index and every document that linked to it are updated in the same change, so that no link or ownership row names a missing file. The topic map SHALL name, for each public section, the internal documents and specifications that a behavior change obliges a reviewer to check. Internal-only edits SHALL NOT change public output unless an explicitly declared public build input is also changed.

#### Scenario: Public guide derives from internal material
- **WHEN** user guidance from an internal note is adapted for the public site
- **THEN** the public page holds the guidance, the note keeps only engineering content or is deleted, the index records the outcome and the public owner, and the topic map names the remaining internal sources

#### Scenario: Internal report changes
- **WHEN** only an internal verification report or architecture document is edited
- **THEN** its content does not automatically become a public page or resource

#### Scenario: Internal document is consolidated
- **WHEN** an internal document is merged into another and deleted
- **THEN** the index records the replacement, the ownership map and every linking document point at the replacement, and the link guard passes

#### Scenario: Reader looks for a procedure in an internal note
- **WHEN** a reader opens a remaining internal note whose topic has a public page
- **THEN** the note links to that page and does not repeat its steps, settings or examples

### Requirement: Public guidance covers image delivery
Public media, Astro integration and deployment guidance SHALL describe the accepted image formats and 10 MiB limit, original versus optimized delivery, image origin allowlisting and the site's image-service dependency, variant widths and animated GIF conversion, placeholder exceptions, opt-in lightbox, link precedence and safe updates to installed source. Deployment guidance SHALL explain upload proxy configuration, revalidating HTML, thirty-day immutable successful hashed assets and disposable persistent build caches for VPS and Pages where applicable. It SHALL distinguish database migration from content configuration synchronization and retain current routes. Public, internal and delivered generated guides SHALL be reviewed together according to the existing topic ownership map.

#### Scenario: Existing Astro consumer adopts images
- **WHEN** a reader connects a customized existing Astro site and adopts the image components
- **THEN** the guide explains matching dependencies, image configuration, conflict-aware component updates and synchronization before the next build without instructing blind source replacement

#### Scenario: Editor configures a linked gallery item
- **WHEN** an editor supplies a link while gallery lightbox is enabled
- **THEN** the guide explains that the link takes precedence and does not promise a lightbox on that linked item

#### Scenario: Operator follows deployment guidance
- **WHEN** an operator refreshes generated VPS or Pages deployment files
- **THEN** the guide distinguishes persistent application data from disposable caches and configuration checks from verified remote deployment

### Requirement: Public guidance covers presentation, links, collection queries and optional MCP
English/latest SHALL describe list presentation settings, video embeds, internal URL destinations and unavailable-link behavior, build-export format 2, draft collection-query options and optional OAuth MCP. Guidance SHALL preserve existing route identities and distinguish manual source/configuration adoption from managed-file upgrades. Deployment and operations pages SHALL describe canonical public origin and proxy configuration, disabled-by-default MCP activation, consent/revocation, supported Codex/Claude Code/Gemini CLI setup and role/scope limits: publication requires the separately consented `content:publish` scope and current role authority, and unpublication and deletion remain unavailable. Examples SHALL match shipped commands and SHALL NOT imply that preparation or a latest label proves registry publication or real deployment verification.

#### Scenario: Existing operator upgrades
- **WHEN** an operator on a supported release follows the upgrade and MCP guidance
- **THEN** the operator can identify coordinated package/image updates, source/configuration adoption, optional MCP activation with separately granted publication, and the matching backup requirement for rollback

#### Scenario: Assistant client setup
- **WHEN** an operator configures a supported MCP client from the documented setup
- **THEN** examples use the canonical endpoint and explicit permissions, explain sign-in/consent and revocation, and state that unpublication and deletion are unavailable through MCP

### Requirement: Public guidance covers content import
The public documentation SHALL contain an *Import content* page that explains,
for a generated project: issuing an import token in Settings (lifetime,
optional publishing, revocation), setting `LACE_IMPORT_TOKEN` for the shell
session only and never in `.env` or source control, choosing the origin with
`--url` for Node and the local Worker, the `--validate-only`, `--dry-run`,
`--publish`, `--overwrite`, `--state` and `--json` options, the plan's item
states, reruns and resume, edit protection and its conflicts, exit codes, and
the limits (images only, 10 MiB per file, upload rate limit, no deletion or
unpublication, package data at current block versions, CLI and server of the
same release). It SHALL include a format reference for package format v1 that
matches the shipped JSON Schema, and a guide for writing a converter from
another CMS: mapping models and blocks, stable keys, media files,
`$media`/`$entry` references, validating offline, and rerunning after fixes.
The CLI reference SHALL list `lace import` and the environment table SHALL list
`LACE_IMPORT_TOKEN`.

The documentation site SHALL publish a downloadable sample package for the
starter configuration: `lace-import.json` and original media files created for
the sample. The guide's sample JSON SHALL equal the published file. A root test
SHALL run `lace import --validate-only` on the sample against the starter
template configuration, which applies the format rules the JSON Schema is
generated from and the model rules.
The internal topic map SHALL record the page's internal sources.

#### Scenario: A reader writes a converter
- **WHEN** a reader follows the converter guide and the format reference
- **THEN** they can produce a package directory that `lace import
  --validate-only` accepts, using only documented fields and references

#### Scenario: The sample drifts
- **WHEN** the starter configuration, the format schema or the guide changes
  so that the published sample no longer validates or no longer equals the
  guide's JSON
- **THEN** the root test fails and names the sample

#### Scenario: A reader downloads the sample
- **WHEN** a reader opens the sample links on the published documentation
  site
- **THEN** `lace-import.json` and its media files are served without a running
  CMS

### Requirement: Public guidance covers conditional fields
The Content modeling section SHALL explain conditional fields for a generated
project: declaring `visibility` on models, group fields (including list items)
and block data; sibling `select` or `boolean` controllers, optional
controllers and defaults; the rejected forms (chains, self references,
non-sibling controllers, rules on settings, scalar or list descriptors, SEO
defaults naming a conditional field); that hidden fields are never required
but are still validated as drafts; that hidden values stay in drafts and are
omitted from published content, the public API and the build export; the
optional published value types for site code; and that changing rules is a
structural change synchronized like other model or block definition changes.
It SHALL include a complete example of a list item whose `kind` decides between
an image and a video URL, and SHALL state that block settings keep
`settingsVisibility`, which only hides controls.

The Editing content section SHALL explain that switching a controller hides
and shows fields without losing typed values, that hidden values are saved but
not published, that a hidden field with an invalid value stays shown until it
is fixed or cleared, and that revert to published restores only published
values, so hidden draft values are lost. The internal topic map SHALL record
the pages' internal sources.

#### Scenario: A reader adds a conditional field
- **WHEN** a reader follows the conditional-fields guidance in a generated project
- **THEN** they can declare a `visibility` rule that configuration accepts, synchronize it, see the admin hide and show the target, and read published content without hidden values

#### Scenario: A reader chooses between the two rules
- **WHEN** a reader wants a setting control to appear only for some layouts
- **THEN** the guidance directs them to `settingsVisibility` and explains that data `visibility` is the rule that changes requiredness and published content

### Requirement: Public guidance covers gallery video items
The public block reference SHALL describe the gallery block: item kinds, the fields that apply to images and to videos, the supported providers, the required accessible video title, playback and aspect ratio per item, captions without a media fallback for videos, and that the lightbox and links apply to images only. The Editing content section SHALL explain adding images through Add and videos through "Add Video", and switching an item's Type without losing typed values. The conditional-fields page SHALL name the built-in gallery as the shipped example of its list-item example. The Astro integration guidance SHALL explain the gallery video markup hooks and `GalleryVideo.css`, the ambient fallbacks and the WCAG 2.2.2 pause-control gap shared with `videoEmbed`, and how site code that copied the gallery component handles published items whose `media` is absent: check the item's `kind` and the presence of `media` before describing an image.

#### Scenario: A reader adds a video to a gallery
- **WHEN** a reader follows the editing guidance in a generated project with
  a gallery block
- **THEN** they add a video with "Add Video", fill its URL and title, choose
  ambient playback and a square ratio, publish, and see it in the built site

#### Scenario: A reader updates a copied gallery component
- **WHEN** a reader whose site copied and edited the gallery component follows
  the Astro integration guidance
- **THEN** they merge the current registry component and `GalleryVideo.css`,
  and their typed component compiles because it narrows items by `kind` and
  checks `media`

### Requirement: Upgrade guidance covers only the oldest supported release onward
English/latest, the delivered consumer guidance and the permanent compatibility guide SHALL describe upgrades from rc2 (`0.1.0-rc2`) and later releases only. The English/latest operations guidance and the delivered consumer guidance SHALL explain that an rc2 database already starts from the baseline migration and is upgraded by explicit forward migrations, without recreation, together with backup, coordinated package, image and source adoption, configuration synchronization and a site rebuild for Node and Cloudflare, and backup-based rollback without promising a package-only downgrade. The permanent compatibility guide SHALL state the supported upgrade origin, that an rc2 database is upgraded in place by forward migrations, and the rollback boundary, and SHALL link to the English/latest upgrade procedure instead of repeating its steps. All of them SHALL state that installations older than rc2 are not supported and that their pre-baseline databases are refused. Sections that describe upgrades from rc1 or between older releases, or the adoption of features already present in rc2, SHALL NOT remain. Documentation SHALL preserve English/latest routes and SHALL NOT claim publication or real-deployment readiness from preparation alone. The reviewed changelog SHALL provide concise release notes linked to the permanent upgrade guide.

#### Scenario: Operator on the oldest supported release upgrades
- **WHEN** an operator on rc2, the oldest supported release, follows the upgrade guidance
- **THEN** they can identify the backup, coordinated package and image update, forward database migration without recreation, configuration synchronization, site rebuild and rollback boundary

#### Scenario: Reader looks for unsupported upgrade steps
- **WHEN** a reader searches the public operations, deployment, reference and Astro integration pages or the compatibility guide
- **THEN** no rc1 database recreation, alpha-by-alpha upgrade or pre-rc2 feature-adoption section remains, and the guidance names rc2 as the oldest supported release

#### Scenario: Reader opens the compatibility guide to upgrade
- **WHEN** a reader follows the changelog link to the permanent compatibility guide
- **THEN** it states the supported origin, in-place forward migration, refusal of older databases and the rollback boundary, and links to the English/latest upgrade steps rather than repeating them

### Requirement: Reference pages list every public interface item

The Reference section SHALL let a reader reach, by name, every item of the shipped public interface of the documented target:

- every `lace` command and every long flag shown by `lace --help`, and every `create-lace` mode and flag shown by `create-lace --help`, with the command's purpose, targets, exit codes and a pointer to the guide that uses it;
- every `LACE_*` setting declared by the generated project's configuration files (`.env.example`, `worker/.dev.vars.example`, `worker/wrangler.jsonc`, `docker-compose.yml`, `docs/cloudflare-operator.env.example`) and every `LACE_*` name the CLI help names, with the runtime that reads it, whether it is secret, and its default or required state;
- every option accepted by `defineConfig`, `definePage`, `defineCollection`, `defineGlobal` and `defineBlock` (including collection list options and SEO inputs), and every field builder of `field`;
- every path of the committed OpenAPI document with its methods, audience (public, setup, account or admin) and purpose;
- every MCP tool with its required scope, and every MCP scope.

A root test SHALL derive each list from the shipped source of truth (built CLI help, generated project templates, declared configuration input types and the field builder object, the committed OpenAPI document and the contracts' MCP tool argument schemas) and SHALL fail, naming each missing item and its kind, when a Reference page does not mention it. The test SHALL NOT keep its own copy of these lists.

#### Scenario: A new CLI flag is added without documentation
- **WHEN** a change adds a flag to `lace import` and leaves the Reference pages unchanged
- **THEN** the reference test fails and names the flag as a missing CLI item

#### Scenario: A new REST path is added without documentation
- **WHEN** the committed OpenAPI document gains a path that no Reference page mentions
- **THEN** the reference test fails and names the path

#### Scenario: A generated setting is added without documentation
- **WHEN** the generated `.env.example` declares a new `LACE_*` setting that no Reference page mentions
- **THEN** the reference test fails and names the setting

#### Scenario: Reader looks up a configuration option
- **WHEN** a reader searches the Reference section for `removedFields`
- **THEN** a Reference page explains what the option does, which definitions accept it and that it is a temporary synchronization hint

### Requirement: Pages follow a declared template

Every English/latest page SHALL declare a kind: `overview`, `guide` or `reference`. Every page SHALL state its purpose in its description. A `guide` page SHALL open its body with a short purpose paragraph, SHALL have *Before you start* as its first second-level section listing prerequisites (or stating that none apply), SHALL have at least one task section after it, and SHALL end with a *Reference* section that links to at least one Reference page. A `reference` page SHALL live in the Reference section. An `overview` page SHALL introduce and link its section's pages without task sections. The documentation check SHALL fail and name the page and the missing or misplaced part when a page violates its kind.

#### Scenario: Guide without prerequisites
- **WHEN** a guide page's first second-level section is not *Before you start*
- **THEN** the documentation check fails and names the page and the missing section

#### Scenario: Guide without a reference link
- **WHEN** a guide page's last section is *Reference* but links to no Reference page
- **THEN** the documentation check fails and names the page

#### Scenario: Unknown kind
- **WHEN** a page declares no kind or a kind other than `overview`, `guide` or `reference`
- **THEN** the documentation check fails and names the page

### Requirement: Pages state the release they were verified against

Every English/latest page SHALL declare the Lace release it was last verified against, and its footer SHALL display "Verified against" followed by that version. The documentation check SHALL accept only the current release `version` of the repository release metadata or one of its published versions that is not an alpha release, and SHALL fail naming the page otherwise. A page whose content is changed or re-checked against the implementation SHALL record the current release `version`. The footer SHALL NOT claim that artifacts are published or that a deployment was verified.

#### Scenario: Page audited in the current cycle
- **WHEN** a page is checked against the implementation while the release metadata `version` is `0.1.0-rc2`
- **THEN** it declares `0.1.0-rc2` and its footer reads "Verified against 0.1.0-rc2"

#### Scenario: Unknown or alpha version
- **WHEN** a page declares a version that is neither the current release version nor a non-alpha published version, or declares an alpha version
- **THEN** the documentation check fails and names the page and the value

#### Scenario: Release selected after verification
- **WHEN** a later release becomes the current `version` and the page is not re-checked
- **THEN** the page still builds and its footer keeps the earlier published version it was verified against

### Requirement: Public guidance covers delivered product features

English/latest SHALL contain a page or a section, reachable from its section's navigation, for each of: content import; media tags in the media library; conditional fields; MCP setup with separately consented publication; configured collection queries for developers (configuration), editors (admin list search, filters and sort) and API consumers; the default collection sort; route-less collections; internal URL links; video embeds and gallery video items; gallery item placement and image size; and the editor's block controls (collapse and expand all, hidden blocks, block settings). Each SHALL match the accepted behavior of its owning capability and SHALL link to the Reference page that lists its settings, options, commands or endpoints.

#### Scenario: Developer adds a route-less collection
- **WHEN** a reader follows the content-modeling guidance for a collection without `route`
- **THEN** they learn that its entries have no slug, path or SEO group, how site code reads them, and which Reference entries describe `route`

#### Scenario: Editor tags media
- **WHEN** an editor follows the media guidance
- **THEN** they can add, remove and filter by tags in the media library without consulting an internal note

#### Scenario: Developer places gallery items
- **WHEN** a reader follows the gallery guidance
- **THEN** they learn the `placement` values, that they act in grid mode only, and the image `size` choices
