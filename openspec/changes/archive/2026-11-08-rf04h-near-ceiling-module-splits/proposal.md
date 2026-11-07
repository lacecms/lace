## Why

RF4H, the near-ceiling module session of Step RF4 in `docs/refactoring-roadmap.md`, splits mixed-responsibility files before ordinary feature work pushes them past the 1,000-line ceiling. Architecture §6 and ADR 0020 require domain ownership, acyclic imports and companion tests; this is a behavior-preserving refactor after RF4A–RF4G and RF4X, independent of the already archived RF4I.

## What Changes

- Split application configuration evolution into structure comparison, hint validation and snapshot evidence; replace the catch-all plan support with responsibility-owned helpers.
- Split content use-case validation/projection concerns and media use-case inputs, upload and metadata helpers into concrete modules while retaining the existing public classes and their behavior.
- Split content field builders from descriptor normalization and metadata, and block definitions from settings, registry and migrations. Keep the existing package entry exports and type signatures.
- Move the dispatcher event and lease contracts from the generic infrastructure port to a concrete outbox port; update internal imports and entry exports.
- Extract duplicated configuration test fixtures to a typed `src/test-support/` module, and split tests accompanying moved production responsibilities. Preserve test titles and coverage; type split companions under the RF4X rule. Correct the existing invalid plan assertions discovered during typing so they exercise the intended plan and operations.
- Record the outcome in the roadmap. No changes to authorization, synchronization, persistence, wire formats, error semantics, exports, dependencies or runtime behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: `skip_specs: true`. Existing requirements remain authoritative, particularly `configuration-synchronization`, `field-descriptors`, `content-domain-rules`, and `workspace-governance`. No normative behavior changes are proposed.

## Impact

- `packages/application/src/{configuration,content,media,ports,outbox}`, `packages/content/src/{fields,blocks}`, package entries and adjacent tests; a typed application test-support fixture.
- Both Node and Cloudflare retain identical domain and application behavior. No schema, migration or external API change.
- Architecture §6, ADR 0020, RF4X guards and the accepted capability specs remain unchanged. RF4J and RF9's broader test work are outside this session.
