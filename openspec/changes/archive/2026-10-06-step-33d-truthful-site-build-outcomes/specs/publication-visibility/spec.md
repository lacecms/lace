## MODIFIED Requirements

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
