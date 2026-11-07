# Verification — rf03g-json-validator-parity

## 1. Baseline (before implementation, commit `cd307612`)

Raw lists are kept in the session scratchpad
(`rf3g-depth-before.txt`, `rf3g-callers.txt`, `rf3g-parity-before.txt`,
`rf3g-content-tests-before.txt`, `rf3g-contracts-tests-before.txt`).

- `tests/json-validator-parity.test.mjs`: passes with 23 equal verdicts and
  2 differing ("array with a named property": contracts accepts, content
  refuses; "array with a non-enumerable element": contracts refuses, content
  accepts).
- Depth probe on the built packages, an array nested around `1`:

  | Depth | contracts `jsonValueSchema` | content `normalizeJsonValue` |
  | ---: | --- | --- |
  | 1,000 | accepts | accepts |
  | 10,000 | accepts | `RangeError` |
  | 100,000 | accepts | `RangeError` |

- `normalizeJsonValue` callers: `blocks/definition.ts` (3),
  `fields/builders.ts` (2), `fields/layout.ts`, `fields/visibility.ts`, each
  passing a fresh `WeakSet`, plus its own recursion.
- Contracts users of `jsonValueSchema`, `jsonObjectSchema` and `isJsonObject`:
  `content/blocks.ts`, `content/entries.ts`, `content/entry-requests.ts`,
  `content/metadata.ts`, `content/models.ts`, `delivery/public.ts`,
  `errors/envelope.ts`, `openapi/json-schema.ts` and the entry `index.ts`.
- `vitest list`: content 115 tests, contracts 98 tests.

## 2. Implementation checks

- 2.1 `content/src/shared/json.ts` has one iterative walk behind
  `normalizeJsonValue(value, path)` and the new `isPortableJsonValue`. The
  seven callers dropped their `WeakSet` argument (the descriptor-cycle
  `WeakSet` passed to `normalizeDescriptor` is unrelated and kept). New
  `content/src/shared/json.test.ts` (5 tests). The same message, path and
  first-failure cases were run once against the previous recursive
  implementation (`git show HEAD:…/json.ts`, temporary copy, deleted
  afterwards). All passed except the 100,000-deep case, so messages, paths
  and order are unchanged.
- 2.2 The content packaged export list gained `isPortableJsonValue`, and
  `test:packaged` passes.
- 3.1 Contracts `jsonValueSchema`, `jsonObjectSchema` and `isJsonObject` call
  `isPortableJsonValue`. The local `isJsonValue` is deleted. New
  `contracts/src/shared/json.test.ts` (4 tests). Contracts tests (168) and
  `test:packaged` pass, and `pnpm openapi:check` reports no change.
- 3.2 `tests/json-validator-parity.test.mjs` expects one verdict per edge for
  both validators. The table now has 27 edges, including the two deep cases.
  `tests/shared-vocabulary.test.mjs` lists `isPortableJsonValue` and
  `isJsonValue`. As a negative check, a temporary `function isJsonValue` in
  `contracts/src/shared/json.ts` failed the guard with
  `duplicate isJsonValue`, and was reverted.

Deviations from design:

- Vitest's `expect(…)` on each of the 100,000 nested levels overflowed the
  test's own stack. The test counts identical levels in a plain loop and
  asserts once. The walk itself was confirmed against the built package.
- Oxlint `no-sparse-arrays` refuses hole literals in tests. The content test
  builds holes with `delete`.

## 3. Results

- Depth probe after the change: contracts and content accept 1,000, 10,000
  and 100,000 levels.
- `vitest list`: content +5 tests and contracts +4 tests, all in the new
  files. No test was removed or renamed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` pass.
- Root `pnpm test`: 64/64 Turborepo tasks, root suite 36 files / 326 tests,
  exit 0.
- `pnpm openapi:check`: no change to `api-v1.json`.
- `pnpm exec openspec validate rf03g-json-validator-parity --type change
  --strict`: valid.
