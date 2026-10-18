## 1. Architecture and workspace foundation

- [x] 1.1 Record the owner-selected DOC1 session in `backlog.md` without renumbering/reordering CE10–CE12, and document the private docs application, public/internal ownership and dependency/quality boundary in `docs/mvp-architecture.md` sections 6, 19 and 20 before code; verify consistency with proposal and `workspace-governance` delta.
- [x] 1.2 Select and pin a stable Starlight release compatible with catalog Astro, scaffold private `apps/docs`, and add its scripts/root docs commands/Turbo inputs and outputs using existing Node/pnpm/Oxlint/Oxfmt policy; verify frozen install plus standalone docs build/typecheck/lint without CMS services or credentials (design decision 1).
- [x] 1.3 Register docs in the boundary checker with no Lace runtime dependencies and add behavioral fixtures for forbidden imports in both directions; verify boundary tests and unchanged public package/image inventory declarations (`workspace-governance`).

## 2. Language and version foundation

- [x] 2.1 Implement the validated documentation catalog, explicit Starlight English locale, latest section targeting `0.1.0-alpha.6`, base-aware root entry and version/main information; verify `/lace/en/latest/`, unchanged deep-route identities, not-found behavior and absence of redundant selectors (`public-documentation`, design decision 2).
- [x] 2.2 Add temporary extra-locale/fixed-version build fixtures and catalog/content validation for missing/unknown pairs and duplicate routes; verify additional sections build without changing shared templates and fixture pages are absent from production output.
- [x] 2.3 Configure sidebar, contents, theme, source/edit links, local assets and Pagefind; verify a production build's navigation, assets and search under `/lace/` rather than relying on Astro dev (public standalone/accessibility requirements).

## 3. Public content and maintained internal references

- [x] 3.1 Author overview/getting-started and content-modeling guides covering prerequisites, matching alpha.6 artifacts, site modes, setup, first publication, pages/collections/globals, fields/composites, guidance/form organization, SEO, blocks and config sync; verify substantive pages against accepted specs and generated-consumer commands (`public-documentation` journey coverage).
- [x] 3.2 Author editor/media/users/account and Astro/SDK/block-installation guides; verify roles, rich text, media use, render ownership and the separation of draft save, publication and deployment against accepted capability behavior.
- [x] 3.3 Author separate Node/VPS and Cloudflare deployment/operations guides covering build settings/diagnostics, secrets/tokens, updates, migrations, backup/restore and recovery; verify commands against maintained scenario/internal guides and distinguish minimums, tested pins and actual release/deployment evidence.
- [x] 3.4 Author CLI/environment/configuration and API-reference guidance, copy the committed OpenAPI JSON into generated public output, and explain existing `/api/docs`; verify the download matches the committed source, `pnpm openapi:check` passes and no running API/second interactive console is required.
- [x] 3.5 Add internal `docs/documentation-maintenance.md` with the topic/source map, public versus contributor/internal ownership and review policy; verify all preexisting `docs/**` files remain and no blanket docs-directory inclusion exists in the public build (design decision 3).

## 4. Repository entry points

- [x] 4.1 Move/adapt existing README contributor procedures into root `DEVELOPMENT.md`, retain links for engine setup/bootstrap/sync/live-site/acceptance/quality/troubleshooting, and add docs development commands/internal references; verify procedure coverage and relative links from the root location.
- [x] 4.2 Rewrite root README as concise product information with supported capabilities, deployment choices, alpha maturity, the public English/latest URL and development-guide link; verify prospective-user and contributor entry scenarios without changing generated-project templates (`public-documentation`, design decision 4).

## 5. Change-sensitive publication

- [x] 5.1 Implement the declared-input fingerprint and normalized pnpm dependency-closure projection for candidate/baseline tracked data, with no whole-workspace install needed for unchanged detection; verify fixtures for page/asset/OpenAPI/config/toolchain/relevant-dependency changes, unrelated CMS/internal/README/release/lockfile changes, invalid metadata and missing cache (design decision 5).
- [x] 5.2 Implement successful Pages deployment-history selection and ancestry/eligibility decisions using read-only history access; verify paginated success selection, no-history first publish, API/missing-revision failures, failed-deploy-then-unrelated-commit retry, stale reruns, divergent history and main-only manual force (`documentation-publication`).
- [x] 5.3 Add `.github/workflows/docs-pages.yml` with serialized main/manual publication, refreshed baseline checks, conditional build/upload, official Pages artifact deployment and scoped credentials; verify workflow/decision tests prove PR/non-main denial, no build/upload/deploy for unchanged inputs and no baseline advance before confirmed success (design decision 6).
- [x] 5.4 Document Pages Actions source, main-only environment policy, expected URL, deployment summaries, force retry and rollback in the internal maintenance/development guidance; verify instructions match workflow fields and explicitly separate local verification from the first actual hosted run.

## 6. Integrated verification

- [x] 6.1 Add/run docs validation for catalog, required content sections, generated local page/fragment/resource links, public OpenAPI and exclusion of internal content; verify intentionally broken fixtures fail with actionable diagnostics and production content passes (`documentation-publication` validation requirement).
- [x] 6.2 Run a built-site browser smoke check at the production base covering root entry, a deep guide, sidebar, source link, Pagefind results, theme, visible keyboard focus and mobile overflow; record observable results and ensure test-only variant content is absent.
- [x] 6.3 Integrate focused docs verification into existing PR/main quality CI without path-skipping required root checks or granting PR deployment permissions; verify workflow configuration and a clean root task graph include the docs application (`workspace-governance`).
- [x] 6.4 Run focused docs/boundary/publication tests, then `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm openapi:check`, and `pnpm exec openspec validate add-starlight-documentation --type change --strict`; record results and any pending external Pages setup/live verification without claiming a deployment occurred.
