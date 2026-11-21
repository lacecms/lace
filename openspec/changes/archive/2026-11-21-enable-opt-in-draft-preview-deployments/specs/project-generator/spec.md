## ADDED Requirements

### Requirement: Generated projects support optional protected draft preview
Generated starter and existing-site projects SHALL include the managed Node
development and VPS configuration and version-matched instructions needed to
opt in to preview. Cloudflare projects with a configured site SHALL document
activation for their standard deployed Worker, including the required preview
hostname, dedicated workflow, preview cron and private R2 binding. Default
configurations SHALL leave preview disabled and require no new secrets or
resources for normal startup. No-site projects SHALL omit preview-specific
deployment assets and activation instructions. Existing installations SHALL
be able to adopt the managed changes through the normal upgrade flow, with
operator-owned settings and source preserved.

#### Scenario: Generated project opts in to local Node preview
- **WHEN** an operator follows the generated development guide for a starter or compatible existing site
- **THEN** the preview is available while the normal local API, Admin, storage and site development commands remain usable

#### Scenario: Generated project opts in to hosted preview
- **WHEN** an operator applies the matching upgrade or uses a fresh template and follows the selected VPS or deployed Cloudflare guide
- **THEN** preview is available through the ordinary production entry point using the selected site's source and public base path

#### Scenario: Generate without a connected site
- **WHEN** a no-site project is generated with or without Cloudflare support
- **THEN** no preview runner, workflow, ingress configuration or preview opt-in instructions are emitted
