## MODIFIED Requirements

### Requirement: Generated Node project passes an operator and content journey

Acceptance SHALL exercise a generated project's Node setup in the order its generated Compose development guide documents, against the project's own configuration and persistent state. It SHALL extract the shell commands of the development guide's installation and CMS preparation sections and fail when they differ from the reviewed sequence or name a missing package script. It SHALL then:

- prepare `.env` with the generated preparation command and change only the settings the development guide asks the operator to review (images, ports and the public/API origins), keeping every generated credential;
- run the read-only doctor at the `setup` stage and require success with the not-yet-started API and the missing database reported as expected;
- migrate without creating the database directory beforehand and require the migration to create it, then synchronize configuration, issue a bootstrap token and start the API with the documented start command;
- in a real browser against the packaged admin, open the admin while setup is incomplete, create the first administrator on the setup screen with the bootstrap token, sign in, complete the introductory tour with exactly the administrator's permitted steps, confirm that completion persists across a reload and that the tour can be replayed, and upload an image through Media;
- after setup, require a repeated bootstrap to be refused with its operation, cause and next action and without a token;
- describe the uploaded image with alt text and a focal point through the media metadata API, publish an edit containing all five built-in blocks at their current block versions with the uploaded media (the `image` block with its own alt text), issue a read-only build token, build the Astro site and confirm it contains the published content and browser-facing media URLs that return the uploaded bytes, that the hero image carries the media alt text and the `image` block its own alt text, that both carry `width` and `height` equal to the uploaded image's dimensions, and that both carry the focal-point `object-position` style.

It SHALL redact credentials from failure diagnostics after the one intentional bootstrap reveal and SHALL never place the bootstrap token in a URL.

#### Scenario: Published content journey
- **WHEN** a fresh generated Node project is installed and started by following its development guide
- **THEN** the operator commands prepare its environment and database, an administrator created in the browser setup screen can log in, tour the admin and publish an edit, and the Astro build contains the published content and media with effective alt text, dimensions and focal point

#### Scenario: README sequence drifts
- **WHEN** the generated development guide's setup commands differ from the sequence acceptance executes
- **THEN** acceptance fails at the guide stage naming the differing command

#### Scenario: Directory pre-created
- **WHEN** the database directory exists before the first migration
- **THEN** acceptance fails rather than accepting a migration that did not create it

#### Scenario: Operator failure
- **WHEN** an acceptance step fails after bootstrap
- **THEN** diagnostics identify the failed step without repeating the bootstrap token, password, or complete secret environment values
