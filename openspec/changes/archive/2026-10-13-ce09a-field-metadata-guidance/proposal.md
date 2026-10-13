## Why

CE9A — Field metadata and guidance, in Wave 4 of `docs/content-editor-roadmap.md`, makes configured forms explain what authors can enter before they encounter a validation error. CE8A/CE8B are complete; field placeholders, required guidance and ordinary text counters are the next independently verifiable session.

## What Changes

- Add optional portable `placeholder` display metadata for text, textarea, URL, number, select and rich-text descriptors, including supported nested model fields and block data/settings. Omission retains existing control behavior; unsupported descriptor kinds reject the option.
- Exclude descriptor placeholders from structural identity while retaining them in projection identity. Metadata-only synchronization requires no model-version bump or content rewrite.
- Standardize visible required markers, publication-only explanations, associated descriptions and applicable constraint hints for scalar and composite fields, including viewer inspection.
- Show text/textarea counts and declared bounds using the same raw UTF-16 length as their validators. Retain SEO's trimmed code-point counting and distinguish its advisory recommendations from hard limits. Do not announce counts on every keystroke.
- Preserve existing inherited SEO/media explanations and placeholder precedence. Add configuration and author guidance, regression coverage and accessibility verification.
- Correct the stale admin scenario that treats missing required model fields as draft-save errors: architecture section 17, accepted composite behavior and current validation permit incomplete drafts.

Scope is CE9A only. Non-goals: CE9B layout, tabs/order configuration or slug suggestions; conditional forms; per-field rich-text restrictions; changing defaults, content validation, count semantics, public content JSON, database schema or migrations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `field-descriptors`: supported, validated portable placeholder option and shared counting contract.
- `content-model-configuration`: descriptor-position placeholder exclusion from structural identity.
- `configuration-synchronization`: placeholder-only changes are projection updates preserving snapshots.
- `rest-contracts`: recursive placeholder metadata survives validated model/block transport.
- `admin-draft-editor`: placeholders, consistent required/constraint guidance and accessible counters; correct incomplete-draft scenario.

## Impact

Grounded in architecture sections 4.8, 8 (portable descriptors and projection), 12 (validated REST metadata), 17 (recursive forms and SEO), and 20 (verification), plus the five accepted capabilities above. The MVP roadmap entry redirects new work to the content/editor roadmap.

Affected code: `packages/content/src/index.ts` descriptor builders/normalization and shared length helper; `packages/config/src/index.ts` canonical structure; contracts metadata validation and `packages/contracts/src/field-openapi.ts`; existing sync tests; admin `FieldRenderer`, `FieldControls`, rich-text placeholder integration and SEO count/guidance utilities. Existing media override renderers must receive associated guidance. Add no runtime dependencies. Use existing test suites and the root typecheck, lint, format and strict OpenSpec checks.

Externally visible outcomes: authors see configured empty-state prompts, required-for-publication explanations and accurate counts throughout nested forms; viewers can inspect the same guidance without mutation actions. Placeholder-only configuration updates preserve stored content and published content values.
