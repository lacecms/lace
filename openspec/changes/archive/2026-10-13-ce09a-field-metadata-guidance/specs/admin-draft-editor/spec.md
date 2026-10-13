## MODIFIED Requirements

### Requirement: Draft fields are rendered from validated model metadata
The authenticated entry route SHALL load the requested entry and its matching
configured model before presenting editable content. It SHALL render the title
of a page or collection entry, the
collection-only slug, and every supported model-field descriptor from the
validated serializable metadata supplied by the model API. The field surface
SHALL cover text, textarea, rich text, number, boolean, date, datetime, select,
URL, and media descriptor types; it SHALL not execute callbacks or accept
unvalidated descriptor data from a response. Select fields SHALL choose from
the descriptor's options through a labelled listbox control, and an optional
select SHALL offer a choice that clears its value. Date fields SHALL be chosen
from a keyboard-operable calendar and SHALL display the chosen calendar date in
words. Datetime fields SHALL combine that calendar with a time input and SHALL
state that the time is in UTC; they SHALL store a UTC ISO timestamp. Optional
date and datetime values SHALL be clearable. Boolean fields SHALL be a labelled
switch that exposes its on or off state. URL fields SHALL offer to open an
entered `http` or `https` URL in a new browsing context. Editable values SHALL
be locally validated against the same client-safe descriptor constraints before
save, and each field error SHALL be programmatically associated with its
control, which SHALL also be marked invalid.

#### Scenario: A configured form is loaded
- **WHEN** an authenticated writer opens an entry whose model has text, number,
  boolean, select, date, datetime, URL, media, textarea, or rich-text fields
- **THEN** the draft values appear in controls generated from their descriptor
  metadata with accessible labels, descriptions where configured, and the
  descriptor-appropriate constraints

#### Scenario: A writer picks a select option and a date
- **WHEN** a writer opens a select field, chooses the "release" option, then opens a date field's calendar and chooses 25 September 2026
- **THEN** the select shows "release", the date control reads "Sep 25, 2026", and the next complete-draft save carries `release` and `2026-09-25`

#### Scenario: A writer sets a datetime
- **WHEN** a writer chooses 25 September 2026 and enters 14:30 in a datetime field
- **THEN** the next complete-draft save carries `2026-09-25T14:30:00.000Z` and the control states that the time is UTC

#### Scenario: A writer toggles a boolean
- **WHEN** a writer activates a boolean field's switch with the keyboard
- **THEN** the switch reports that it is on and the next complete-draft save carries `true`

#### Scenario: Client validation prevents an invalid save
- **WHEN** a writer submits a draft with an invalid
  select choice, a string or numeric value outside declared bounds, or another
  locally detectable descriptor violation
- **THEN** the affected control exposes an accessible error and the browser does
  not issue a draft-save request

#### Scenario: Model metadata is malformed or does not match the entry
- **WHEN** the entry route receives invalid model metadata, the model key does
  not exist, or the entry belongs to another model
- **THEN** it presents a safe error or not-found state and does not expose an
  editable form using unvalidated metadata

#### Scenario: Incomplete draft remains savable
- **WHEN** a writer saves an otherwise valid draft with a missing required model or block field
- **THEN** the draft save is allowed, while publication still applies the existing required-field rules and hidden-block exception

## ADDED Requirements

### Requirement: Configured placeholders guide empty controls
Editable text, textarea, URL, number, select and rich-text controls SHALL show configured placeholders when empty at every supported model and block data/settings depth, including scalar list items. An explicit inherited SEO/media placeholder SHALL take precedence; inherited explanations and configured descriptions SHALL remain available. Omitted placeholders SHALL retain existing control fallback behavior; an empty configured string SHALL suppress a generic fallback. Rich-text placeholders SHALL be exposed through aria-placeholder and SHALL NOT appear for viewers. Placeholders SHALL NOT replace labels, become content, dirty the draft or change defaults. Metadata updates SHALL NOT reset rich-text history, selection or form values.

#### Scenario: Nested and scalar-item prompts
- **WHEN** a writer opens empty nested text, select and rich-text fields and scalar list items with configured placeholders
- **THEN** each appropriate control shows its configured prompt without creating values or unsaved changes

#### Scenario: Inherited guidance wins
- **WHEN** a field has a configured generic placeholder and an existing inherited media or SEO explanation
- **THEN** inherited guidance remains the effective prompt and its accessible explanation is preserved

#### Scenario: Rich-text metadata updates
- **WHEN** a configured rich-text placeholder changes while the draft has content and undo history
- **THEN** content, selection and undo history are retained without generating a content edit

### Requirement: Required and constraint guidance is consistent and accessible
Every applicable descriptor control SHALL show a visible required marker and explain required-for-publication semantics when required. Scalar labels and composite legends SHALL retain accessible names; controls SHALL expose required state through role-supported accessibility attributes or associated explanatory text without native required validation blocking draft saves. Guidance SHALL include configured descriptions and declared text length, numeric and list bounds with accurate draft/publication semantics. All associated description IDs SHALL resolve to existing elements, coexist with errors and inherited annotations, and remain readable in viewer mode. Guidance SHALL NOT materialize absent containers, change validation rules or introduce viewer mutation actions.

#### Scenario: Required nested group and leaves
- **WHEN** a model or block has a required group with required text, select, boolean, media and rich-text leaves
- **THEN** its legend and applicable control labels expose required guidance and associated descriptions while an otherwise valid incomplete draft remains savable

#### Scenario: List minima differ from hard maxima
- **WHEN** a list declares minItems 2 and maxItems 5
- **THEN** guidance explains the minimum applies to publication and the maximum to drafts as well, without changing existing list operations or budgets

#### Scenario: Read-only and errors coexist
- **WHEN** a viewer inspects nested fields with required state, constraints, configured descriptions and errors
- **THEN** guidance and errors remain associated with the controls, disclosures remain usable and mutation actions are absent

### Requirement: Ordinary text counters distinguish declared hard limits from SEO advice
Text and textarea controls SHALL show a visible current count, including zero for an absent value, measured using raw UTF-16 length. When minLength or maxLength is declared, the counter and associated constraint guidance SHALL identify the declared bounds as validation limits. Unbounded fields SHALL show a count without inventing a limit. Counts SHALL be associated with the control, available in read-only inspection and absent from per-keystroke live announcements. Counter rendering SHALL NOT truncate input, block typing or replace existing save/publication validation. SEO counters SHALL explicitly identify 60/160 as recommendations, retain trimmed code-point counting and explain their separate existing hard limits.

#### Scenario: Declared maximum and failed save
- **WHEN** a writer enters an ordinary text value longer than maxLength
- **THEN** the counter reflects its full raw length, guidance identifies the hard maximum and existing validation rejects saving without truncating the author's input

#### Scenario: Optional absent field with minimum
- **WHEN** an optional text field with minLength is absent
- **THEN** its count is zero and its minimum guidance does not claim that absence prevents saving or publication

#### Scenario: Counter after list moves and viewer inspection
- **WHEN** text items are moved or duplicated in a nested list and the saved entry is later viewed read-only
- **THEN** each visible count belongs to its current value and declared bounds and no counter announces every keystroke

#### Scenario: SEO advice remains advisory
- **WHEN** SEO title text exceeds 60 code points but remains within its hard limit
- **THEN** the counter labels 60 as recommended, shows the advisory warning and permits saving
