## MODIFIED Requirements

### Requirement: Generated Node project passes an operator and content journey

Acceptance SHALL exercise a generated project's Node setup in the order its generated Compose development guide documents, against the project's own configuration and persistent state. It SHALL extract the shell commands of the development guide's installation and CMS preparation sections and fail when they differ from the reviewed sequence or name a missing package script. It SHALL then:

- prepare `.env` with the generated preparation command and change only the settings the development guide asks the operator to review (images, ports and the public/API origins), keeping every generated credential;
- run the read-only doctor at the `setup` stage and require success with the not-yet-started API and the missing database reported as expected;
- migrate without creating the database directory beforehand and require the migration to create it, then synchronize configuration, issue a bootstrap token and start the API with the documented start command;
- in a real browser against the packaged admin, open the admin while setup is incomplete, create the first administrator on the setup screen with the bootstrap token, sign in, complete the introductory tour with exactly the administrator's permitted steps, confirm that completion persists across a reload and that the tour can be replayed, and upload an image through Media;
- after setup, require a repeated bootstrap to be refused with its operation, cause and next action and without a token;
- publish an edit containing all five built-in blocks with the uploaded media, issue a read-only build token, build the Astro site and confirm it contains the published content and browser-facing media URLs that return the uploaded bytes.

It SHALL redact credentials from failure diagnostics after the one intentional bootstrap reveal and SHALL never place the bootstrap token in a URL.

#### Scenario: Published content journey
- **WHEN** a fresh generated Node project is installed and started by following its development guide
- **THEN** the operator commands prepare its environment and database, an administrator created in the browser setup screen can log in, tour the admin and publish an edit, and the Astro build contains the published content and media

#### Scenario: README sequence drifts
- **WHEN** the generated development guide's setup commands differ from the sequence acceptance executes
- **THEN** acceptance fails at the guide stage naming the differing command

#### Scenario: Directory pre-created
- **WHEN** the database directory exists before the first migration
- **THEN** acceptance fails rather than accepting a migration that did not create it

#### Scenario: Operator failure
- **WHEN** an acceptance step fails after bootstrap
- **THEN** diagnostics identify the failed step without repeating the bootstrap token, password, or complete secret environment values

### Requirement: Full acceptance is the onboarding feedback regression suite

The repository's full generated-project acceptance run SHALL, from one packed Lace package graph, run in sequence the byte-stable snapshot check, the development-guide-driven generated Node consumer, its Compose production release, the static-site preview of a generated `--cloudflare` project, the dev/manual/automatic publication visibility journey, the existing-Astro consumer, the packed Cloudflare consumer journey and the upgrade from alpha template `0.4.0`. It SHALL stop at the first failing stage with that stage's name and a non-zero exit, SHALL refuse to run while the publication-visibility observe-only mode is requested, and SHALL remove every temporary project, container, volume and process unless retention is requested.

#### Scenario: Complete regression run
- **WHEN** the full acceptance runs on a clean checkout with Docker, Chromium and the supported Node and pnpm versions
- **THEN** every consumer journey passes and the run reports success only after the last stage

#### Scenario: Observe-only visibility requested
- **WHEN** the full acceptance is started with publication-visibility observation enabled
- **THEN** it fails before generating a project, because observed mismatches would not fail the run

#### Scenario: Visibility mismatch
- **WHEN** published, draft-only or newly routed content is visible differently from the documented dev, manual-static or automatic-Compose behavior
- **THEN** the run fails at the visibility stage and lists each mismatch

## ADDED Requirements

### Requirement: Scenario links and current-template upgrade remain verifiable
Focused generated-contract verification SHALL check scenario file presence, local links/anchors, command scripts and ordered lifecycle sequences for every site mode with and without Cloudflare. Current packed-consumer acceptance SHALL use the development guide's reviewed command sequence. Reviewed template `0.14.0` fixtures SHALL retain their original managed bytes/hashes and origin evidence rather than be reconstructed from changed templates; upgrade verification SHALL cover default and Cloudflare consumers, edited user README/configuration/site source, managed documentation conflicts, new-guide path collisions, successful managed-guide delivery and a no-op repeat plan. Existing-site mode SHALL prove its outer README remains unchanged. These checks SHALL NOT require a real Cloudflare account or claim complete 33H field-trial verification.

#### Scenario: Guide command or local link drifts
- **WHEN** a scenario guide refers to an absent file, anchor or package script, or its setup sequence differs from the reviewed consumer sequence
- **THEN** the focused contract check or acceptance fails and identifies the guide and discrepancy

#### Scenario: 0.14.0 migration evidence
- **WHEN** the current packed CLI upgrades a reviewed exact 0.14.0 fixture
- **THEN** guide delivery, conflict refusal, protected user bytes and a repeat no-op plan are verified against its recorded original manifest
