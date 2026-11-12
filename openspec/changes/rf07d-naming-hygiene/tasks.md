## 1. Verification naming

- [x] 1.1 Rename the media-selection journey and its exported identifier by behavior, update live references, and run the root script reference/orphan test.
- [x] 1.2 Rename release- or step-numbered verification log and stage labels and associated comments by behavior; inspect references and diff to verify paths, control flow and outcomes remain equivalent.

## 2. Test and contract naming

- [x] 2.1 Replace roadmap identifiers in maintained test and suite titles and temporary prefixes across root, workspace and browser tests; inventory the affected declarations and verify descriptive names preserve each scenario.
- [x] 2.2 Rename repository contract case registrations and their literal ordered pin together; run the pin test and Node and D1 contract suites, confirming case count and order remain unchanged.

## 3. Governance and verification

- [x] 3.1 Extend the root naming guard to inspect static test and suite titles per the governance delta; run focused positive and negative tests for declaration forms, token boundaries, data and comments.
- [x] 3.2 Run the narrow relevant script, affected package and browser tests and verify the renamed journey's references; inspect the diff for unchanged test logic and production behavior.
- [x] 3.3 Run `pnpm build` and compare public `dist/index.d.ts` export lists against the pre-change baseline, then run `pnpm spec:validate`, root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate rf07d-naming-hygiene --type change --strict`; record results and any environment limits.
- [x] 3.4 Update the RF7D progress log with the measured naming cleanup and verification evidence; verify the roadmap reflects the completed session without changing historical records.
