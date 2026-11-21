## MODIFIED Requirements

### Requirement: Preview setup is explicit and validated without enabling partial deployments
Generated project guidance and tooling SHALL describe the preview hostname,
site integration, source pinning, private storage, executor and credential
configuration for each runtime. The standard repository and generated Node
development workflows, Node VPS runtime and deployed Cloudflare Worker SHALL
support opt-in through the documented configuration. Activation SHALL require
the exact setting `LACE_PREVIEW_ENABLED=true` and valid runtime-local
prerequisites. An unset, false or invalid setting SHALL keep preview disabled,
including when other preview settings are present. Incomplete setup SHALL keep
creation unavailable while normal editing and publication continue to work.
Existing sites SHALL receive explicit adoption instructions and no-site
installations SHALL remain ineligible.

Readiness SHALL use validated operator settings and check integration
compatibility at the layer that can observe it. The runner SHALL check
compatibility before rendering the selected committed source. Runtime readiness
and the optional doctor check SHALL describe the scope of their local checks
without claiming a successful build or remote verification. Authorized
settings users SHALL receive safe disabled or incomplete-configuration reasons.
Doctor SHALL identify locally detectable missing prerequisites without
printing secrets, mutating the installation or changing the base installation
result solely because preview is unavailable.

#### Scenario: Existing deployment upgrades without preview settings
- **WHEN** the additive preview migration and packages are installed
- **THEN** existing content, publication and sign-in still work and preview creation stays hidden

#### Scenario: Retained settings without explicit activation
- **WHEN** a standard entry point starts with complete preview settings and an unset, false or invalid activation setting
- **THEN** Admin reports preview unavailable, and a creation request starts no generation and dispatches no work

#### Scenario: Opt-in with incomplete setup
- **WHEN** an operator opts in with missing or invalid runtime-local prerequisites
- **THEN** preview remains unavailable, authorized settings users see a safe configuration reason, and ordinary CMS operations still work

#### Scenario: Operator opts in on a supported entry point
- **WHEN** an operator provides the activation setting and valid prerequisites for a supported Node or Cloudflare deployment and an authorized editor requests a preview of an eligible saved draft
- **THEN** Admin offers Create preview and the standard entry point submits the pinned build to its configured executor through the existing preview lifecycle

#### Scenario: Configuration is complete but provider access fails
- **WHEN** a configured workflow rejects dispatch because its credential or quota is invalid
- **THEN** the operation fails with a safe provider reason and ordinary publication is unaffected
