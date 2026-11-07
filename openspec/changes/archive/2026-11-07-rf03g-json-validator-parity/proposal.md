## Why

Roadmap step RF3 (shared vocabulary), session RF3G. RF3E found that the
contracts JSON validator (`isJsonValue` behind `jsonValueSchema`) and the
content normalizer (`normalizeJsonValue`) accept different sets. They differ on
two array cases, which `tests/json-validator-parity.test.mjs` records:

- an array with a named property is accepted by contracts only;
- an array with a non-enumerable element is accepted by content only.

Owner decision (2026-11-07): the content rule is canonical, because it matches
`JSON.stringify`. A named array property disappears when the value is
serialized, so accepting it hides data loss. A non-enumerable element is read
by index and serialized normally, so refusing it rejects a value that
serializes correctly.

The content walk is recursive. It throws `RangeError` on values nested about
10,000 levels deep, while the contracts walk accepts any depth that
`JSON.parse` produces. The default request body limit of 1 MiB allows far
deeper nesting. Delegating contracts to the current recursive walk would turn
such a request into a stack overflow instead of a normal validation result.
The shared walk must therefore be iterative.

## What Changes

- `@lacecms/content` exports a non-throwing portable-JSON check. It and
  `normalizeJsonValue` share one iterative walk, so the two cannot drift
  apart again. `normalizeJsonValue` keeps its accepted set, failure messages
  and paths, and gains depth safety.
- Contracts `jsonValueSchema`, `jsonObjectSchema` and `isJsonObject` use the
  content check, and the contracts `isJsonValue` copy is deleted.
- Externally visible: the exported contracts `jsonValueSchema` and
  `jsonObjectSchema` refuse an array with a named property and accept a
  non-enumerable array element. Request schemas built on them (entry
  `fields`, block `data` and `settings`, error `details`) follow the same
  rule. `JSON.parse` cannot produce either case, so HTTP requests are not
  affected. Only values that callers build in JavaScript and validate in
  process are.
- Content builders, block definitions, layouts and visibility rules accept
  deeply nested portable JSON instead of throwing `RangeError`.
- `tests/json-validator-parity.test.mjs` expects no difference. Package tests
  pin the accepted set and the depth behavior.

Non-goals: no new depth limit; no change to canonical JSON serialization,
field-value validation or the OpenAPI document; the CLI keeps its own
`jsonObjectSchema` (RF7C).

Dependencies: RF3E and RF3F archived. Must land before RF9A, as the roadmap
orders it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: adds the rule that contracts JSON values accept exactly
  the content portable-JSON set, at any depth.
- `field-descriptors`: *Serializable normalized configuration* names the two
  array cases and requires depth-safe normalization.

## Impact

- Architecture §12 *Contract rules* (transport validation) and §8
  *Configuration projection* (portable configuration). No invariant changes.
- Code: `packages/content/src/shared/json.ts` and its entry export;
  `packages/contracts/src/shared/json.ts`; new package tests beside both;
  `tests/json-validator-parity.test.mjs`; the content packaged-export list.
- Public API: one new `@lacecms/content` export. The contracts exports keep
  their names, and their accepted set narrows and widens by the two cases.
  The RF3G entry is listed in roadmap §5 item 9 as a CHANGELOG candidate.
