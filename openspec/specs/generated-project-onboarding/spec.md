# Generated Project Onboarding

## Purpose

Defines the minimal local consumer onboarding and published-content rendering delivered in generated Lace projects before alpha release preparation.

## Requirements

### Requirement: Local onboarding documents the supported complete sequence
Generated projects SHALL document generation, dependency installation, environment configuration, explicit migrations and content sync, one-time bootstrap, first-admin creation, login, build-token creation, publication, editable Astro development, static build and Compose operation using packaged runtimes without engine source. First-admin instructions SHALL direct consumers to obtain an operator-issued one-time token with the supported bootstrap command, open `/admin/`, and complete the browser setup form before ordinary sign-in. They SHALL retain a placeholder-only API alternative with the exact `POST /api/v1/setup/admin` endpoint and `token`, `email`, and `password` fields, explain the one-hour token expiry and 12-character password minimum, and cover expired-token reissue, interrupted retries with the same token/email, and completed setup remaining closed. Documentation SHALL distinguish setup tokens, build tokens and passwords, supply no usable credentials, and describe preservation of content when stopping services.

#### Scenario: Fresh consumer follows local instructions
- **WHEN** a consumer has compatible packages/images and follows the generated operations guide
- **THEN** they can create the first administrator through the browser with token, email and password (or the documented setup API alternative), then sign in at /admin/, publish content and build the site without an engine checkout or undocumented request

#### Scenario: Setup is complete or token expired
- **WHEN** a consumer attempts bootstrap after setup completion or uses an expired setup token
- **THEN** the guide explains that completed setup refuses bootstrap and expired setup requires a newly issued token, without suggesting default credentials

### Requirement: Generated starter renders published exports with owned safe renderers
The generated home and posts models SHALL permit all five built-in blocks. The site SHALL load published content through the packaged published-site loader and the Astro adapter's server-only loader glue from a user-owned loader file, and SHALL render blocks and rich text through the adapter's block-list and rich-text components with a generated block map file and user-owned registry block components. It SHALL contain no site-local loader, block-parsing, or rich-text allowlist code. The site SHALL derive the home route from the published entry at `/` and blog routes from published `posts` entries by slug, using one validated authenticated published export per static build, preserving block order, safe structural rich-text rendering and stable entry, block and part styling hooks. In Astro development the site SHALL revalidate that export with its entity tag on each render so published changes to existing routes appear on reload, and post pages SHALL read the current published entry for their slug rather than route data cached at startup. Block components, pages, layout, styles, and the loader file SHALL be user-owned. Unknown blocks SHALL fail with model, entry and block identifiers. Missing home, unavailable API and rejected/missing build credentials SHALL produce actionable diagnostics naming the project's commands without revealing credentials; failed export reads SHALL be retryable. Drafts SHALL NOT affect static or dev output until publication. Build credentials SHALL NOT appear in static output, client bundles, or browser configuration.

#### Scenario: Complete published starter build
- **WHEN** the export contains published home and posts with hero, richText, image, quote and cta blocks
- **THEN** the generated site performs one export request and emits those blocks in order with stable styling hooks and public media links

#### Scenario: Unsupported or unsafe content
- **WHEN** a block lacks a renderer or rich text contains unsafe links or unsupported attributes
- **THEN** the build rejects the content with actionable context instead of emitting unsafe or partial markup

#### Scenario: Later draft exists
- **WHEN** a draft is edited after publication
- **THEN** the built title, route and blocks still come exclusively from the published export

#### Scenario: Development revalidation
- **WHEN** generated Astro dev renders again after an unchanged or changed publication
- **THEN** it sends a conditional export request, reuses the validated export on not-modified, and renders the newly published content after a change

#### Scenario: Static output secret scan
- **WHEN** the generated site is built with a build token
- **THEN** no file in the static output contains the token

### Requirement: Builder transport and media origins are independently configured
Generated Compose SHALL use an internal API URL for authenticated build exports and a separately configured browser-facing public API base URL for rendered media. Local Astro development/build SHALL support the same distinct settings and preserve intentional public URL path prefixes.

#### Scenario: Build inside Docker and view outside Docker
- **WHEN** the builder retrieves exports through http://api:3000/ and the public API is reachable at a host URL
- **THEN** emitted image URLs use that host URL and resolve outside Docker, while export requests use the internal URL

### Requirement: Onboarding states code-owned extension and synchronization limits
The guide SHALL explain that content configuration does not create Astro route files or block components, that a new route reads the loader's published view by path, model, or slug, and that a custom block needs a user-owned component registered in the block map file with its definition imported from the module `lace.config.ts` uses. It SHALL direct consumers to record that module as `definitions` in `lace.site.json` and run `lace add block <type>` to scaffold the component and register it, and SHALL state that the command never overwrites edited components or an edited block map. It SHALL document the styling selector contract, and explain guarded sync/check and blocked structural changes to populated models. It SHALL NOT claim automatic content migrations, automatic block installation during sync or upgrade, or complete Cloudflare CMS consumer onboarding.

