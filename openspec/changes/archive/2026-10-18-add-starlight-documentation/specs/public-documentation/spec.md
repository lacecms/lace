## Purpose

Provide accessible public guidance for using and operating Lace, with durable locale/version identities and distinct product, contributor and internal documentation entry points.

## ADDED Requirements

### Requirement: Public documentation works independently of a CMS installation

The documentation SHALL be a separately runnable and buildable static application. Reading or building it SHALL NOT require a running Lace API, database, object store, Docker, credentials or access to a private service. It SHALL provide navigable pages, page headings and contents, code examples, light/dark appearance, keyboard-accessible navigation, responsive layouts, local site search and links to its repository/editable source. No CMS credentials SHALL be requested or embedded in the output.

#### Scenario: Standalone documentation build
- **WHEN** a contributor installs frozen workspace dependencies and builds the documentation without starting the CMS or supplying credentials
- **THEN** the static output is produced and its pages, resources and search work under the configured deployment base

#### Scenario: Keyboard and mobile reader
- **WHEN** a reader uses keyboard navigation or a narrow mobile viewport
- **THEN** navigation, search and page content remain usable with visible focus and without page-level horizontal overflow; long code examples can scroll within their own region

### Requirement: Documentation identities include language and version

Published documentation URLs SHALL carry explicit language and version segments. The initial English latest section SHALL be `/en/latest/` relative to the deployment base. The site root SHALL direct readers to that section. The initial supported language/version pair SHALL be exactly `en`/`latest`, with target CMS version `0.1.0-alpha.6`. Pages SHALL identify the current documentation target and that latest follows `main`, without inferring publication or deployment verification from that label.

Locale/version definitions SHALL be explicit and validated independently of page prose. The structure SHALL allow another locale or version section to be registered and built without renaming existing English/latest routes or rewriting shared page templates. Unsupported pairs SHALL NOT appear in navigation, selectors or search as available documentation. A missing requested page SHALL NOT silently display a different version or language as if it matched.

#### Scenario: Initial entry and identity
- **WHEN** a reader opens the documentation root
- **THEN** the reader reaches the English latest landing page and can identify `0.1.0-alpha.6` as the target of documentation following `main`

#### Scenario: Additional variant fixture
- **WHEN** verification registers fixture content for an additional locale and a fixed version
- **THEN** those pages build with distinct locale/version routes while existing `/en/latest/` routes retain their identities

#### Scenario: Unsupported version
- **WHEN** a reader requests a nonexistent version or translation
- **THEN** the site returns its static not-found behavior rather than substituting latest or English content without disclosure

#### Scenario: Only one variant is available
- **WHEN** the initial production site is built
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

All existing repository `docs/**` materials SHALL remain maintained internal engineering documents; this change SHALL NOT delete them merely because related public pages are added or publish the directory wholesale. Public guidance SHALL live in the documentation application, internal architecture/specs SHALL retain their existing authority, and generated-project guides SHALL remain version-matched consumer assets. Internal and public overlapping guidance SHALL use an explicit topic/source map so future behavior changes identify both audiences requiring review. Internal-only edits SHALL NOT change public output unless an explicitly declared public build input is also changed.

#### Scenario: Public guide derives from internal material
- **WHEN** a guide is adapted for the public site
- **THEN** the internal original remains available, public prose is appropriate to users, and the ownership map identifies the maintained source and related audience-specific documents

#### Scenario: Internal report changes
- **WHEN** only an internal verification report or architecture document is edited
- **THEN** its content does not automatically become a public page or resource
