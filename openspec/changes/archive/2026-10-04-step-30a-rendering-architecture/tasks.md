## 1. Decision record

- [x] 1.1 Add `docs/adr/0006-shared-rendering-core-and-installed-block-source.md` recording context with the inventory drift evidence (duplicated loader, field readers, and the rich-text allowlist accepting `https:example.com`, `mailto:` without `@`, and paragraph-in-paragraph nesting), the hybrid decision, consequences, and the four compared options (copy-only starter, npm-packaged renderers, source-only installer, chosen hybrid) with tradeoffs; verify every option and drift case is present and the status/date/governing sections follow ADR 0005's format.

## 2. Architecture update

- [x] 2.1 Update `docs/mvp-architecture.md` §6 with `packages/render`, `packages/astro`, the root `registry/` directory, the revised `apps/site` role, the edges `render -> content`, `astro -> render, sdk`, `apps/site -> astro, render, sdk, content`, and rules for the render core and adapters (no framework/Node/SDK imports in `render`; adapter contains only framework-bound code; no re-exports; no visual blocks in any package); verify the dependency list matches design D2 and introduces no cycle.
- [x] 2.2 Update §7 with the three site modes, the starter layout including `lace.site.json`, the block map file, and the loader file, the starter/reference-site role split, and ownership rules for installed block sources, the map file, and `lace.site.json`; verify the ownership table covers every new file kind and keeps `site/**` user-owned and never rewritten by `lace upgrade`.
- [x] 2.3 Add a rendering-and-block-installation section specifying the 30B–30D public APIs (published-site loader, `parseBlock`, block map/resolver, `BlockProps`, `describeRichText`, error classes and codes, `createAstroSiteLoader`, `<LaceBlocks>`, `<RichText>`), the registry and `lace.site.json` model, and the framework-selection model; verify every name and error code matches design D3–D7 and that server-only constraints for `LACE_BUILD_TOKEN` are stated.
- [x] 2.4 Rewrite §13 SDK and typical Astro page and collection examples on the new APIs, and align §§2, 11, 19, 20, and 24 (shared rich-text rule, site dependencies, starter build verification, captured decisions); verify no remaining text describes site-local loader, rendering, or rich-text copies as the design.

## 3. Roadmap and feedback reconciliation

- [x] 3.1 Reconcile `docs/mvp-implementation-roadmap.md` Step 30 sessions 30B–30E, Steps 31–33 cross-references, and the post-step summary with the names and boundaries fixed here (package names, `registry/`, `lace.site.json`, map file path, `createPublishedSiteLoader`, `describeRichText`), mark 30A complete, and update onboarding feedback §7 to point at ADR 0006; verify with a search that no conflicting provisional name remains.

## 4. Verification

- [x] 4.1 Review the changed documents against the roadmap Step 30 decisions and ADR 0001; verify no production code, template, package, or script changed (`git status` shows only `docs/**` and this change), then run `pnpm format:check` and `pnpm exec openspec validate step-30a-rendering-architecture --type change --strict` and confirm both pass.
