## MODIFIED Requirements

### Requirement: Public and internal documentation retain explicit ownership

Repository `docs/**` materials SHALL remain maintained internal engineering documents listed in the internal documentation index with a status; the public site SHALL NOT publish the directory wholesale. Public guidance SHALL live in the documentation application, internal architecture/specs SHALL retain their existing authority, and generated-project guides SHALL remain version-matched consumer assets of the project template that are not published as site pages.

Each user-facing topic SHALL be described in exactly one place. A `docs/*.md` note other than the two indexes SHALL either be promoted or remain internal:

- A promoted note's user guidance SHALL move into public pages. When no engineering content remains, the note SHALL be deleted; the index SHALL record the deleted file and the public page that replaced it.
- A note that remains SHALL carry only engineering content (implementation invariants, verification, release or real-account procedures, contributor workflows). Its index row SHALL have status `internal note` and SHALL name the public page that owns its user-facing topic, if any. It SHALL link to that page instead of restating its procedures, settings or examples.

An internal document MAY be consolidated into another or deleted only when the index and every document that linked to it are updated in the same change, so that no link or ownership row names a missing file. The topic map SHALL name, for each public section, the internal documents and specifications that a behavior change obliges a reviewer to check. Internal-only edits SHALL NOT change public output unless an explicitly declared public build input is also changed.

#### Scenario: Public guide derives from internal material
- **WHEN** user guidance from an internal note is adapted for the public site
- **THEN** the public page holds the guidance, the note keeps only engineering content or is deleted, the index records the outcome and the public owner, and the topic map names the remaining internal sources

#### Scenario: Internal report changes
- **WHEN** only an internal verification report or architecture document is edited
- **THEN** its content does not automatically become a public page or resource

#### Scenario: Internal document is consolidated
- **WHEN** an internal document is merged into another and deleted
- **THEN** the index records the replacement, the ownership map and every linking document point at the replacement, and the link guard passes

#### Scenario: Reader looks for a procedure in an internal note
- **WHEN** a reader opens a remaining internal note whose topic has a public page
- **THEN** the note links to that page and does not repeat its steps, settings or examples

### Requirement: Upgrade guidance covers only the oldest supported release onward
English/latest, the delivered consumer guidance and the permanent compatibility guide SHALL describe upgrades from rc2 (`0.1.0-rc2`) and later releases only. The English/latest operations guidance and the delivered consumer guidance SHALL explain that an rc2 database already starts from the baseline migration and is upgraded by explicit forward migrations, without recreation, together with backup, coordinated package, image and source adoption, configuration synchronization and a site rebuild for Node and Cloudflare, and backup-based rollback without promising a package-only downgrade. The permanent compatibility guide SHALL state the supported upgrade origin, that an rc2 database is upgraded in place by forward migrations, and the rollback boundary, and SHALL link to the English/latest upgrade procedure instead of repeating its steps. All of them SHALL state that installations older than rc2 are not supported and that their pre-baseline databases are refused. Sections that describe upgrades from rc1 or between older releases, or the adoption of features already present in rc2, SHALL NOT remain. Documentation SHALL preserve English/latest routes and SHALL NOT claim publication or real-deployment readiness from preparation alone. The reviewed changelog SHALL provide concise release notes linked to the permanent upgrade guide.

#### Scenario: Operator on the oldest supported release upgrades
- **WHEN** an operator on rc2, the oldest supported release, follows the upgrade guidance
- **THEN** they can identify the backup, coordinated package and image update, forward database migration without recreation, configuration synchronization, site rebuild and rollback boundary

#### Scenario: Reader looks for unsupported upgrade steps
- **WHEN** a reader searches the public operations, deployment, reference and Astro integration pages or the compatibility guide
- **THEN** no rc1 database recreation, alpha-by-alpha upgrade or pre-rc2 feature-adoption section remains, and the guidance names rc2 as the oldest supported release

#### Scenario: Reader opens the compatibility guide to upgrade
- **WHEN** a reader follows the changelog link to the permanent compatibility guide
- **THEN** it states the supported origin, in-place forward migration, refusal of older databases and the rollback boundary, and links to the English/latest upgrade steps rather than repeating them

## ADDED Requirements

### Requirement: Reference pages list every public interface item

The Reference section SHALL let a reader reach, by name, every item of the shipped public interface of the documented target:

- every `lace` command and every long flag shown by `lace --help`, and every `create-lace` mode and flag shown by `create-lace --help`, with the command's purpose, targets, exit codes and a pointer to the guide that uses it;
- every `LACE_*` setting declared by the generated project's configuration files (`.env.example`, `worker/.dev.vars.example`, `worker/wrangler.jsonc`, `docker-compose.yml`, `docs/cloudflare-operator.env.example`) and every `LACE_*` name the CLI help names, with the runtime that reads it, whether it is secret, and its default or required state;
- every option accepted by `defineConfig`, `definePage`, `defineCollection`, `defineGlobal` and `defineBlock` (including collection list options and SEO inputs), and every field builder of `field`;
- every path of the committed OpenAPI document with its methods, audience (public, setup, account or admin) and purpose;
- every MCP tool with its required scope, and every MCP scope.

