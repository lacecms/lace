# publication-visibility Specification

## Purpose
Defines when published CMS content becomes visible in each supported site mode, and the reproducible consumer evidence and operator guidance that keep those claims truthful.

## Requirements

### Requirement: Visibility claims are backed by reproducible consumer observation
The repository SHALL provide a consumer acceptance phase that uses packed packages and compatible API/builder images outside the engine checkout to publish changed content, save a draft-only change and publish a new route, and SHALL observe the result in generated Astro dev, an independent existing-site Astro dev integration that reads the SDK in its own page code, a manual static build and the automatic Compose release. Each observation SHALL be recorded with its mode, step and expected value, and the phase SHALL fail when an expected visibility outcome differs. Rendered output and diagnostics SHALL be checked for build credentials. Guidance SHALL NOT claim visibility behavior that this phase or an equivalent recorded verification has not observed.

#### Scenario: Observed behavior matches guidance
- **WHEN** the visibility phase runs against compatible artifacts
- **THEN** every expected dev, manual static and Compose outcome matches, the observations are printed, and no build credential appears in rendered HTML

#### Scenario: A mode regresses
- **WHEN** a generated dev page stays stale after publication, a draft becomes visible or served HTML stops revalidating
- **THEN** the phase fails with the mode, step and observed value

### Requirement: Generated Astro dev shows publications on reload
The generated site in Astro development SHALL revalidate the authenticated published export on each page render using the export entity tag, reusing the previously validated export only when the API reports it unchanged. Published changes to Home and to existing post routes SHALL appear on the next browser reload without restarting Astro. A changed route set, such as a newly published or renamed post slug, SHALL require restarting Astro dev; a post route whose slug is no longer published SHALL return not found rather than stale content. Revalidation failures SHALL produce the existing actionable diagnostics instead of silently serving an older export. Draft saves SHALL NOT change dev output.

#### Scenario: Existing routes after publication
- **WHEN** an administrator publishes changed Home and post content while generated Astro dev is running
- **THEN** reloading `/` and the existing post URL shows the new published titles without a restart

#### Scenario: New route in dev
- **WHEN** a new post is published while generated Astro dev is running
- **THEN** its URL returns not found until Astro dev is restarted, after which it renders the published post

#### Scenario: Draft save in dev
- **WHEN** a draft is saved without publication
- **THEN** reloading the dev site continues to show only the published content

### Requirement: Static builds remain single-export snapshots
A generated static build SHALL read exactly one validated published export, checked against the expected published version when supplied, and SHALL derive every route from it. Publication SHALL NOT change an existing static output; a fresh build SHALL include the publication and exclude draft-only changes. Manual static output SHALL be described as deployed only by the operator's own deployment step.

#### Scenario: Manual build after publication
- **WHEN** content is published after an earlier `pnpm build`
- **THEN** the existing `site/dist` output is unchanged until a fresh build, which contains the publication and no draft-only change

### Requirement: Automatic Compose releases become visible only through a recorded build
In the generated Compose deployment, publication SHALL request a build through the existing durable queue, and the web proxy SHALL serve new content only after the builder switches a complete release for a build covering that publication. Failed builds SHALL keep the previous release served. Draft saves SHALL NOT request builds. Served site responses SHALL carry `Cache-Control: no-cache` so browsers revalidate after a release switch instead of reusing heuristically fresh HTML. Guidance SHALL explain that a VPS build is `pending` while queued, `running` while the synchronous builder runs, and may be served moments before `succeeded` is recorded.

#### Scenario: Automatic release after publication
- **WHEN** an administrator publishes a change with Compose production services running
- **THEN** a covering build reaches succeeded, the proxy serves the new content, and responses include `Cache-Control: no-cache` with a validator

#### Scenario: Draft save with Compose
- **WHEN** a draft is saved without publication
- **THEN** no build is requested and the served release is unchanged

### Requirement: Admin explains visibility by mode without claiming deployment
The Builds screen SHALL explain, for every authenticated role, that saved drafts stay private, that publication makes a snapshot available to published-content consumers, that Astro dev shows changes to existing pages on reload and needs a restart for new or renamed URLs, that a manual static build needs a fresh build and the operator's deployment, and that automatic builds serve content after a succeeded build while failures keep the previous release. It SHALL NOT state that any particular mode is in use or that publication, provider acceptance, or any build status other than `succeeded` proves deployment. The entry publication details SHALL describe the covering build's status with the same meaning as the shared status map, including `accepted`, `cancelled`, and `unknown`, and SHALL stop following the build once it reaches any terminal status.

#### Scenario: Viewer opens Builds
- **WHEN** a viewer opens Builds with or without build history
- **THEN** the mode guidance is visible without offering build actions and without claiming the site was deployed

#### Scenario: Publication covered by an accepted build
- **WHEN** the build covering a publication in the editor becomes `accepted`
- **THEN** the publication details say the provider accepted the build without confirming the site changed, stop polling, and offer the status explanation
