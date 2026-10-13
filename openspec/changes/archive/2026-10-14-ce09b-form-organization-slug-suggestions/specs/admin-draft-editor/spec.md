## ADDED Requirements

### Requirement: Visual layouts preserve recursive form state and error access
The admin SHALL render declared sections with accessible headings and tabs with labelled tablists/panels in metadata order. The first tab SHALL initially be selected; Left/Right, Home and End SHALL select and focus tabs with the standard tabs keyboard behavior. Narrow viewports SHALL retain access to all tab controls and fields without page-level horizontal overflow. Unlisted fields SHALL follow the layout in declaration order. Each form owner and list item SHALL own independent navigation state. Model layouts SHALL affect only model fields, block data layouts only the Content panel, and settings layouts only declared settings inside the existing Settings panel; SEO and system/envelope controls SHALL retain their established behavior.

Hidden panels SHALL remain mounted, non-focusable and absent from the accessibility tree. Navigation SHALL preserve rich-text documents and editing identity, media selections, list item identity, local/transient values and validation errors. Navigating an absent group SHALL NOT create data or mark a draft dirty. Viewers SHALL be able to navigate layouts/disclosures but SHALL have no mutation affordances. Lifecycle requests SHALL retain existing editing locks.

Tabs and sections containing descendant problems SHALL display accessible problem indicators under the existing publication/hidden-block rules. Validation-summary activation SHALL select every containing tab, open ancestor block/group/list disclosures and focus the exact leaf/container in the rendered visual order. Save/discard/revert, conflict retention and list/block moves SHALL preserve values and map errors to the current correct item; presentation state SHALL never be submitted or included in dirty comparison/conflict JSON.

#### Scenario: Navigate and save a nested rich-text form
- **WHEN** a writer edits rich text and media in a list-item tab, switches tabs, moves the item and saves
- **THEN** current values and editing identity remain intact and the saved JSON uses the original paths

#### Scenario: Reveal a nested hidden error
- **WHEN** a summary entry targets a field inside an inactive tab of a collapsed item in an inactive block panel
- **THEN** all containing panels/disclosures open and the exact control receives focus with its error visible

#### Scenario: Navigate an unset group as a viewer
- **WHEN** a viewer navigates configured layouts around an absent group using keyboard controls
- **THEN** navigation works, values remain absent, no dirty change occurs and no mutation affordance appears

#### Scenario: Recover after save failure or revision conflict
- **WHEN** a layout-organized draft save fails or conflicts after editing nested fields
- **THEN** local values remain available in every panel and existing discard/reload/conflict recovery works without serializing navigation state

#### Scenario: Narrow-screen keyboard navigation
- **WHEN** an author visits every tab using arrows, Home and End at a narrow viewport
- **THEN** each selected tab is visible, its panel is keyboard accessible and no control is unreachable through overflow

### Requirement: Collection creation starts with an automatic editable slug
The collection Create entry dialog SHALL expose Slug and an initially enabled Suggest from title control. While enabled, title changes SHALL update the slug. Any manual slug change, including clearing it, SHALL disable automatic updates until explicitly re-enabled. Closing/cancelling or successfully completing creation SHALL reset dialog values and suggestion mode. Creation SHALL submit the displayed nonempty slug in the existing create request and omit an empty slug. The suggestion SHALL apply NFKD normalization, remove characters other than ASCII letters/digits, whitespace, underscore and hyphen, lowercase, trim, collapse whitespace/underscore/hyphen runs to one hyphen, trim boundary hyphens, truncate to the existing maximum slug length, and remove a resulting trailing hyphen. It SHALL NOT transliterate scripts, fabricate a fallback slug or promise uniqueness. Empty or wholly non-Latin titles SHALL yield an empty suggestion with guidance to enter a slug manually; an empty slug SHALL NOT prevent a valid draft creation.

On success the created entry SHALL open with its persisted slug and no unsaved changes. Subsequent title edits SHALL NOT change that persisted slug automatically. Ordinary loads, refreshes, duplicated entries and entries without slugs SHALL NOT imply new-creation suggestion mode. The existing entry-editor opt-in suggestion behavior SHALL remain available and use the same normalizer. Creation errors SHALL retain title/slug and manual/automatic mode. Route validation and conflicts SHALL remain server-authoritative and use normal accessible error feedback without auto-appending suffixes. Pages/globals and viewers SHALL acquire no creation/slug affordances.

#### Scenario: Follow a new title then stop on manual input
- **WHEN** a writer enters `Café & News` in the creation dialog then manually changes `cafe-news` to `updates` and edits the title again
- **THEN** `updates` stays unchanged until suggestions are explicitly re-enabled

#### Scenario: Non-Latin or empty title
- **WHEN** the title is empty or `Новости`
- **THEN** the suggested slug is empty, manual-entry guidance is visible, and the existing nonempty-title requirement alone determines whether draft creation can proceed

#### Scenario: Truncation leaves a valid boundary
- **WHEN** a long normalized suggestion has a hyphen at the truncation boundary
- **THEN** its trailing hyphen is removed and its nonempty result obeys the existing slug grammar and length limit

#### Scenario: Preserve the created and existing slug
- **WHEN** creation succeeds with `cafe-news` and the author edits the title in the editor or reloads the entry
- **THEN** the slug stays `cafe-news` and no automatic update runs unless the author explicitly opts in

#### Scenario: Preserve a slugless duplicate
- **WHEN** an author opens a duplicated collection entry with no slug and edits its title
- **THEN** its slug stays absent unless suggestions are explicitly enabled

#### Scenario: Creation failure retains author input
- **WHEN** the server rejects creation or a route conflict is reported by the existing lifecycle boundary
- **THEN** normal error feedback is accessible, local values and suggestion mode remain intact, and no alternate slug is generated
