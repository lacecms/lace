## Why

Lace needs a public documentation site that explains the current CMS independently of the engine checkout and its internal engineering records. A concise product README should direct users to that site and contributors to a dedicated development guide.

## What Changes

- Deliver one owner-requested documentation session, DOC1, independently of the deferred CE10–CE12 roadmap work. Record DOC1 in the backlog and the application boundary in architecture sections 6, 19 and 20 during implementation, before introducing application code.
- Add a private `apps/docs` Astro/Starlight workspace application with English documentation for `latest`, initially targeting `0.1.0-alpha.6` and following `main`.
- Establish explicit locale/version metadata and `/en/latest/` routes so additional languages and version snapshots can be added without changing existing page URLs. Ship only English and latest; do not expose empty selectors or unsupported variants.
- Cover onboarding, content modeling, editorial workflows, Astro integration, Node/VPS and Cloudflare deployment, operations, CLI/configuration reference and API documentation access.
- Publish changed documentation inputs from `main` through GitHub Actions to GitHub Pages; validate pull requests without deploying. Compare against the last successful publication, including relevant build inputs and dependencies, with manual retry and serialized deployment.
- Replace the root README with concise product information and links to the public docs and `DEVELOPMENT.md`; preserve its useful contributor guidance in that development guide and existing internal documents.
- Keep all repository `docs/**` documents maintained and internal in purpose. Public pages become the source for public guidance; internal documents remain the architecture/operations/evidence record and are not automatically published wholesale.

## Capabilities

### New Capabilities

- `public-documentation`: Starlight application, locale/version foundation, content coverage, product/developer entry points and public/internal documentation ownership.
- `documentation-publication`: Change-sensitive GitHub Pages delivery, pull-request validation, authentication, recovery and deployment ordering.

### Modified Capabilities

- `workspace-governance`: Declare and enforce an isolated private documentation application and include it in existing workspace quality gates without adding runtime dependencies to the CMS.

## Impact

- Architecture references: sections 4.8 (workflow/authority), 6 (workspace boundaries), 7 (generated consumers), 19 (dependency policy), 20 (quality), 22 and 25 (compatibility/release status).
- Accepted specs consulted: `workspace-governance`, `runtime-tooling-minimum-policy`, `generated-project-onboarding`, `api-documentation-ui`, and `alpha-release-artifacts`. Generated consumer guides, same-origin API reference and artifact publication contracts remain intact.
- Expected implementation areas: `apps/docs/**`, root workspace/catalog/lockfile/task configuration, boundary checks, documentation verification scripts/tests, CI and Pages workflow, `README.md`, new `DEVELOPMENT.md`, internal architecture/backlog and selected maintained internal guides.
- Dependencies: a pinned Starlight release compatible with catalog Astro; existing Node/pnpm pins; GitHub Pages configured to use Actions and a main-only deployment environment. Initial target URL is `https://lacecms.github.io/lace/` with base `/lace/`.
- Non-goals: additional published locales or versions, automatic release snapshots, CMS content localization, CMS runtime changes, npm/image publication, custom domains, a second interactive API explorer, automatic publication of internal docs, or generated-project template rewrites.
- No database, API or stored-content migration is required. Alpha.6 is the documentation target, not an assertion that it has been published or deployment-verified.
- This turn creates planning artifacts only. Implementation requires a subsequent explicit apply request; no external deployment or repository-setting mutation is performed while proposing the change.
