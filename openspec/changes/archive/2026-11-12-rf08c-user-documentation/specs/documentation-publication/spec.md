## MODIFIED Requirements

### Requirement: Automatic publication depends on changed documentation inputs

Pushes to `main` SHALL automatically publish documentation only when its declared effective inputs differ from the last successful documentation deployment, or when no successful deployment exists. Inputs SHALL include public sources/assets, routing/version settings, public OpenAPI input, the release metadata fields that pages render (the current release `version` and the published versions), relevant build scripts/configuration/toolchain and resolved documentation dependencies. Unrelated CMS code, internal `docs/**`, README/development prose, other release metadata fields and dependency changes outside the documentation build closure SHALL NOT independently request publication. Changing the documentation target or other metadata actually rendered publicly SHALL count as an input change.

The baseline SHALL advance only after deployment success. Unavailable caches SHALL NOT be interpreted as proof that input content changed. Inaccessible deployment history, an unavailable baseline revision or unresolvable input metadata SHALL produce a clear failed change-detection result rather than silently skipping or claiming successful publication. No deployment history is a valid first-publication state, distinct from a history-query failure.

#### Scenario: Unrelated main change
- **WHEN** `main` changes only CMS implementation, internal documents or an unrelated lockfile dependency
- **THEN** the publication check reports unchanged inputs and skips documentation build/upload/deploy work

#### Scenario: Relevant dependency change
- **WHEN** a resolved documentation dependency, public page, resource or rendered target setting changes
- **THEN** the workflow validates and builds the selected revision and publishes its documentation after successful checks

#### Scenario: Release version rendered in footers changes
- **WHEN** `main` changes the current release `version` or the published versions in the release metadata
- **THEN** the publication check reports changed inputs and publishes the documentation

#### Scenario: Unrendered release metadata changes
- **WHEN** `main` changes only release metadata fields that pages do not render, such as the package list or image names
- **THEN** the publication check reports unchanged inputs

#### Scenario: Failure followed by unrelated commit
- **WHEN** a docs deployment fails and the next main commit changes only unrelated code
- **THEN** the next comparison still detects the unpublished documentation inputs against the last successful deployment and retries publication

#### Scenario: Deployment history cannot be read
- **WHEN** authentication, an API error or unavailable baseline prevents a trustworthy comparison
- **THEN** the workflow fails with a diagnostic and preserves the last successful baseline and site
