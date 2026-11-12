## Context

`tests/root-scripts.test.mjs` checks script filenames, root command names and verification variables with a narrow legacy pattern, but does not inspect test titles or stage/log strings. `scripts/journeys/list-settings-mcp-proxy.mjs` imports `rc1-media-selection.mjs`; acceptance scripts and `node-contracts-media.mjs` retain historical labels. The repository contract cases are registered in ordered area files and pinned in `packages/test-utils/src/repository-contract/case-names.test.ts`. See the proposal for scope and the governance delta for the title contract.

## Goals / Non-Goals

**Goals:** Preserve the executed cases, their order and verification semantics while making labels descriptive and preventing title regressions. Keep guard diagnostics actionable and avoid treating fixture data as a title.

**Non-Goals:** Rewriting historical docs or release fixtures, changing real version values, broad renaming of arbitrary test data, adding runtime behavior or migrating user data.

## Decisions

- Rename the journey file and exported identifier together by the media-selection behavior, update all live imports and references, and verify the root orphan/reference check. Change logs, acceptance stage labels and associated comments by meaning, preserving control flow, artifacts and exit behavior. Searching and replacing every release token was rejected because versions can be meaningful test inputs.
- Inventory maintained test declarations and temporary prefixes across root tests, apps and packages, including e2e and packaged tests; replace roadmap labels with the actual scenario. Rename contract registrations and the literal ordered pin together, with no additions, removals or reordering. Historical fixture snapshots remain untouched. Verify both Node and D1 contract runners where feasible.
- Extend root governance with syntax-aware title extraction for existing JavaScript and TypeScript test declaration forms, including `test`, `it`, `describe`, modifiers, `each` and static template portions. Match whole roadmap-code tokens using explicit known family patterns informed by repository inventory; keep the pattern centralized and test examples and nonmatches. A raw repository-wide regex would report data, comments and release tests. Dynamic interpolated values cannot be resolved statically; the guard covers the title's literal portions, while the inventory reviews the actual declarations.
- Keep existing script guard obligations intact and cover the new rule with isolated temporary-repository negative and positive examples, including identifiers outside titles and normal words. No blanket exceptions or baseline for existing titles.

## Risks / Trade-offs

- [Title parsing misses a declaration form] → Inventory actual call forms and test modifiers, parameterization and multiline templates; document static extraction's boundary.
- [Renaming silently alters verification or ordered contract coverage] → Compare case count/order and labels, run contract suites and targeted script guard tests, and inspect the diff for changes beyond names.
- [Labels are consumed by external automation] → Search maintained references and update them atomically; preserve result paths and machine-readable fields unless they themselves encode a historical label and are explicitly in scope.

## Migration Plan

Land file/reference and label renames together with the guard and its tests. No persisted data migration or deployment is required; reverting the change restores old names and the old guard as one unit.
