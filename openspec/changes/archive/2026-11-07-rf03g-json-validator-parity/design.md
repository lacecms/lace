## Context

Two walks exist today:

- `packages/content/src/shared/json.ts` `normalizeJsonValue(value, path,
  ancestors)` is recursive. It returns a mutable copy and throws
  `FieldConfigurationError` through `fail(path, message)`. Seven callers in
  `blocks/definition.ts`, `fields/builders.ts`, `fields/layout.ts` and
  `fields/visibility.ts` each pass a fresh `WeakSet`. The function is internal:
  the content entry exports only the `JsonPrimitive`, `JsonValue` and
  `JsonObject` types.
- `packages/contracts/src/shared/json.ts` `isJsonValue` is iterative, with an
  explicit stack and exit markers for cycle detection. It is a non-throwing
  predicate behind `jsonValueSchema`, `jsonObjectSchema` and `isJsonObject`.
  These are used by request DTOs (`content/entries.ts`, `entry-requests.ts`,
  `blocks.ts`, `delivery/public.ts`, `errors/envelope.ts`) and metadata guards
  (`content/metadata.ts`, `content/models.ts`).

Measured on the built packages: both walks accept a 1,000-deep array. At
10,000 and 100,000 levels, contracts accepts and content throws `RangeError`.

Contracts already depends on `@lacecms/content` at runtime (`MAX_PAGE_SIZE`,
`LaceError`), and contracts `shared/` may import it. No boundary changes.

Neither JSON module has a package test. `tests/json-validator-parity.test.mjs`
is the only coverage of the accepted set.

## Goals / Non-Goals

**Goals:**

- One accepted set, defined once in `@lacecms/content`: the current content
  rule.
- A non-throwing check for contracts, built from the same walk as
  normalization.
- Depth safety for both, with no new depth limit.
- Unchanged failure messages, failure paths and first-failure order for
  `normalizeJsonValue`.

**Non-Goals:**

- Canonical JSON serialization, field-value validation and other recursive
  consumers of already-validated values.
- The CLI `jsonObjectSchema` in `cli/src/import-format.ts`. The CLI may not
  import content, so RF7C owns it.
- OpenAPI output. `contractJsonSchemaOverride` compares schema identity,
  which stays the same.

## Decisions

### D1. One iterative walk in `content/shared/json.ts`

A single internal function walks the value with an explicit stack. It
returns either the first failure (`{ path, message }`) or success. In copy
mode it also builds the detached copy. On top of it:

- `isPortableJsonValue(value: unknown): value is JsonValue` runs the walk
  without copying and returns whether it succeeded. It is exported from the
  content entry.
- `normalizeJsonValue(value, path)` runs it in copy mode and calls `fail` on
  a failure. The unused `ancestors` parameter goes, and the seven callers
  drop their `new WeakSet()` argument.

The checks keep content's per-node order: for an array, every own key first
(non-index or symbol, then missing or accessor descriptor), then holes by
index, then the elements. For an object, the prototype first, then each own
key in `Reflect.ownKeys` order (symbol, missing descriptor, accessor,
non-enumerable), then its value. The walk pushes children in reverse order,
so it visits nodes in the same depth-first order as the recursion and
reports the same first failure.

Cycle detection keeps an ancestor set. A node leaves the set when its
subtree is done, using the exit marker that contracts already uses, so an
acyclic shared reference is still accepted.

Path strings are built only on failure: each stack frame keeps its parent
frame and segment. A valid 1 MiB body then allocates no path strings.

Rejected: wrapping the recursive `normalizeJsonValue` in `try/catch` inside
contracts. It keeps the stack overflow, copies every validated body, and uses
exceptions for an ordinary validation outcome. Also rejected: moving the
contracts iterative predicate into content and keeping the recursive
normalizer. That leaves two walks to keep in agreement.

### D2. Contracts delegates and deletes its copy

`contracts/src/shared/json.ts` keeps its exports (`jsonValueSchema`,
`jsonObjectSchema`, `isJsonObject`). `jsonValueSchema` becomes
`v.custom<JsonValue>(isPortableJsonValue)`, and `isJsonObject` checks for a
non-array object and then calls `isPortableJsonValue`. The local `isJsonValue`
is deleted. The vocabulary guard `tests/shared-vocabulary.test.mjs` adds
`isPortableJsonValue` and `isJsonValue` to its `names` list. That list
already refuses a `function` declaration of a listed name anywhere outside
`packages/content/src/`, as it does for `isRecord`.

### D3. Tests

- `content/src/shared/json.test.ts`: the accepted set; failure messages and
  paths for each refusal, including the named-array-property path; detached
  copy; a 100,000-deep value normalizes; a deep value with an innermost
  `undefined` fails with a path ending in that level; a shared acyclic
  reference is accepted; first-failure order when two problems exist.
- `contracts/src/shared/json.test.ts`: the two former differences through
  `jsonValueSchema` and `jsonObjectSchema`; a 100,000-deep value accepted
  and an invalid deep value refused without throwing.
- `tests/json-validator-parity.test.mjs`: the edge table expects equal
  verdicts, and the deep cases join it.
- Packaged export list for content gains `isPortableJsonValue`.

## Risks / Trade-offs

- [Path building differs from the recursive form] → exact messages and paths
  are asserted in the new content tests. The existing builder, block and
  layout tests that assert messages must pass unchanged.
- [Performance on large request bodies] → the walk does no copying and builds
  no strings on success. Its cost matches the contracts walk it replaces.
- [Public behavior change in contracts] → limited to values built in process.
  Recorded as a CHANGELOG candidate in roadmap §5 item 9.
- [Other recursive consumers can still overflow on deep values] → out of
  scope. This change fixes only the two portable-JSON walks. Any later
  recursive step on a value that already passed them keeps its current
  behavior.
