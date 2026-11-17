## MODIFIED Requirements

### Requirement: A fresh local editorial walkthrough is repeatable
The project SHALL document a repeatable local acceptance walkthrough that starts from an isolated migrated Node/SQLite/SILO stack, synchronizes the code-owned models, and uses Admin to edit and publish a page and create and publish a collection entry. It SHALL include a media upload and reuse in content, issuance of the read-only build token through Settings, and a site refresh that displays the published page and collection URL in Astro. It SHALL state prerequisites, commands, expected browser and public-output observations, and how to clean up only acceptance-owned data. Completion SHALL require no fixture edit, direct content API call, or browser-console API call.

#### Scenario: Fresh administrator completes the walkthrough
- **WHEN** a contributor follows the documented steps from an isolated, migrated local stack with the configured Astro routes
- **THEN** the administrator can synchronize models, complete editing, media reuse, publication, and token issuance in Admin, and observe both published routes on the local site

#### Scenario: Acceptance rerun preserves ordinary development data
- **WHEN** the contributor runs the walkthrough or its automated checks again
- **THEN** acceptance-owned state is isolated or uniquely identified, and existing ordinary local content and object data are not reset or removed