#### Scenario: Consumer adds a model or custom block
- **WHEN** a consumer changes lace.config.ts
- **THEN** the guide directs them to sync explicitly, add the corresponding route in site source, scaffold and register a custom block component with `lace add block`, and warns that incompatible populated-model changes are blocked without partial apply

### Requirement: Generated local preparation runs before environment loading
Generated projects SHALL expose `pnpm env:prepare` invoking the packaged `lace env prepare` without `--env-file=.env`. The operations guide SHALL place preparation after dependency installation and before environment-loaded migration, sync and bootstrap scripts. It SHALL explain generated service credentials, preservation/refusal of existing `.env`, file protection, review of non-secret local settings, and the empty build token pending Settings issuance. Preparation SHALL be verified with packed packages outside the source workspace. Template artifacts and ownership metadata SHALL remain deterministic and credential-free; runtime `.env` and private staging remnants SHALL be ignored by source control.

#### Scenario: Installed generated consumer starts from the guide
- **WHEN** a consumer installs packed packages and runs its generated preparation script without `.env`
- **THEN** preparation succeeds without source-workspace imports and later environment-loaded commands can use the preserved database and service settings

#### Scenario: Existing consumer configuration
- **WHEN** a consumer with an existing `.env` follows the guide
- **THEN** the guide directs them to retain and review it, and explains that preparation refuses replacement and does not rotate credentials

### Requirement: Root quickstart describes the delivered consumer workflow

The generated root README SHALL describe compatible Node/pnpm, Docker Compose and matching release prerequisites; dependency installation; protected environment preparation before environment-loaded scripts; settings/origins; setup-stage doctor; explicit migration and configuration sync; API start; bootstrap and first-admin creation; login and Settings-issued build token; Home publication; Astro development/static build; Compose operation and stop commands that preserve data. It SHALL explain root `lace.config.ts`, Home/Posts models, user-owned routes, SDK export loading, renderers, layouts and styling, linking to `docs/lace-operations.md` for detailed operation and private setup input. It SHALL distinguish draft save, publication and static deployment, identify the explicit generated `site/` default and link to deployment-time external Astro source selection, and explain that `--cloudflare` supplies Pages configuration rather than complete CMS Worker onboarding. It SHALL state that source-template behavior requires matching freshly built packages/images or a later compatible release and is not retroactively added to published alpha artifacts.

#### Scenario: Consumer starts from README
- **WHEN** a fresh consumer follows README with compatible artifacts
- **THEN** preparation precedes migration/sync, the consumer can complete first-admin setup and Home publication, and the site can read published content with a server-only build token using documented commands

#### Scenario: User extends the site
- **WHEN** the consumer adds a model or custom block
- **THEN** README explains explicit sync and user-owned route/renderer work, identifies the layout and SDK loader, and refers to the operations guide for guarded structural changes

#### Scenario: Later roadmap capabilities are absent
- **WHEN** a consumer reads the Cloudflare, setup or builder sections
- **THEN** the guide describes the existing API setup and generated-site/Pages support with browser setup for compatible Step 28A or later API/admin artifacts and the retained API alternative, with external-site selection requiring compatible Step 29A or later artifacts, without promising a generated CMS Worker deployment

### Requirement: Concise setup example uses placeholders and the configured public origin

README and operations SHALL include the same short placeholder-only `curl` example for `POST /api/v1/setup/admin` with JSON `token`, `email` and `password` and a placeholder configured public API base URL retaining its optional path prefix. Adjacent guidance SHALL explain obtaining the one-time expiring token via bootstrap, a 12-character password minimum, completed-setup closure, shell-history/process exposure when replacing inline placeholders, and the existing private-input script as the safer practical option. Examples SHALL contain no usable credentials and SHALL NOT weaken server setup authorization or imply a setup token is a build token.

#### Scenario: Request shape and configured origin
- **WHEN** a consumer replaces placeholders with test values and an API base URL including a path prefix
- **THEN** the example sends a JSON POST to that prefix plus `/api/v1/setup/admin` with exactly token, email and password

#### Scenario: Expired or already consumed setup
- **WHEN** setup fails because a token expired or setup already completed
- **THEN** the guide directs unfinished setup to bootstrap again and completed setup to existing-admin login without reopening registration

