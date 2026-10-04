## ADDED Requirements

### Requirement: Real-account deployment handoff is explicit
The repository SHALL provide a Cloudflare real-account deployment handoff for the release gate that lists: the account products and API-token permissions required; every resource to create and the IDs and names to record; Worker secrets and plain variables; the order provision, configure, secrets, remote migrate, remote sync, Worker deploy, remote bootstrap and browser setup; the static-hosting integration through a Git-connected Pages project with its build settings, build variables and read-only build token, and the deploy hook stored as the Worker secret; the evidence to capture and the pass criteria; and cleanup. The handoff SHALL distinguish a provider accepting a deploy hook from a confirmed successful static deployment, and SHALL state that local Worker acceptance, including Miniflare-backed D1 and R2, is not real Cloudflare deployment acceptance. It SHALL contain no usable credential, account ID or resource ID.

#### Scenario: Release gate prepares a real deployment
- **WHEN** a release owner follows the handoff with a dedicated Cloudflare account
- **THEN** every account mutation is an explicit step with its prerequisite permissions and every value to record is named without being supplied

#### Scenario: Local acceptance passed
- **WHEN** only the packed Cloudflare consumer acceptance has passed
- **THEN** the handoff and generated guidance still report real-account deployment as unverified until the release-gate evidence exists

#### Scenario: Hook accepted during the release gate
- **WHEN** the deployed Worker records a build as running with a provider deployment ID
- **THEN** the handoff requires separately confirming the provider's deployment result and the served page before the static deployment counts as verified
