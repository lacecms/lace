## MODIFIED Requirements

### Requirement: Packed Cloudflare consumer runs its own Worker
The repository SHALL provide a Cloudflare consumer acceptance phase, runnable without Docker or a Cloudflare account, that packs the local Lace graph, generates a project with `--cloudflare`, installs it from the packed artifacts outside the source workspace, and uses only the generated project's scripts, Worker entry and configuration. The Worker SHALL NOT import the source-workspace composition root. The phase SHALL:

- bundle the Worker and reject a bundle that references the source workspace or lacks the project's models;
- prepare local Worker variables and point the project's operator API and public origins at the local Worker;
- run the packaged `lace doctor --target cloudflare-local` before migration and require `setup` to exit 0 with the unreachable API reported as expected and migration inspection skipped, and `ready` to fail, without creating the local state directory;
- migrate, synchronize and bootstrap through the `cloudflare-local` target;
- expire the issued setup token in the stopped local state as explicit fixture preparation, start the Worker with persistent local state, and require the browser setup screen to reject that token without creating an administrator while setup stays incomplete; then issue a fresh token with the stopped Worker and continue;
- verify readiness, the packaged admin document and an admin asset;
- in a real browser against the packaged admin: create the first administrator through the setup screen, sign in, upload media, create and edit a collection entry that references the media, save it and publish it;
- configure a controlled HTTPS deploy hook in the local Worker variables, initially unavailable, and require that scheduled dispatch leaves the build pending with the sanitized `trigger_unavailable` reason while publication stays committed; after the hook recovers, scheduled dispatch SHALL deliver exactly one bodiless `POST` without cookie or authorization and the build SHALL be recorded as running with the provider deployment ID, never as succeeded;
- run `lace doctor --target cloudflare-local --stage ready` against the running Worker and require API readiness and API-derived migration evidence to pass;
- issue a read-only build token, build the generated Astro site against the Worker's authenticated published export, and require the published entry, its blocks and Worker-origin media URLs that return the uploaded bytes;
- save a later draft and require that the published export is unchanged and a rebuilt site does not contain the draft;
- stop and restart the Worker and verify sign-in, closed setup, models, the uploaded media bytes, the published export and the saved draft;
- scan the generated project files except the ignored local secret files, the Worker bundle, the static output, the Worker output and every captured diagnostic for the auth secret, setup tokens, password, session, build token and deploy-hook URL.

It SHALL redact those values from diagnostics, stop every Worker, browser and hook process and remove its temporary project unless retention is requested.

#### Scenario: Cloudflare consumer journey
- **WHEN** the Cloudflare consumer acceptance phase runs on a clean checkout
- **THEN** the packed generated project bundles and starts its own Worker, completes browser setup, editing and publication, dispatches the build to the controlled hook, builds its Astro site from the Worker's published export, and its D1 and R2 state survives a restart

#### Scenario: Worker bundle uses source-workspace code
- **WHEN** the generated Worker bundle references a path inside the Lace source workspace
- **THEN** acceptance fails at the bundle stage with that reason

#### Scenario: Worker fails to become ready
- **WHEN** the local Worker exits or does not report readiness within the bounded wait
- **THEN** acceptance fails with the stage and sanitized Worker output and stops the Worker process

#### Scenario: Expired setup token
- **WHEN** the browser setup screen is submitted with an expired operator-issued token
- **THEN** setup remains incomplete, no administrator exists, and a token re-issued with the local bootstrap command completes setup

#### Scenario: Hook accepted but not confirmed
- **WHEN** the recovered hook answers with a provider deployment ID
- **THEN** the build is running with that ID and acceptance fails if it is reported as succeeded

#### Scenario: Draft leaks into a build
- **WHEN** a draft saved after publication changes the published export or appears in the rebuilt site
- **THEN** acceptance fails at the draft-isolation stage

#### Scenario: Secret in an output
- **WHEN** any scanned file, bundle, output or diagnostic contains one of the journey's secret values
- **THEN** acceptance fails naming the surface without printing the value
