## MODIFIED Requirements

### Requirement: Default-value compatibility

The content package SHALL validate every supplied default value against the
field's current descriptor contract during normalization. A rich-text default
SHALL be a safe shared Tiptap JSON document permitted by the rich-text document
contract, including H4, rules, plain code and the restricted optional link
attributes. The same shared document validator SHALL govern defaults and
submitted values at every composite depth. For descriptor normalization, a date, datetime, URL, and media
default SHALL be a string; text and textarea defaults SHALL observe their
length bounds; numbers SHALL be finite and observe numeric bounds; booleans and
selects SHALL match their declared values. Semantic validation of submitted
date, datetime, URL, and media values SHALL remain the responsibility of
runtime content validation.

#### Scenario: Reject a default with the wrong value kind

- **WHEN** a caller supplies a default whose runtime kind does not match its
  field descriptor
- **THEN** configuration normalization fails and identifies the invalid default

#### Scenario: Reject an unsafe rich-text default

- **WHEN** a caller supplies a rich-text default containing malformed document
  structure, a disallowed node, mark, or attribute, or an unsafe link URL
- **THEN** configuration normalization fails and identifies the invalid default

#### Scenario: Preserve a valid rich-text default as portable data

- **WHEN** a caller supplies a safe rich-text document default
- **THEN** the descriptor retains a detached JSON-serializable copy of that
  document

#### Scenario: Expanded nested default
- **WHEN** a rich-text field in a group or list declares a valid expanded document default
- **THEN** normalization retains a detached portable copy and subsequent validation uses the same document rules

#### Scenario: Unsafe expanded default
- **WHEN** a rich-text default supplies a code language, an unsupported target or rel token, or an unsafe link URL
- **THEN** normalization rejects the default
