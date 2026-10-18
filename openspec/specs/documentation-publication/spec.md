# Documentation Publication Specification

## Purpose

Publish changed public documentation from main to GitHub Pages with verifiable build inputs, restricted deployment permissions and recoverable publication failures.

## Requirements

### Requirement: Pull requests validate without publishing

Pull requests SHALL validate the documentation application's content/configuration and build when its declared build inputs change. They SHALL NOT deploy Pages or receive deployment write permissions. The repository's existing required quality checks SHALL continue to run without being skipped through documentation-only workflow path filters. An invalid page, unsupported locale/version declaration, broken local page/resource/fragment link or missing required public section SHALL fail documentation validation before publication. Search, root entry and resources SHALL be verified against the configured `/lace/` base.

#### Scenario: Documentation pull request
- **WHEN** a pull request changes a public page or its build configuration
- **THEN** documentation checks and build run without a Pages deployment, including for a fork-origin pull request

#### Scenario: Broken local link
- **WHEN** a changed page points to a missing local page, fragment or image
- **THEN** validation fails with an actionable source/target diagnostic and no deployment is attempted

### Requirement: Automatic publication depends on changed documentation inputs

Pushes to `main` SHALL automatically publish documentation only when its declared effective inputs differ from the last successful documentation deployment, or when no successful deployment exists. Inputs SHALL include public sources/assets, routing/version settings, public OpenAPI input, relevant build scripts/configuration/toolchain and resolved documentation dependencies. Unrelated CMS code, internal `docs/**`, README/development prose, unrelated release metadata and dependency changes outside the documentation build closure SHALL NOT independently request publication. Changing the alpha.6 target or other metadata actually rendered publicly SHALL count as an input change.

The baseline SHALL advance only after deployment success. Unavailable caches SHALL NOT be interpreted as proof that input content changed. Inaccessible deployment history, an unavailable baseline revision or unresolvable input metadata SHALL produce a clear failed change-detection result rather than silently skipping or claiming successful publication. No deployment history is a valid first-publication state, distinct from a history-query failure.

#### Scenario: Unrelated main change
- **WHEN** `main` changes only CMS implementation, internal documents or an unrelated lockfile dependency
- **THEN** the publication check reports unchanged inputs and skips documentation build/upload/deploy work

#### Scenario: Relevant dependency change
- **WHEN** a resolved documentation dependency, public page, resource or rendered target setting changes
- **THEN** the workflow validates and builds the selected revision and publishes its documentation after successful checks

#### Scenario: Failure followed by unrelated commit
- **WHEN** a docs deployment fails and the next main commit changes only unrelated code
- **THEN** the next comparison still detects the unpublished documentation inputs against the last successful deployment and retries publication

#### Scenario: Deployment history cannot be read
- **WHEN** authentication, an API error or unavailable baseline prevents a trustworthy comparison
- **THEN** the workflow fails with a diagnostic and preserves the last successful baseline and site

### Requirement: Deployment authorization is limited to trusted main builds

Automatic and manual publication SHALL deploy only a verified `main` revision from this repository. The publish path SHALL use the built static artifact, GitHub's Pages deployment mechanism, the `github-pages` environment and short-lived workflow credentials, with contents/history read access and Pages/OIDC write permissions restricted to jobs requiring them. No personal access token or CMS/cloud infrastructure secret SHALL be required. A manual run on another branch SHALL NOT deploy. Operator guidance SHALL explain enabling Actions as the Pages source, required environment/branch policy and the expected site URL.

#### Scenario: Main publication
- **WHEN** an eligible main revision passes documentation validation
- **THEN** the artifact is deployed using workflow credentials and the run reports the resulting Pages URL and source revision

#### Scenario: Manual feature-branch run
- **WHEN** manual publication is requested against a feature branch
- **THEN** publication is refused or explicitly skipped before obtaining deployment write authority

### Requirement: Publication is recoverable and ordered

The publication path SHALL provide a manual main-only force-republish option for retry/recovery without editing content. Eligible deployments SHALL be serialized, and an older run SHALL NOT replace documentation already successfully deployed from a newer main revision. The input comparison and stale-run decision SHALL use a refreshed successful baseline inside the serialized publication path. A failed build, validation, upload or deployment SHALL NOT mark the candidate as successfully published or advance its comparison baseline. Failure before deployment SHALL leave the existing site intact; provider deployment errors SHALL retain the prior successful deployment as the recovery reference.

#### Scenario: Concurrent main pushes
- **WHEN** two main runs become eligible close together or an older run is rerun after a newer revision was deployed
- **THEN** deployment is serialized and the older revision cannot overwrite the newer successfully published documentation

#### Scenario: Manual recovery
- **WHEN** an operator requests force republishing from main with unchanged inputs
- **THEN** validation/build/deployment can run again and only a successful result updates publication state

#### Scenario: Build failure
- **WHEN** documentation validation or build fails
- **THEN** no candidate artifact is deployed and the next eligible run compares with the previous successful publication
