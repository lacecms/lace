## MODIFIED Requirements

### Requirement: Packed artifacts are complete external packages
Packed public packages SHALL contain resolvable compiled ESM exports and declarations, declared executable entry points where applicable, checked-in database migrations where required, the generator's complete classified templates, and, in the Cloudflare platform package, the compiled admin application of the same source revision in its packaged admin directory. All packed Lace dependency references SHALL resolve to the exact release version; packed third-party dependencies SHALL resolve to concrete registry-compatible versions. Packed dependency metadata SHALL NOT contain `workspace:`, `catalog:`, source-checkout paths or test-only tarball overrides. Archives SHALL exclude credentials, local runtime data, test fixtures, editable admin source and node_modules.

#### Scenario: External archive use
- **WHEN** an operator inspects and extracts the prepared archives outside the engine checkout
- **THEN** declared exports, CLI executables, migration inventory, template assets and packaged admin assets are present and dependency metadata resolves through the public registry

#### Scenario: Missing asset or local dependency
- **WHEN** an archive omits a declared entry point, migration or the packaged admin entry document, or references a workspace/local acceptance artifact
- **THEN** verification fails with the package and missing or invalid item identified
