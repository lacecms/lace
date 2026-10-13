## Context

See proposal.md for motivation and scope. `packages/content/src/index.ts` owns
closed document types, exact-key validation, child grammar, default validation
and URL safety. `packages/render/src/rich-text.ts` validates before describing
immutable elements; its attributes currently contain only href.
`RichTextNodes.astro` special-cases br and links and otherwise renders dynamic
tags. Render tests already contain a content/render parity corpus; Astro has
container rendering tests for blocks but no dedicated RichText rendering test.
The reference site has a published-export JSON fixture and fixture-build test.

## Goals / Non-Goals

Goals: keep one portable grammar and independently verify public rendering
before CE8B editor changes. Preserve the shared URL policy, nested budgets,
error paths and existing documents.

Non-goals: admin changes, new dependencies, persistence changes, schema-version
bumps, migration of stored content and syntax highlighting.

## Decisions

### Closed additive document grammar

Add H4, attribute-free horizontalRule and optional-content codeBlock to shared
types and validation. Code children are unmarked text only. Permit rules/code
at root and within existing listItem/blockquote containers; do not broaden
other parent-child rules. Empty code blocks are valid. A language attribute,
even null, is rejected; CE8B must configure its editor serialization accordingly.
This fits plain code without importing Tiptap into the portable package.

### Minimal stored link attributes

Use only optional target `_blank` and rel `nofollow`, with omission for false.
Keep href mandatory and the existing URL validation. Reject null, empty strings,
`_self`, arbitrary tokens and even renderer safety tokens in stored JSON.
Boolean custom attributes would diverge from standard Tiptap link attributes;
arbitrary target/rel would unnecessarily expand the public format.

### Renderer derives safety attributes

Extend RichTextTag with h4/hr/pre and attributes with restricted target and
safe generated rel values. Compose deterministic rel `noopener noreferrer`
then optional `nofollow`. Describe codeBlock as pre/code with original text;
both elements carry source codeBlock, following the existing override-per-element
model. Astro handles hr as a void element and renders validated link attributes.
No string HTML serializer or set:html is introduced. Test actual container output,
including override props and no extra whitespace inside pre/code.

### Existing shared validation remains authoritative

Defaults and nested leaves already funnel into the shared validator. Extend
coverage there instead of creating separate normalization rules or site-local
allowlists. Preserve CE7 per-list/aggregate counts and draft/publish semantics.
No authorization or transaction boundary changes: the grammar is pure and shared
across Node and Cloudflare. Existing path-aware errors remain the diagnostic.

### Documentation before implementation

First update architecture 11 with the exact expanded grammar, 13 with rendering
attributes, and 17 to distinguish current authoring controls from the CE8B planned
extensions. Record a short ADR and update the roadmap session state. Accepted
main specs remain unchanged until explicit synchronization. Add format/adoption
and rollback guidance in docs/compatibility.md and reference fixture coverage.
No separate planning-only commit: the user requested the first wave commit to
contain CE8A implementation together with these planning artifacts.

## Risks / Trade-offs

- Older engines/renderers reject new content → upgrade CMS and site packages
  together before authoring new nodes; document rollback limitations.
- Current admin cannot preserve expanded documents on editing → CE8A fixtures
  exercise public rendering only; defer author production and safe save/reload
  to CE8B and explicitly document the interim limitation.
- Code serialization and Astro formatting can alter whitespace → verify exact
  escaped code output with leading/trailing whitespace, tabs and multiple lines.
- Renderer-derived rel can drift from stored validation → parity and all four
  link-combination tests distinguish accepted input from generated attributes.

## Migration Plan

No SQL migration or stored-document rewrite. Release CMS and site rendering
packages together; old JSON remains valid. Consumers adopting custom renderers
or overrides must support the expanded elements and validated attributes. Before
rolling back, restore a backup predating expanded documents or remove expanded
features explicitly; do not silently strip content. CE8B gates production of
these documents by the admin. Do not release authoring support in CE8A alone.
