## MODIFIED Requirements

### Requirement: Publication guidance distinguishes content state from served-site updates
Guidance SHALL explain that saving changes a draft, publication makes a snapshot
available to published-content consumers, and the served site's update depends
on its rendering/build setup. It SHALL explain recorded build statuses without
claiming publication guarantees immediate site refresh or successful deployment,
and its status wording SHALL match the shared build status map: only
`succeeded` proves publication, `accepted` means a provider accepted the request
without tracked outcome, and `cancelled`, `unknown`, and `failed` can be
retried by an administrator. It SHALL use Step 29's verified mode guidance:
Astro dev shows published changes to existing pages on reload and needs a
restart for new or renamed URLs, a manual static site needs a fresh build and
deployment, and automatic builds serve content after a succeeded build. It
SHALL NOT prescribe restarting Astro development after every publication and
SHALL NOT offer build-source selection.

#### Scenario: Publication is explained before mode verification
- **WHEN** an admin reaches publication or Builds guidance and Admin cannot know which site mode the operator uses
- **THEN** guidance distinguishes publishing from site updating, summarizes the verified dev, manual static and automatic build behavior, and suggests inspecting build status without promising immediate deployment

#### Scenario: Tour describes acceptance truthfully
- **WHEN** any role reaches the Builds tour step
- **THEN** it names the seven statuses consistently with the status popovers and states that acceptance by a provider does not prove the site was published