A root test SHALL derive each list from the shipped source of truth (built CLI help, generated project templates, declared configuration input types and the field builder object, the committed OpenAPI document and the contracts' MCP tool argument schemas) and SHALL fail, naming each missing item and its kind, when a Reference page does not mention it. The test SHALL NOT keep its own copy of these lists.

#### Scenario: A new CLI flag is added without documentation
- **WHEN** a change adds a flag to `lace import` and leaves the Reference pages unchanged
- **THEN** the reference test fails and names the flag as a missing CLI item

#### Scenario: A new REST path is added without documentation
- **WHEN** the committed OpenAPI document gains a path that no Reference page mentions
- **THEN** the reference test fails and names the path

#### Scenario: A generated setting is added without documentation
- **WHEN** the generated `.env.example` declares a new `LACE_*` setting that no Reference page mentions
- **THEN** the reference test fails and names the setting

#### Scenario: Reader looks up a configuration option
- **WHEN** a reader searches the Reference section for `removedFields`
- **THEN** a Reference page explains what the option does, which definitions accept it and that it is a temporary synchronization hint

### Requirement: Pages follow a declared template

Every English/latest page SHALL declare a kind: `overview`, `guide` or `reference`. Every page SHALL state its purpose in its description. A `guide` page SHALL open its body with a short purpose paragraph, SHALL have *Before you start* as its first second-level section listing prerequisites (or stating that none apply), SHALL have at least one task section after it, and SHALL end with a *Reference* section that links to at least one Reference page. A `reference` page SHALL live in the Reference section. An `overview` page SHALL introduce and link its section's pages without task sections. The documentation check SHALL fail and name the page and the missing or misplaced part when a page violates its kind.

#### Scenario: Guide without prerequisites
- **WHEN** a guide page's first second-level section is not *Before you start*
- **THEN** the documentation check fails and names the page and the missing section

#### Scenario: Guide without a reference link
- **WHEN** a guide page's last section is *Reference* but links to no Reference page
- **THEN** the documentation check fails and names the page

#### Scenario: Unknown kind
- **WHEN** a page declares no kind or a kind other than `overview`, `guide` or `reference`
- **THEN** the documentation check fails and names the page

### Requirement: Pages state the release they were verified against

Every English/latest page SHALL declare the Lace release it was last verified against, and its footer SHALL display "Verified against" followed by that version. The documentation check SHALL accept only the current release `version` of the repository release metadata or one of its published versions that is not an alpha release, and SHALL fail naming the page otherwise. A page whose content is changed or re-checked against the implementation SHALL record the current release `version`. The footer SHALL NOT claim that artifacts are published or that a deployment was verified.

#### Scenario: Page audited in the current cycle
- **WHEN** a page is checked against the implementation while the release metadata `version` is `0.1.0-rc2`
- **THEN** it declares `0.1.0-rc2` and its footer reads "Verified against 0.1.0-rc2"

#### Scenario: Unknown or alpha version
- **WHEN** a page declares a version that is neither the current release version nor a non-alpha published version, or declares an alpha version
- **THEN** the documentation check fails and names the page and the value

#### Scenario: Release selected after verification
- **WHEN** a later release becomes the current `version` and the page is not re-checked
- **THEN** the page still builds and its footer keeps the earlier published version it was verified against

### Requirement: Public guidance covers delivered product features

English/latest SHALL contain a page or a section, reachable from its section's navigation, for each of: content import; media tags in the media library; conditional fields; MCP setup with separately consented publication; configured collection queries for developers (configuration), editors (admin list search, filters and sort) and API consumers; the default collection sort; route-less collections; internal URL links; video embeds and gallery video items; gallery item placement and image size; and the editor's block controls (collapse and expand all, hidden blocks, block settings). Each SHALL match the accepted behavior of its owning capability and SHALL link to the Reference page that lists its settings, options, commands or endpoints.

#### Scenario: Developer adds a route-less collection
- **WHEN** a reader follows the content-modeling guidance for a collection without `route`
- **THEN** they learn that its entries have no slug, path or SEO group, how site code reads them, and which Reference entries describe `route`

#### Scenario: Editor tags media
- **WHEN** an editor follows the media guidance
- **THEN** they can add, remove and filter by tags in the media library without consulting an internal note

#### Scenario: Developer places gallery items
- **WHEN** a reader follows the gallery guidance
- **THEN** they learn the `placement` values, that they act in grid mode only, and the image `size` choices
