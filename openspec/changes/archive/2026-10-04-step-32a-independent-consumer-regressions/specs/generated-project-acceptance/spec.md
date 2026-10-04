## MODIFIED Requirements

### Requirement: Generated Node project passes an operator and content journey

Acceptance SHALL exercise a generated project's Node setup in the order its generated README documents, against the project's own configuration and persistent state. It SHALL extract the shell commands of the README's installation and "Prepare and start the CMS" sections and fail when they differ from the reviewed sequence or name a missing package script. It SHALL then:

- prepare `.env` with the generated preparation command and change only the settings the README asks the operator to review (images, ports and the public/API origins), keeping every generated credential;
- run the read-only doctor at the `setup` stage and require success with the not-yet-started API and the missing database reported as expected;
- migrate without creating the database directory beforehand and require the migration to create it, then synchronize configuration, issue a bootstrap token and start the API with the documented start command;
- in a real browser against the packaged admin, open the admin while setup is incomplete, create the first administrator on the setup screen with the bootstrap token, sign in, complete the introductory tour with exactly the administrator's permitted steps, confirm that completion persists across a reload and that the tour can be replayed, and upload an image through Media;
- after setup, require a repeated bootstrap to be refused with its operation, cause and next action and without a token;
- publish an edit containing all five built-in blocks with the uploaded media, issue a read-only build token, build the Astro site and confirm it contains the published content and browser-facing media URLs that return the uploaded bytes.

It SHALL redact credentials from failure diagnostics after the one intentional bootstrap reveal and SHALL never place the bootstrap token in a URL.

#### Scenario: Published content journey
- **WHEN** a fresh generated Node project is installed and started by following its README
- **THEN** the operator commands prepare its environment and database, an administrator created in the browser setup screen can log in, tour the admin and publish an edit, and the Astro build contains the published content and media

#### Scenario: README sequence drifts
- **WHEN** the generated README's setup commands differ from the sequence acceptance executes
- **THEN** acceptance fails at the README stage naming the differing command

#### Scenario: Directory pre-created
- **WHEN** the database directory exists before the first migration
- **THEN** acceptance fails rather than accepting a migration that did not create it

#### Scenario: Operator failure
- **WHEN** an acceptance step fails after bootstrap
- **THEN** diagnostics identify the failed step without repeating the bootstrap token, password, or complete secret environment values

## ADDED Requirements

### Requirement: Full acceptance is the onboarding feedback regression suite

The repository's full generated-project acceptance run SHALL, from one packed Lace package graph, run in sequence the byte-stable snapshot check, the README-driven generated Node consumer, its Compose production release, the static-site preview of a generated `--cloudflare` project, the dev/manual/automatic publication visibility journey, the existing-Astro consumer, the packed Cloudflare consumer journey and the upgrade from alpha template `0.4.0`. It SHALL stop at the first failing stage with that stage's name and a non-zero exit, SHALL refuse to run while the publication-visibility observe-only mode is requested, and SHALL remove every temporary project, container, volume and process unless retention is requested.

#### Scenario: Complete regression run
- **WHEN** the full acceptance runs on a clean checkout with Docker, Chromium and the supported Node and pnpm versions
- **THEN** every consumer journey passes and the run reports success only after the last stage

#### Scenario: Observe-only visibility requested
- **WHEN** the full acceptance is started with publication-visibility observation enabled
- **THEN** it fails before generating a project, because observed mismatches would not fail the run

#### Scenario: Visibility mismatch
- **WHEN** published, draft-only or newly routed content is visible differently from the documented dev, manual-static or automatic-Compose behavior
- **THEN** the run fails at the visibility stage and lists each mismatch

### Requirement: Existing-Astro consumer follows the connection guide

Acceptance SHALL generate a CMS in a `cms/` subdirectory of an independent Astro site with the existing-site mode, without changing the site, and SHALL connect the site by following the generated connection guide: the loader, TypeScript declaration and route files SHALL be written from the guide's code blocks, the Lace site packages SHALL be installed from packed artifacts, and the block components, block map and block lock SHALL be installed only by the packaged `lace add block --all --site ..`. It SHALL:

- prepare the CMS environment and require the resolved Compose configuration to mount the parent site read-only as the build source with the site directory `.` and output `dist`, and the packaged doctor to report the site ready after blocks are installed;
- build the parent site through the CMS root build script against a controlled published export and require all five built-in blocks, the `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part` styling hooks, and media URLs on the configured public origin that return the published media bytes;
- render hostile rich-text text only as escaped text inside allowlisted elements with safe links, and fail the build rather than render a `javascript:` link;
- preserve an operator edit to a block component when blocks are installed again, and, after fixture preparation records older installed bytes for two components (the state an earlier registry build leaves), update the unmodified component while reporting the edited component as a conflict with a non-zero exit and leaving its bytes unchanged;
- scan the static output for the build token.

#### Scenario: Guide-connected site builds
- **WHEN** the existing site is connected with only the guide's files and the packaged block command
- **THEN** its static output contains all five blocks, the styling hooks and working public media URLs

#### Scenario: Unsafe link in published rich text
- **WHEN** the published export contains a rich-text link with a `javascript:` URL
- **THEN** the build fails and no output contains that URL

#### Scenario: Edited block during an update
- **WHEN** an operator has edited one installed component and a newer block revision is available for it and for an unedited component
- **THEN** the unedited component is updated, the edited one is reported as a conflict, and the operator's bytes remain

#### Scenario: Wrong build site selected
- **WHEN** the resolved Compose builder does not mount the parent site read-only as the build source
- **THEN** acceptance fails at the build-site selection stage

### Requirement: Upgrade from the published alpha template is proven

The repository SHALL keep fixtures holding the exact default and `--cloudflare` projects generated by the published `create-lace@0.1.0-alpha.1` package (template `0.4.0`), recording that package's published digests, and a test SHALL verify each fixture's manifest version and managed-file digests. Acceptance SHALL materialize each fixture, add a user README and user edits to `lace.config.ts` and a `site/` source file, generate the current template with the same options, and upgrade with the packed CLI:

- a modified managed file SHALL be reported as a conflict, and apply SHALL fail without changing any project file other than its conflict-review and recovery records under `.lace/`;
- after the operator restores that file, the plan SHALL have no conflict, apply SHALL make every changed or new managed file equal the current template, remove a retired managed file that was unmodified, record the current template version, and leave the README, `lace.config.ts` and all `site/` files byte-for-byte unchanged without adding files under `site/`;
- a following plan SHALL report no changes.

#### Scenario: Alpha project upgrade
- **WHEN** a template `0.4.0` project with user edits is upgraded to the current template
- **THEN** managed infrastructure is current and the user's README, configuration and site source are unchanged

#### Scenario: Modified managed infrastructure
- **WHEN** a managed file of the `0.4.0` project was edited by the operator
- **THEN** the upgrade reports the conflict and apply writes nothing

### Requirement: Onboarding feedback is traceable to acceptance evidence

The repository SHALL keep a feedback acceptance map that lists every item of the onboarding feedback log with its resolution status, the acceptance stages, tests and documents that prove it, or an explicit decision or deferral. A repository test SHALL fail when a feedback item has no entry, when a referenced acceptance stage or file does not exist, when the deferred CMS-adoption item is not marked deferred, or when the map lists an unresolved defect.

#### Scenario: Unmapped feedback item
- **WHEN** a new numbered item is added to the feedback log without a map entry
- **THEN** the traceability test fails naming the item

#### Scenario: Open defect
- **WHEN** the map lists a defect found by the regressions as unresolved
- **THEN** the traceability test fails, so the regression suite is not counted as accepted
