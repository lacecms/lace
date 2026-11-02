# RF3A verification

## Baseline

Pinned Node 24.12.0 and pnpm 12.3.4. Listed test titles (`vitest list`, lines containing ` > `):

| Package | Before |
| --- | --- |
| content | 97 |
| config | 50 |
| contracts | 90 |
| application | 130 |
| db | 26 |
| admin | 899 |

OpenAPI SHA-256 before: `9898303789b4fc3df66446bf7c059457a8fabf11cafa81f404de35369d76f717`.

## Focused evidence

- content: 224 expanded cases (220 baseline + 4); packaged exports pass.
- config: 76 expanded cases, unchanged; list-query and SEO text keys derive from capabilities.
- contracts: 159 expanded cases (156 + 3); the generated corpus covers every kind, foreign options, unknown keys and wrong defaults. Removing URL `embedProviders` made parity fail as expected; restored and passed.
- application: 139 expanded cases (138 + 1); every kind rejects unsupported operators at `/filters/0/op`.
- db: 27 cases (26 + 1); SQL and bindings for all five sort families were snapshotted from HEAD before the refactor, then matched after it.
- Node: 307 cases; Worker: 217 cases; D1 budgets: 4 cases, unchanged limits. Local listeners require execution outside the sandbox (initial sandbox SMTP run hit EPERM; Worker runs stalled and were stopped).
- admin: 997 expanded cases (995 + 2). Actual workspace name is `@lacecms/app-admin` (the task command's `@lacecms/admin` matches no package).
- OpenAPI: deleting `FieldDefinition`, `GroupFieldDefinition`, `ListFieldDefinition`, `BlockMetadata`, `FormLayout` from both parsed artifacts yields deep-equal remainders. Generated artifact staged for `openapi:check`.
- Vocabulary guard: array, Set, union, comparison-chain and MediaGrid-mode fixtures pass. Canonical content vocabulary/capability types and the existing `BLOCK_SETTING_FIELD_TYPES` declaration are exempt; other content code remains scanned. The media-list query key reuses its existing media prefix. Built-in controls reference composite descriptor types and express their grouped-control decision directly.

## Totality experiment

Temporarily added `dummy` to `FieldType` and a `DummyFieldDefinition = CommonDefinition<"dummy", CommonFieldOptions<string>>` to the descriptor union, without adding capabilities or admin support. `pnpm typecheck` failed in content as intended. Because Turbo stops at failed dependencies, also ran `pnpm exec turbo run typecheck --continue=always` to expose downstream diagnostics (35 tasks succeeded; content build/typecheck and admin typecheck failed).

Exactly these files reported errors:

- `packages/content/src/index.ts`: total capability declaration/public lookup and exhaustive validation visitor.
- `apps/admin/src/entities/content/field-types.ts`: missing support declaration.
- `apps/admin/src/entities/content/FieldControls/FieldControls.tsx`: missing scalar control.

The public capability lookup is total while derived eligibility uses declared literal entries, keeping missing-kind errors local to the declaration rather than cascading into consumers. An initial experiment used an incomplete dummy without common label/description options and consequently produced irrelevant common-option errors; repeating with a real scalar shape produced only the three files above. Both experiments were reverted. Production builds/checks below restore generated declarations too.

## Browser verification

All 28 original cases pass with the default test viewport enlarged to 1280 × 2200 using a temporary config importing `apps/admin/playwright.config.ts`; that config was deleted after the run. Explicit narrow/wide viewports inside accessibility and layout cases stay as authored. Command: `pnpm --filter @lacecms/app-admin exec playwright test collection-queries composites field-guidance list-layouts --config rf03a.playwright.config.ts` (31.4 s).

At the original default 1280 × 720, 27/28 pass; the pointer-drag case fails unchanged on both HEAD admin source and the refactor. A temporary diagnostic showed the first handle at `{x: 283, y: -252, width: 28, height: 28}` and the target at `{x: 283, y: 158, width: 28, height: 28}`: the synthetic pointer starts outside the viewport after the fixture opens all items. The larger viewport exercises the same assertion successfully without modifying the test or production drag behavior. Temporary diagnostics were removed.

## Listed title counts after implementation

| Package | Before | After | Added |
| --- | --- | --- | --- |
| content | 97 | 101 | 4 |
| config | 50 | 50 | 0 |
| contracts | 90 | 93 | 3 |
| application | 130 | 131 | 1 |
| db | 26 | 27 | 1 |
| admin | 899 | 901 | 2 |

No existing title was removed. These are listed titles; expanded parameterized case counts are recorded separately above.

## Final gates

- `pnpm typecheck`: 38 Turbo tasks and root configuration typecheck passed after restoring the dummy experiment.
- `pnpm lint`: 22 tasks, package boundaries and admin color checks passed. The two existing `no-useless-spread` warnings in `admin-client.ts` remain warnings; zero errors.
- `pnpm format:check`: passed.
- `pnpm build`: 22 tasks passed, including public documentation link/OpenAPI verification.
- `pnpm test`: all 64 Turbo tasks passed (no cached tasks; 3m54.868s), followed by 34 root files / 256 cases (17.85s). Admin: 198 files / 997 cases. Every baseline listed title survives; 11 package cases and 6 root guard cases were added.
- `pnpm openapi:check`: passed with the generated artifact staged. The final FieldDefinition description explicitly documents the semantic bounds/default/presentation/layout constraints still enforced by shared runtime validation; focused contracts tests also passed after this description update.
- `pnpm exec openspec validate rf03a-field-type-capabilities --type change --strict`: passed.
- SQL statement snapshot and original Node/D1 repository contracts passed; original browser cases passed with the documented viewport adjustment.
- `git diff --check`: passed. No dummy descriptor, temporary diagnostics or browser config remain.

No migration, template version change, dependency change or archive was performed. The main accepted specifications remain unchanged until the explicit sync/archive action.

## Archive completion — 2026-11-02

All three ADDED requirements were synchronized into `field-descriptors`, `collection-query-options` and `rest-contracts`. A byte comparison verified each main spec retained its complete original content followed by exactly its delta requirement. Strict validation passed for all 84 main specs and the completed change before archival. Archived under `openspec/changes/archive/2026-11-02-rf03a-field-type-capabilities` with all 21 tasks complete.