### Requirement: External site operation documents mount and integration prerequisites
The operations guide SHALL document generated and external-site selection for Node/VPS, including a standalone Astro root containing `cms/`, a workspace root containing the selected site and CMS packages, root lockfile ownership, read-only bind accessibility, container-relative selection and fixed release storage. It SHALL identify the currently configured safe site identity, teach operators to configure the same identity for API and builder and restart affected services, and explain that identity is configuration rather than deployment verification. External sites SHALL require an existing compatible Astro dependency, pnpm lockfile, the Lace site packages, and the user-owned loader file, routes, block map, and block components described by the existing-site connection guide, with server-only credentials and expected published-version handling. Documentation SHALL preserve separate internal export and browser-facing media origins, give sanitized failure/retry guidance, and explain that failed builds preserve the last served release. For an existing site's own dev integration it SHALL explain the verified behavior: data read in page code on each render appears on reload, data passed through cached `getStaticPaths` props and new routes appear after restarting Astro dev. It SHALL NOT promise automatic existing-site modification, automatic block installation or generator initialization in a populated directory.

#### Scenario: Existing standalone Astro site
- **WHEN** an operator follows the parent-root example from a generated `cms/` directory
- **THEN** the guide identifies the host mount separately from `/source`, selects the root Astro project and lockfile, identifies the served release volume and points to the connection guide for the required user-owned CMS integration

#### Scenario: External workspace package
- **WHEN** an operator follows the workspace example
- **THEN** the guide selects the workspace lockfile and the intended package without requiring a package name matching the Lace example

#### Scenario: Mount or build fails
- **WHEN** the selected source is missing or a frozen install or Astro build fails
- **THEN** the guide describes checking deployment mounts and dependencies, correcting source and retrying without claiming deployment success or replacing the previous release

#### Scenario: Existing site in Astro dev
- **WHEN** an operator integrates an existing site and runs its Astro dev server
- **THEN** the guide explains which reads appear on reload and which require a dev restart, without prescribing a restart after every publication

### Requirement: Generated guides explain publication visibility per mode
The generated README and operations guide SHALL separately explain draft save, CMS publication, Astro dev visibility, manual static build and deployment, and automatic Compose build/release visibility. They SHALL state that dev shows publications to existing routes on reload and needs a restart for new or renamed slugs, token or environment changes; that a manual static build requires a fresh build and the operator's own deployment; and that Compose serves content after a succeeded covering build, keeps the previous release on failure, may serve a release moments before Builds records success, and sends revalidating cache headers. They SHALL direct operators to Builds for pending/running/succeeded/failed state and SHALL NOT claim dev, manual or provider deployment success from CMS publication state.

#### Scenario: Operator publishes in each mode
- **WHEN** an operator follows the guide after publishing a change
- **THEN** the documented next action for dev, manual static and Compose produces the observed visible result without an unnecessary restart or rebuild

### Requirement: Existing Astro sites connect through a verified guide
Generated projects SHALL include a guide for connecting an existing Astro site to a CMS generated in a subdirectory. It SHALL cover installing the Lace site packages at the release version, configuring the server-only environment, creating the loader file, rendering one page by path and one collection route by slug with dev revalidation, installing the five built-in block components with `lace.site.json` and the block map file by running `lace add block --all --site <path>` from the CMS directory, optionally overriding rich-text elements, and styling through the documented hooks. It SHALL state that installed block components are source owned by the site, that repeated runs update only unmodified files and report conflicts for edited ones. The repository SHALL verify the guide by building an independent Astro fixture, which is not generated by the starter, against a published export, and SHALL verify that the command reproduces the fixture's block files.

#### Scenario: Operator follows the guide
- **WHEN** an operator applies the guide's steps to an Astro site with its own layout and routes
- **THEN** the site builds its page and collection routes from the published export with all five blocks, safe rich text, and the documented hooks

#### Scenario: Guide fixture regresses
- **WHEN** a package or registry change breaks the guide's documented files
- **THEN** the existing-site fixture build test fails

### Requirement: Guides describe the project's site mode
The generated README and operations guide SHALL state the project's site mode and path. For existing-site mode they SHALL give the sequence: install the Lace site packages in the site, run `pnpm exec lace add block --all --site <path>` from the CMS directory, create the loader file and routes per `docs/lace-astro-site.md`, and build with the root `dev`/`build` scripts or the Compose builder selecting that site; they SHALL state that the generator did not modify the site. For no-site mode they SHALL state that no site is built, that build requests fail until a site is configured, and how to connect a site later with the existing-site guide and build-site settings. Starter-mode guidance SHALL remain as before.

#### Scenario: Existing-site README
- **WHEN** a project is generated with `--existing-site ..`
- **THEN** its README names the site path `..`, `pnpm exec lace add block --all --site ..`, and `docs/lace-astro-site.md`, and does not instruct editing `site/`

#### Scenario: No-site README
- **WHEN** a project is generated with `--no-site`
- **THEN** its README states that no site is built and links the connection guide for later
