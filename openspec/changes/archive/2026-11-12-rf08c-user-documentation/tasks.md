## 1. Guards first

- [x] 1.1 Extend the docs content schema with required `kind` (`overview`, `guide`, `reference`) and `verifiedAgainst`, and teach `scripts/check.mjs` the page template and version rules of design §3–§4 (H2 parsing outside code fences, `release/alpha.json` `version` or non-alpha `publishedVersions`, catalog `target` equal to `version`); add `catalog.test.mjs` cases for each failure (unknown kind, guide without *Before you start*, guide without a reference link, reference page outside `reference/`, alpha or unknown version) and verify they pass while the real pages are still allowed to fail only on the new rules.
- [x] 1.2 Add the `Footer` override that renders Starlight's default footer plus "Verified against `<version>`"; verify in a built page that the line appears once and that the footer makes no publication or deployment claim.
- [x] 1.3 Add the `release/alpha.json` rendered-fields projection to `scripts/docs-inputs.mjs`; add `tests/docs-publication.test.mjs` cases proving a `version`/`publishedVersions` change is an input change and a `packages`/`images` change is not, and run that test.
- [x] 1.4 Add `tests/docs-reference.test.mjs` per design §1 with extractor unit cases over the current help texts and a negative fixture that omits one item of each kind; verify it fails on the current pages and lists `kind: name` for every gap.

## 2. Reference section

- [x] 2.1 Rewrite `reference/cli-environment.md` as a `reference` page: every `lace` and `create-lace` command, mode and flag with purpose, targets and exit codes; the environment table grouped by runtime with secret and default/required columns; verify the CLI and setting kinds of the reference test pass and each row has purpose text.
- [x] 2.2 Add `reference/configuration.md` with every `defineConfig`/`definePage`/`defineCollection`/`defineGlobal`/`defineBlock` option, list options, SEO inputs, temporary hints (`renamedFrom`, `removedFields`, `removedBlocks`, `removedSeo`), field builders and common field options, checked against `packages/config` and `packages/content` types; verify the configuration kinds of the reference test pass.
- [x] 2.3 Restructure `reference/api.md`: keep OpenAPI download, `/api/docs` and export consumption; add hand-written REST tables by audience (method, path, purpose, permission) checked against `api-v1.json`; keep collection-query request grammar and limits; move internal-link and MCP prose to their guides; verify the REST kind passes and every moved fragment link still resolves.
- [x] 2.4 Add `reference/mcp.md` (endpoints, discovery URLs, protocol version, scopes, tools with required scope) and make `reference/index.md` an `overview` linking all reference pages; verify the reference test passes completely.

## 3. Promote internal notes into guides

- [x] 3.1 Add `operations/mcp.md` from `docs/mcp.md` (enable, Codex/Claude Code/Gemini CLI setup, consent, publication scope, revocation, proxy and limits, disable); delete `docs/mcp.md`; verify every statement against `mcp-content-server` and `mcp-oauth-delegation` specs and that no internal link dangles.
- [x] 3.2 Add `astro-integration/styling.md` from `docs/site-styling.md` and fold `docs/rich-text-authoring.md` into `editing-content/rich-text-media.md` and `astro-integration/`; delete both notes; verify against `render-core`, `astro-adapter`, `gallery-block` and rich-text specs, including gallery `placement` (grid only) and image `size`.
- [x] 3.3 Fold `docs/composite-fields.md`, `docs/field-guidance.md` and `docs/form-organization.md` into `content-modeling/` pages (composites, field options, layouts, slug suggestions) and `editing-content/`; delete the three notes; verify against `field-descriptors`, `list-layout` and admin draft-editor specs.
- [x] 3.4 Add the media-tags guidance to `editing-content/rich-text-media.md` (tagging, filtering, picker) and the tag grammar and endpoints to `reference/api.md`; delete `docs/media-tags.md`; verify against `admin-media-library` and `media-use-cases`.
- [x] 3.5 Add `content-modeling/links.md` for internal URL links (authoring, unavailable links, site helpers, installed components) and trim `docs/internal-url-links.md` to persistence and rollback; verify against `internal-url-links` spec.
- [x] 3.6 Trim `auth-operations.md`, `cloudflare-worker.md`, `database-migrations.md` and `node-api.md` to engineering content, moving any user procedure or setting into `editing-content/accounts/`, `operations/`, `deployment/` or the reference; review `collection-queries.md`, `configuration-synchronization.md`, `content-import.md` and `compatibility.md` for user guidance not yet public; if a note ends up with no engineering content, delete it and update the design table; verify each trimmed note against its public owner page for duplicated steps, settings or examples.
- [x] 3.7 Delete `docs/personal-site-guide.md` after confirming its journey is covered by `getting-started/`, `astro-integration/` and `deployment/`; verify no link names it.

## 4. Feature coverage and page template

- [x] 4.1 Audit `content-modeling/` against the implementation: route-less collections, default collection sort, collection list options, conditional fields, SEO, synchronization hints; apply the guide template and `verifiedAgainst: 0.1.0-rc2`; verify against `content-model-configuration`, `collection-query-options`, `conditional-fields` and `configuration-synchronization` specs and with `pnpm docs:check`.
- [x] 4.2 Audit `editing-content/`: editor block controls (collapse and expand all, hidden blocks, settings tab), admin list search/filters/sort, gallery videos, conditional fields in the editor, import, accounts; apply the template and version; verify against the admin draft-editor, remote-state/lists, content-import-cli and account specs and with `pnpm docs:check`.
- [x] 4.3 Audit `getting-started/`, `astro-integration/`, `deployment/` and `operations/` (including upgrade from rc2 and the new MCP page); apply the template and version; verify against `project-generator`, `public-sdk`, `astro-adapter`, deployment, operational-cli and upgrade guidance specs and with `pnpm docs:check`.
- [x] 4.4 Mark landing and section introductions as `overview` or `guide` per design §3 and set `verifiedAgainst` on every page; verify `pnpm docs:check` passes with the template and version rules active and a built page shows the footer.

## 5. Internal index and governance

- [x] 5.1 Update `docs/README.md` (status `internal note`, "Public owner" column, "Promoted and deleted" table) and `docs/documentation-maintenance.md` (topic map naming remaining internal sources per public section, page template and footer rules, reference test); rewrite links in `docs/**`, `docs/archive/*`, `DEVELOPMENT.md` and `README.md`; verify `tests/docs-links.test.mjs` passes and no maintained `docs/*.md` file lacks an index row.
- [x] 5.2 Update the RF8C section and progress row of `docs/refactoring-roadmap.md` with the outcome (pages added, notes promoted/deleted/trimmed, settled questions); verify the roadmap link to this change resolves.

## 6. Verification

- [x] 6.1 Run `pnpm docs:check`, `pnpm --filter @lacecms/app-docs test:variants`, `tests/docs-reference.test.mjs`, `tests/docs-links.test.mjs`, `tests/docs-publication.test.mjs` and `tests/content-import-sample.test.mjs`; serve the build and smoke-check a guide, a reference page, the footer and search at `/lace/`.
- [x] 6.2 Run root typecheck, Oxlint, Oxfmt check, `pnpm spec:validate` and `pnpm exec openspec validate rf08c-user-documentation --type change --strict`; record results and resolve failures before completion.
