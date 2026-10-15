## Why

Before the release candidate, the public delivery contract must survive additive
evolution. Today every public DTO in `@lacecms/contracts` is a
`v.strictObject`, and `@lacecms/sdk` validates server responses with those
same schemas. The SDK therefore rejects any new key: the CE5 `globals`, CE4A
`seo` and CE6A block-envelope additions already broke every older SDK
(docs/compatibility.md). After RC, every planned additive feature (responsive
image variants, resolved entry links, media tags) would break deployed site
builds the same way. That would force CMS and site upgrades in lockstep even
within one SemVer line.

This change is pre-RC contract hardening, session unit 1 of 2. It is not a
backlog item. It follows the alpha.5 candidate (`prepare-alpha-five-release`)
and precedes the paginated build export (`paginated-build-export`), which
reuses the tolerant schemas and the format version introduced here.

## What Changes

- `@lacecms/contracts` keeps the existing strict public read schemas (public
  entry, global, block, media, media dictionary, SEO value, export SEO
  section, content/global/list responses, build export, error envelope) as the
  authoritative server-side contract. It adds a derived **tolerant consumer**
  family of the same schemas. The tolerant schemas ignore and strip unknown
  object keys at every depth, but still enforce every required key, every
  value type and every value constraint the strict schema enforces.
- `@lacecms/sdk` validates every public response, error envelopes included,
  with the tolerant family. A response with additional keys parses
  successfully and yields exactly the known DTO shape. A response missing a
  required key or carrying a wrong type is still rejected with
  `LaceContractError`.
- The SDK accepts an error envelope whose `code` is not yet known to it. It
  preserves the code as a string on `LaceHttpError`, so a newer server's new
  error code is reported, not turned into a contract error.
- The server keeps validating every public response with the **strict**
  schemas at runtime. Contract, server and repository tests keep asserting
  strict conformance, so new keys enter the contract only deliberately
  (strict schema change plus OpenAPI regeneration).
- The build export gains a required integer `formatVersion` (initially `1`).
  The SDK declares the highest export format it supports. An export with a
  higher `formatVersion` fails with a contract error that tells the operator
  to upgrade `@lacecms/sdk`. The published-site loader reports this as
  `invalid_export` with that guidance.
- **BREAKING (pre-RC only):** the strict build-export schema requires
  `formatVersion`. An export from an alpha.5 or older API fails validation in
  the new SDK. Mixing releases is already unsupported (docs/compatibility.md,
  Alpha release line).
- Documentation records the public-contract evolution policy:
  - Additive keys are compatible within `/api/v1` and an export format.
  - Removing or retyping a key, or changing its meaning, requires a new export
    `formatVersion` or `/api/v2`.
  - The CMS of a major line must be the same or newer minor than the site's SDK.
  - Rich-text grammar, block `schemaVersion` matching and block data
    validation stay strict, because they are safety and rendering contracts,
    not transport shapes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: public read schemas exist in strict (server/test) and
  tolerant (consumer) variants; the build export carries `formatVersion`; the
  "reject unknown keys" rule becomes strict-variant-only.
- `public-sdk`: response validation uses tolerant schemas, keeps rejecting
  missing or mistyped required values, preserves unknown error codes, and
  rejects unsupported export formats.
- `published-site-loader`: an unsupported export format fails with
  `invalid_export` and SDK-upgrade guidance.

## Impact

- **Architecture:** section 12 contract rules and section 22 (migration and
  compatibility policy) gain the evolution policy. No invariant changes. The
  REST surface stays `/api/v1`.
- **Code:**
  - `packages/contracts/src/index.ts`: tolerant schema derivation, exports and
    types, `formatVersion`, and a supported-format constant.
  - `packages/server/src/app.ts` and `toBuildExportDto`: emit `formatVersion`.
  - `packages/sdk/src/client.ts` and `published-site.ts`: tolerant parsing,
    unknown error codes, format check.
  - `apps/api/openapi/api-v1.json`: regenerated.
- **Tests:**
  - Contract tests cover strict and tolerant parity.
  - SDK tests cover unknown keys at every depth, missing required keys,
    unknown error codes and a future format.
  - Server, cross-runtime and acceptance tests keep strict assertions.
- **Dependencies:** none added. Valibot `v.object` (strips unknown keys)
  already ships with the pinned Valibot 1.4.2.
- **Non-goals:**
  - Paginating the export: that is `paginated-build-export`.
  - Relaxing admin request validation or admin DTO parsing. The admin is
    bundled with its API.
  - Tolerating unknown rich-text nodes or marks.
  - Accepting block data for a newer block `schemaVersion`.
  - Version negotiation headers.
  - `/api/v2`.
