## ADDED Requirements

### Requirement: Packed consumer acceptance verifies standard preview activation
Acceptance SHALL start generated Node development and VPS deployments and the
generated Cloudflare Worker using their shipped entry points and configured
preview prerequisites. Local Worker acceptance can simulate the GitHub
transport by substituting provider responses at its external boundary.
Tests SHALL exercise the real persisted Lace session and route composition.
Activation SHALL use only deployment settings and the documented startup
workflow.

#### Scenario: Supported entry points are off or incomplete
- **WHEN** packed deployments start with the flag absent or false, or are explicitly enabled with incomplete prerequisites
- **THEN** preview is unavailable while sign-in, ordinary editing and publication behavior remain functional

#### Scenario: Supported entry points opt in
- **WHEN** each deployment is opt-in configured and an authorized editor requests a saved draft preview
- **THEN** the pinned Astro build produces a viewable page and private assets, unauthorized requests remain denied, and the published export and public site output do not change

#### Scenario: Opt-in is withdrawn
- **WHEN** an enabled deployment with a ready preview is restarted with preview disabled and its persistent data is preserved
- **THEN** existing viewer access and runner requests are rejected while the published output and ordinary operations remain available
