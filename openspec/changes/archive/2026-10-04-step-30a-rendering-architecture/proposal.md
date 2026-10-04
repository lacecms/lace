## Why

Step 30, session **30A — Decision record, architecture, and package boundaries**, settles the rendering and block-installation design before any Step 30 code is written. Today the generated starter `site/` and `apps/site` each carry private copies of the published-export loader, block field readers, and a rich-text allowlist that already drifts from `@lacecms/content`, and onboarding feedback §7 shows that connecting an existing Astro site means hand-copying those files. The owner's 2026-10-04 scope decision fixes the direction (framework-neutral packages, a thin Astro adapter, user-owned block source installed by `lace add block`, an optional starter); this session records it so 30B–30E implement one agreed set of package names, boundaries, ownership rules, and public APIs instead of redesigning them per proposal.

## What Changes

- Add ADR 0006 under `docs/adr/` recording the hybrid decision — shared loading/parsing/rich-text logic as packages, visual block markup as user-owned source installed from a versioned registry — with the compared options (copy-only starter, npm-packaged renderers, source-only installer, chosen hybrid), their tradeoffs, and the drift evidence from the roadmap inventory.
- Update `docs/mvp-architecture.md` before implementation:
  - fix the new package names `@lacecms/render` (framework-neutral render core) and `@lacecms/astro` (Astro adapter), the repository `registry/` block-source directory, and the dependency edges `render -> content`, `astro -> render, sdk`, and `apps/site -> astro, render, sdk, content`;
  - define ownership of registry-installed block sources, the generated block map file, and the site-local `lace.site.json` configuration/lock file inside an otherwise user-owned site tree;
  - state that visual block markup is never published as a runtime package;
  - specify the public APIs 30B–30D implement (published-site loader, `parseBlock`, block map and resolver, rich-text element description, `<LaceBlocks>`, `<RichText>`, Astro loader factory) at the level of names, inputs, outputs, error behavior, and server-only constraints;
  - define the framework-selection model (framework-keyed registry and adapters, `astro` default, other frameworks reserved);
  - define the starter versus reference-site role split and the three project site modes (starter, existing site, no site);
  - rewrite §13 SDK and Astro page examples for the new APIs and align §§2, 7, 11, 19, 20, 24.
- Reconcile the roadmap Step 30–33 text and onboarding feedback §7 with the names and boundaries fixed here.
- **BREAKING (planned, not implemented here):** the architecture records that Step 30 deliberately changes the generated `site/` layout and imports for new projects; existing alpha projects receive manual migration instructions in 30C and 30E. No code, template, or package changes in this session.

Dependencies: completed Step 29. Non-goals: any production code, new packages, template or CLI changes, boundary-script updates (30B adds the edges it introduces), exact DTO field lists and spec wording (left to 30B–30E just-in-time changes), CLI flag names for site modes (30E), in-place CMS installation into nonempty projects (§11, deferred), and a dedicated public content schema (Step 33 open question).

## Capabilities

### New Capabilities

None. This session is documentation and decision recording only; capability specs for the render core, Astro adapter, block installer, and site modes are introduced by 30B–30E.

### Modified Capabilities

None. The change declares `skip_specs: true` because it changes no accepted behavior.

## Impact

- Affects `docs/adr/0006-*.md` (new), `docs/mvp-architecture.md`, `docs/mvp-implementation-roadmap.md`, and `docs/onboarding-feedback.md` only.
- Governing architecture sections: 2, 4.3, 4.8, 6, 7 (ownership and upgrade model), 11 (block registry and rich text), 13 (SDK), 19, 20, 22, 24. Related ADRs: 0001 (package boundaries) and 0005 (owned component source, the admin precedent).
- Related accepted specs whose behavior later sessions will modify: `public-sdk`, `astro-reference-site`, `block-registry`, `content-validation`, `project-generator`, `generated-project-onboarding`, `upgrade-planner`, `environment-doctor`, `build-site-selection`, `workspace-governance`. None is changed here.
