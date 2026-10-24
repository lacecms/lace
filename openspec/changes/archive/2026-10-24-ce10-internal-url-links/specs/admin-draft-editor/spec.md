## ADDED Requirements

### Requirement: Ordinary URL controls offer manual and CMS destinations
Every ordinary URL control SHALL offer Manual URL and CMS entry modes, a
paginated searchable page/collection picker, and selected-target title, model,
published path and availability. Selection SHALL store only the canonical token;
manual values SHALL remain unchanged. Switching modes SHALL not silently
convert a path to a reference or discard a value before an explicit edit/clear.
Missing/unpublished targets SHALL retain their IDs and show warnings, with
replace/clear actions. The editor SHALL resolve selected targets through one
deduplicated batch per current value set (bounded chunks), not one request per
control/render/keystroke. Search SHALL debounce and cancel obsolete requests.
Controls SHALL preserve existing nested form identity, error reveal, defaults,
viewer restrictions and keyboard/screen-reader operation. Provider-restricted
URL controls and rich-text link controls SHALL retain their current UI/grammar.
The picker SHALL apply to ordinary URL fields in model/global fields and block
data, including nested groups/lists. Block settings SHALL retain their existing
allowlist and controls; token-like text settings SHALL NOT acquire a URL picker.

#### Scenario: Image link and nested content fields
- **WHEN** an editor selects a CMS page in an image's Link field or a nested model/global/block URL field
- **THEN** both use the same picker/token/status behavior at their existing field paths

#### Scenario: Missing selected target
- **WHEN** a previously selected ID is no longer found
- **THEN** the control says the destination is missing, retains its ID for repair, and permits draft save

### Requirement: Destructive dialogs show link impact and require acknowledgment
Delete/unpublish dialogs in entry screens and collection rows SHALL load the
paginated impact view, expose all entities/locations through continuation,
distinguish published-visible links from drafts/hidden links, and explain the
post-build non-navigating fallback. Published-visible impact SHALL add an
unchecked explicit acknowledgment before the destructive submit is enabled.
Loading/failure SHALL NOT be presented as zero usages. Stale receipts SHALL
clear acknowledgment, reload impact and require review again; local editor
content SHALL remain recoverable. Existing focus return, permissions, target
revision errors and unpublish retry/idempotency behavior SHALL remain intact.

#### Scenario: Impact lookup fails
- **WHEN** the incoming usage request fails
- **THEN** the dialog displays retryable failure and does not permit an unreviewed destructive action

#### Scenario: Incoming set changes
- **WHEN** submission returns `CONTENT_LINK_IMPACT_CHANGED`
- **THEN** the dialog reloads impact and requires renewed acknowledgment without losing unsaved source edits

### Requirement: Hero and CTA are trailing palette entries
The Add block menu SHALL stably partition allowed definitions into all other
types in their existing relative order, followed by Hero and then CTA when
allowed. Filtering and keyboard navigation SHALL use that order. Saved block
order, server registry identity, configuration hashes and custom block types
SHALL NOT change solely because of palette ordering.

#### Scenario: Mixed custom and built-in definitions
- **WHEN** allowed types are `cta`, `custom`, `hero`, `image`, `link`
- **THEN** the menu shows `custom`, `image`, `link`, `hero`, `cta` while existing entry blocks retain their order
