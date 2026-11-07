## 1. Baseline

- [x] 1.1 Record in `verification.md`:
  - the current `tests/json-validator-parity.test.mjs` verdicts (23 equal,
    2 differing);
  - the depth probe (1,000 / 10,000 / 100,000 levels) against the built
    contracts and content packages;
  - the `normalizeJsonValue` callers and the contracts `jsonValueSchema`,
    `jsonObjectSchema` and `isJsonObject` users, from `git grep`;
  - sorted `vitest list` titles of `content` and `contracts`.

  Verify the raw lists exist in the session scratchpad.

## 2. One walk in content

- [x] 2.1 Replace the recursive `normalizeJsonValue` with the iterative walk
  (design D1). Keep messages, paths and first-failure order. Drop the
  `ancestors` parameter from the function and its seven callers. Add
  `isPortableJsonValue` and export it from the content entry. Verify:
  - new `content/src/shared/json.test.ts` covers the accepted set, every
    refusal message and path, the named-array-property path, the detached
    copy, the shared acyclic reference, first-failure order, a 100,000-deep
    value that normalizes, and a deep invalid value that fails with a
    descriptive error (`field-descriptors` scenarios);
  - the existing content tests pass unchanged.
- [x] 2.2 Add `isPortableJsonValue` to the content packaged export list.
  Verify the content packaged test passes.

## 3. Contracts delegates

- [x] 3.1 Rebuild `jsonValueSchema`, `jsonObjectSchema` and `isJsonObject`
  on `isPortableJsonValue`, and delete the contracts `isJsonValue` (design
  D2). Verify:
  - new `contracts/src/shared/json.test.ts` shows that an array with a named
    property is refused and a non-enumerable element is accepted, through
    both schemas;
  - it shows that a 100,000-deep value is accepted and a deep invalid value
    is refused without throwing;
  - contracts tests pass and `pnpm openapi:check` reports no change.
- [x] 3.2 Make `tests/json-validator-parity.test.mjs` expect equal verdicts
  for every edge, add the deep cases, and rename the test to match. Add
  `isPortableJsonValue` and `isJsonValue` to the `names` list of
  `tests/shared-vocabulary.test.mjs`. Verify:
  - both root tests pass;
  - a temporary `function isJsonValue` in a contracts file makes the
    vocabulary guard fail. Revert it afterwards.

## 4. Verification

- [x] 4.1 Run the narrow suites, then root `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test`, `pnpm openapi:check` and
  `pnpm exec openspec validate rf03g-json-validator-parity --type change
  --strict`. Record results and any deviations in `verification.md`. Update
  the roadmap progress row.
