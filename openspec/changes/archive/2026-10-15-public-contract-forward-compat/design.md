## Context

See proposal.md (Why). The public read schemas live in
`packages/contracts/src/index.ts`:

- `publicBlockSchema`, `publicEntrySchema`, `publicMediaSchema`,
  `publicMediaDictionarySchema`, `publicGlobalSchema`;
- `publicContentEntrySchema`, `publicGlobalContentSchema`,
  `publicContentListSchema`;
- `exportSeoSchema`, `buildExportSchema`, `errorEnvelopeSchema`;
- the nested `seoValueSchema` and `mediaFocalPointSchema`.

All of them use `v.strictObject`. They have exactly two runtime consumers:

- `packages/server/src/app.ts`: its `response()` helper parses every outgoing
  body, and `resolver()` feeds the OpenAPI document.
- `packages/sdk/src/client.ts`: its `read()`/`parseSchema()` path and
  `getBuildExport()`.

The admin parses only `errorEnvelopeSchema`, and it ships with its API.
`@lacecms/render` parses the block envelope field by field and already ignores
extra properties. `LaceHttpError.code` is typed as the closed `LaceErrorCode`
picklist.

## Goals / Non-Goals

**Goals:**
- Define each public read shape once and derive both a strict and a tolerant
  variant from it, so the two cannot drift.
- Keep the server's runtime output validation, the OpenAPI document and all
  existing strict tests unchanged in strictness.
- Let a newer API add keys or error codes without failing an older SDK of the
  same line.
- Give the build export an explicit structural version that later changes
  (pagination first) can build on.

**Non-Goals:**
- Changing admin request or response validation.
- Changing render-core rich-text, block-data or block-version validation.
- Negotiating versions over HTTP headers.

## Decisions

### D1. One definition, a derived tolerant family

The strict schemas stay the single definition. Their exported names
(`publicEntrySchema`, `buildExportSchema`, …) are unchanged, so server code,
tests and `resolver()` calls are unchanged.

A private `toTolerantSchema` rebuilds a strict schema tree:

- every `strict_object`/`object` becomes `v.object` with the same, recursively
  converted entries;
- `array`, `record`, `optional`/`nullable`/`nullish` (defaults kept), `union`
  and piped schemas (actions kept) are rebuilt around their converted
  children;
- every other leaf is reused as is, including the custom consumer-JSON
  leaves.

A substitution map swaps three specific nodes:

- the closed error-code picklist (D2);
- the export format literal (D3);
- the public block. The tolerant block first rejects any input that carries a
  `hidden` key, then parses the derived block. Stripping `hidden` would turn
  an undelivered block into rendered content, for example from a faulty or
  older server. Ignoring an unknown key is safe; ignoring this one is not.

`tolerantPublicSchemas` is a frozen object with one derived schema per public
read shape. It is typed as the strict schema's type, because `v.object` and
`v.strictObject` have identical inferred output. Contract tests
(`tolerant.test.mjs`) inject an unknown key into every contract-defined object
of a fixture, one at a time, and prove that strict rejects it while tolerant
returns the clean fixture. This guards the derivation against any schema it
does not convert.

Valibot `v.object` removes unknown entries from its output, so SDK results
never carry keys outside the contract.

Alternatives considered:
- *A `strict | tolerant` factory that builds both families from object
  constructors*: the union-typed schema trees risk TypeScript instantiation
  depth limits (TS2589, already met in this package). It also forces moving
  the admin-shared SEO and focal-point schemas. Rejected during
  implementation.
- *`v.looseObject`*: it keeps unknown keys. SDK results would then carry
  untyped data and could leak keys the contract deliberately excludes.
  Rejected.
- *A "strip unknown keys, then parse strict" pre-pass*: it duplicates the
  walk at every parse. Rejected.
- *Hand-written duplicate tolerant schemas*: they drift. Rejected.

Consumer-owned JSON (`fields`, block `data`, block `settings`) uses custom
JSON-object leaves. The derivation reuses them, so those values are never
stripped.

### D2. Error codes

The strict envelope keeps `errorCodeSchema` (the picklist). The tolerant
envelope uses a non-empty string of at most 128 characters.

`LaceHttpError.code` becomes `LaceErrorCode | (string & {})`. This keeps
autocomplete and narrowing for known codes and admits unknown ones. It widens
a public SDK type, and the release notes mention it. TypeScript `switch`
statements over known codes still compile.

### D3. `formatVersion`

- `@lacecms/contracts` exports `BUILD_EXPORT_FORMAT_VERSION = 1`.
  `toBuildExportDto` always sets it.
- The strict export schema uses `v.literal(BUILD_EXPORT_FORMAT_VERSION)`. The
  tolerant schema uses a positive safe integer.
- The SDK checks the parsed value after tolerant validation. A larger value
  throws `LaceUnsupportedExportFormatError`, a `LaceContractError` subclass
  with `received` and `supported` numbers. The loader recognizes that class
  and maps it to `invalid_export` with SDK-upgrade guidance. A dedicated
  class is used, rather than a message match, so that the mapping is
  type-safe and the message stays free to change.

The value is placed in the body, not an HTTP header. It must survive caching
proxies, `304` handling and the later page-by-page assembly, and the SDK
already validates the body.

Alternative: reuse the export `version` or the release version. Rejected.
`version` is the published-content counter, and release versions change for
unrelated reasons.

### D4. Where strictness lives

- **Runtime server output:** strict, through the unchanged `response()`
  helper. An implementation bug that adds an undeclared key fails at the
  origin and in tests.
- **Tests:** contracts, server, repository and cross-runtime tests keep
  validating with the strict exports. New tests prove strict/tolerant parity
  (see tasks).
- **SDK:** tolerant only. The SDK never imports the strict family for
  response parsing.

### D5. Evolution policy (documentation)

`docs/compatibility.md` gains a "Public contract evolution" section, and
architecture sections 12 and 22 reference it:

- Additive keys are compatible within `/api/v1` and an export format.
- Removals, type changes or semantic changes require a new export
  `formatVersion` or `/api/v2`.
- Within one major line, the API must be the same or a newer minor than the
  site's `@lacecms/sdk`.
- Rich-text grammar, block `schemaVersion` matching and block data validation
  remain strict on purpose.

## Risks / Trade-offs

- [The OpenAPI document still emits `additionalProperties: false` for public
  DTOs. Third-party generated clients may be strict.] → The compatibility
  section tells external consumers to ignore unknown properties. OpenAPI
  describes current server output, which is accurate.
- [A newer server could change a value's meaning without adding a key, and a
  tolerant SDK would accept it silently.] → The policy forbids this without a
  format bump or `/api/v2`. Strict server tests catch undeclared shape
  changes.
- [Stripping unknown keys hides data a newer server sends.] → This is
  intended. Consumers that need new data upgrade the SDK.
- [Widening the `LaceHttpError.code` type could surprise exhaustive checks
  that use `never`.] → Documented in the release notes. Practical breakage is
  limited to code that assigns `code` to `LaceErrorCode`.

## Migration Plan

- No database or configuration migration is needed. API, admin and site
  packages of one release are deployed together, as today.
- The SDK of this release rejects exports from earlier APIs, which lack
  `formatVersion`. Mixing releases is already unsupported.
- Rollback restores the previous package set. No data is involved.
