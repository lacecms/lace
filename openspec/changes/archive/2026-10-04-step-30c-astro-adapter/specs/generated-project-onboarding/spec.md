## MODIFIED Requirements

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

### Requirement: Onboarding states code-owned extension and synchronization limits
The guide SHALL explain that content configuration does not create Astro route files or block components, that a new route reads the loader's published view by path, model, or slug, and that a custom block needs a user-owned component registered in the block map file with its definition imported from the module `lace.config.ts` uses. It SHALL document the styling selector contract, and explain guarded sync/check and blocked structural changes to populated models. It SHALL NOT claim automatic content migrations, automatic block installation before the block command exists, or complete Cloudflare CMS consumer onboarding.

#### Scenario: Consumer adds a model or custom block
- **WHEN** a consumer changes lace.config.ts
- **THEN** the guide directs them to sync explicitly and add the corresponding route or block component and block map entry in site source, and warns that incompatible populated-model changes are blocked without partial apply

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

## ADDED Requirements

### Requirement: Existing Astro sites connect through a verified guide
Generated projects SHALL include a guide for connecting an existing Astro site to a CMS generated in a subdirectory. It SHALL cover installing the Lace site packages at the release version, configuring the server-only environment, creating the loader file, rendering one page by path and one collection route by slug with dev revalidation, adding the five built-in block components with `lace.site.json` and the block map file, optionally overriding rich-text elements, and styling through the documented hooks. It SHALL state that block components are copied source owned by the site and SHALL NOT claim an automated block command before one exists. The repository SHALL verify the guide by building an independent Astro fixture, which is not generated by the starter, against a published export.

#### Scenario: Operator follows the guide
- **WHEN** an operator applies the guide's steps to an Astro site with its own layout and routes
- **THEN** the site builds its page and collection routes from the published export with all five blocks, safe rich text, and the documented hooks

#### Scenario: Guide fixture regresses
- **WHEN** a package or registry change breaks the guide's documented files
- **THEN** the existing-site fixture build test fails
