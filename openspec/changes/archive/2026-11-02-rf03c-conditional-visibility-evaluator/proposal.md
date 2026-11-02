## Why

Conditional-field rules are evaluated by three code paths that each decide on
their own what a controller's "effective value" is. Content's
`isFieldVisible` reads the values it is given and treats an absent controller
as matching nothing; `validateModelFields` passes it normalized values (defaults
already materialized), while `publishedFieldValues` passes whatever values it
receives. Application's private `visibleUnder`
(`packages/application/src/configuration-fields.ts`) re-implements the rule
over stored values with its own default fallback, used for sync pruning,
backfill skipping and revealed-occurrence checks. The admin's
`effectiveFormValues` (`apps/admin/src/entities/content/visibility.ts`)
applies defaults a third way and also treats a cleared (`null`) controller as
unset. The accepted `conditional-fields` spec already requires one effective
value and one exported evaluator; the code has three. This is Session RF3C
of [`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md), third
of Step RF3 (shared vocabulary), and precedes the RF4 splits of
`packages/content/src/index.ts` and `configuration-sync`.

## What Changes

- **One effective-value function in `@lacecms/content`.** New export
  `effectiveVisibilityValues(fields, visibility, values)` returns, for each
  controller named by `visibility`, its present value, else its declared
  default; a controller that is absent, `undefined` or `null` without a
  default is left out. It reads only the given occurrence.
- **`isFieldVisible` is documented as taking effective values.** Its
  signature and behavior stay unchanged.
- **Content call sites use it.** `normalizeFieldMap` (validation) and
  `publishedFieldValues` (and through it `publishedBlockData`, internal-link
  collection, render and block migration) evaluate rules over
  `effectiveVisibilityValues`. For normalized input this is the same result;
  for a caller that passes values without a defaulted controller, the
  projection now follows the accepted spec (default applies) instead of
  hiding the target.
- **Application delegates.** `visibleUnder` in `configuration-fields.ts`
  becomes a thin wrapper over `effectiveVisibilityValues` plus
  `isFieldVisible`. Sync pruning, backfill skipping and revealed-occurrence
  checks keep their call shape.
- **Admin delegates.** `effectiveFormValues` keeps its name and signature
  (it accepts `unknown` form values) and calls the content function;
  `shownFieldKeys`, `applicableErrors`, `renderedFieldKeys` and their
  consumers are unchanged.
- **Parity cases and tests.** A pure case table in `packages/test-utils`
  (fields, rules, occurrence values, expected visible keys) covering defaults,
  optional controllers, `null`, booleans, nested groups and list items is
  asserted against content validation and projection, application sync
  pruning and admin `shownFieldKeys`, and against the stored published
  projection on Node SQLite and D1 through one new repository contract case.
- **Guard.** The root vocabulary guard rejects a second declaration of
  `effectiveVisibilityValues` or `isFieldVisible` and an inline
  `rule.values.includes(` outside content; block `settingsVisibility` in the
  admin is allowlisted as a separate presentation-only rule.
- **Documentation.** Architecture §8 *Conditional fields* names the shared
  evaluator for validation, projection, sync and the admin; the roadmap
  baseline row "conditional-visibility evaluators" moves from 3 to 1.

Non-goals: block `settingsVisibility` (a separate presentation-only rule per
the accepted spec); `configuration-evolution`'s narrowing comparison of two
rules, which compares rules rather than evaluating them; the error model
(RF3D); splitting content or application files (RF4). No accepted or
rejected value, published snapshot, response shape, SQL, cursor or OpenAPI
document changes. No migration and no template version bump.

Depends on RF3B (archived); RF2 put content, application, test-utils and
admin tests on source.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conditional-fields`: one added requirement — validation, the published
  projection, configuration synchronization and the admin evaluate rules
  through one shared effective-value function with identical default and
  cleared-value handling, verified by one parity case table on Node and
  Cloudflare.

## Impact

- Architecture: §8 *Conditional fields* (shared evaluator named; no
  invariant change). No dependency-direction change: application and admin
  already import `@lacecms/content`; test-utils already depends on content,
  config, application and domain, and admin already lists test-utils as a dev
  dependency.
- Code: `packages/content/src/index.ts`;
  `packages/application/src/configuration-fields.ts`;
  `apps/admin/src/entities/content/visibility.ts`; new
  `packages/test-utils/src/visibility-parity.ts` with a subpath export
  `@lacecms/test-utils/visibility-parity` and its source alias in
  `vitest.shared.mjs`; parity tests in content-adjacent test-utils, admin and
  `repository-contract/conditional.ts` (pinned case-name list updated);
  `tests/shared-vocabulary.test.mjs`; content packaged export list.
- Public exports: `@lacecms/content` adds `effectiveVisibilityValues`. Other
  export lists are unchanged.
- Runtime behavior: none observable in product flows, which only project
  normalized values. `publishedFieldValues` / `publishedBlockData` called
  directly on values that omit a defaulted controller now treat the default
  as the controller value, as the accepted spec states.
- Dependencies: none added.
