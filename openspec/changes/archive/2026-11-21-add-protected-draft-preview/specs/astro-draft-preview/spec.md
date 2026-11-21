## Purpose

Defines portable single-route preview builds using the site's own Astro
components, pinned inputs and private assets on Cloudflare and VPS deployments.

## ADDED Requirements

### Requirement: Preview renders one selected route with the site's components
An opt-in preview build SHALL use the selected site's route files, layouts,
block map and installed components to render exactly one target HTML page.
It SHALL preserve required CSS, scripts, dynamic imports, fonts, optimized
images and required originals. Missing or ambiguous target routes, unsupported
preview integration and render failures SHALL fail explicitly. It SHALL NOT
silently build or expose a complete site as fallback. Route enumeration,
compilation and shared asset generation MAY process other site code, and the
product SHALL NOT promise that all build work is limited to one page.

#### Scenario: Routed unpublished entry
- **WHEN** the frozen target has a valid unpublished slug supported by the site's dynamic route
- **THEN** the preview renders that route with the saved content and only one HTML page is made available

#### Scenario: Missing route implementation
- **WHEN** the CMS resolves a target path but the site produces no matching route
- **THEN** generation fails with an actionable route reason instead of displaying another page or building the whole site

#### Scenario: Unrelated route enumeration fails
- **WHEN** the selected build encounters an error while enumerating another route
- **THEN** the preview may fail with the normal build diagnostic; it does not claim isolation from all unrelated build code

### Requirement: Preview loading is explicit and leaves public consumers unchanged
Preview loading SHALL use a separately authenticated frozen-input contract,
never a draft mode added to the ordinary public export or build token. It SHALL
reuse compatible site-view lookups for routed entries, globals, records, media
and links and expose an explicit preview flag to site code. Only the target
SHALL be overlaid. Hidden blocks and values excluded by publication projection
SHALL not be delivered to renderers. Draft-only media required by the target
SHALL be available through private input access. Ordinary builds and Astro dev
SHALL retain their existing published-only behavior.

#### Scenario: Preview flag and external side effects
- **WHEN** a site wants to disable analytics or form submission during preview
- **THEN** it can branch on the explicit preview flag; Lace does not automatically rewrite arbitrary scripts or promise external side-effect isolation

#### Scenario: Public export during preview
- **WHEN** preview of a saved draft is generated while a public build reads the site
- **THEN** the public build sees only published content and its public-state version is unchanged by preview

### Requirement: Source selection is pinned and cannot be supplied by editors
Each generation SHALL use the operator-selected site source used for publication
and record an immutable source commit before executing site code. It SHALL
NOT default to the last deployed commit. Site root, lockfile, commands,
credentials and execution settings SHALL come from deployment configuration,
not the editor request. A source changing during preparation SHALL not produce
a mixed checkout. Unsupported or unpinnable source SHALL fail explicitly.

#### Scenario: Code changed since the public deployment
- **WHEN** the configured source ref now resolves to a newer commit
- **THEN** the preview uses that pinned commit and records it without deploying it

#### Scenario: Editor attempts command override
- **WHEN** a creation or runner request includes a command, path, arbitrary ref or environment override
- **THEN** the closed request contract rejects it before execution

### Requirement: Generation prefixes preserve resources and public navigation
Private artifacts SHALL load below the generation prefix on the preview host.
The integration SHALL distinguish resource URLs from navigational links,
preserve same-document fragments, and resolve other site-page links against
the configured public site URL including any public base path. Page navigation
SHALL open a new tab without opener/referrer access so an embedded preview is
not replaced by public-site navigation. Existing external link semantics such
as nofollow SHALL be retained. The integration SHALL NOT use a blanket HTML
base URL that redirects private resources to the public site. Custom runtime
URL construction SHALL be documented as a site integration responsibility.

#### Scenario: Prefixed asset graph
- **WHEN** the page loads CSS with a font/background URL and a script with a dynamic import
- **THEN** all required private resources load within the authorized generation and work at desktop and narrow widths

#### Scenario: Root-relative public link and local anchor
- **WHEN** preview contains `/about` and `#details`, and the public site has a configured base path
- **THEN** the first opens the correctly based public URL in a new tab and the second navigates within the current preview

#### Scenario: Lightbox original
- **WHEN** the site's image component opens a full-size original
- **THEN** that original is packaged and protected while the public media origin and public output remain unchanged

### Requirement: Cloudflare preview builds use separate GitHub execution
The Cloudflare deployment SHALL dispatch preview through a dedicated configured
GitHub Actions workflow and store output privately in R2 for gateway delivery.
Preview creation SHALL NOT invoke Pages deploy hooks, create Pages preview
or production deployments, or consume the Pages build mechanism. Provider
credentials SHALL remain server-side. A provider run SHALL be correlated with
its exact generation, claim and pinned source, never selected as the latest
run on a branch. Runner waiting, failure, cancellation and quota/configuration
errors SHALL be reflected truthfully. The product SHALL document that GitHub
and storage/request limits still apply without promising unlimited free usage.

#### Scenario: Preview on a Pages-backed public site
- **WHEN** an editor creates preview
- **THEN** the dedicated workflow runs and no Pages deployment request is made

#### Scenario: Duplicate dispatch or unrelated workflow run
- **WHEN** dispatch is delivered twice or another run exists on the same branch
- **THEN** only the generation's single authorized claim can build/finalize, and unrelated completion cannot mark it ready

### Requirement: VPS preview uses the fixed builder without public release switching
The Node deployment SHALL use a private fixed-command preview operation that
stages output separately from public releases. Existing publication `/build`
requests SHALL retain their closed contract. At most one build process SHALL
execute on the shared VPS builder. Pending publication work SHALL get the
next available slot before new preview work; a running preview SHALL not be
preempted, but SHALL obey the preview execution deadline. A busy builder SHALL
not accumulate a preview queue. Restart/recovery SHALL not start a duplicate
live process or lose the public release pointer.

#### Scenario: Publication arrives during preview
- **WHEN** preview is running and publication becomes pending
- **THEN** preview finishes or times out, publication receives the next slot, and later preview requests cannot jump ahead

#### Scenario: Builder already runs a publication
- **WHEN** an editor requests preview while the shared executor is busy with publication
- **THEN** preview is refused as busy without queuing it or replacing the entity's previous ready preview

#### Scenario: Preview build fails or the builder restarts
- **WHEN** the preview executor fails or restarts
- **THEN** the public current/previous release remains untouched, and recovery terminates or identifies the old preview execution before allowing another

### Requirement: Preview setup is explicit and validated without enabling partial deployments
Generated project guidance and tooling SHALL describe the preview hostname,
site integration, source pinning, private storage, executor and credential
configuration for each runtime. Readiness SHALL be derived from validated
operator settings and integration compatibility, and SHALL report safe missing
requirements. It SHALL NOT equate static configuration checks with a proven
remote build. Existing sites SHALL receive explicit adoption instructions;
no-site installations SHALL remain ineligible. Incomplete setup SHALL keep
creation unavailable while normal editing and publication continue to work.

#### Scenario: Existing deployment upgrades without preview settings
- **WHEN** the additive preview migration and packages are installed
- **THEN** existing content, publication and sign-in still work and preview creation stays hidden

#### Scenario: Configuration is complete but provider access fails
- **WHEN** a configured workflow rejects dispatch because its credential or quota is invalid
- **THEN** the operation fails with a safe provider reason and ordinary publication is unaffected
