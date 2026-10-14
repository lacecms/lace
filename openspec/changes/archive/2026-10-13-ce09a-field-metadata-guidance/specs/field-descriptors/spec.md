## ADDED Requirements

### Requirement: Portable field placeholders are display metadata
Text, textarea, URL, number, select and rich-text descriptors SHALL accept optional `placeholder` strings at every supported model, block data and block settings depth, including scalar list items. Normalization and metadata projection SHALL preserve the string exactly, including an empty string, as detached portable JSON. Other descriptor kinds SHALL reject `placeholder`; supported kinds SHALL reject non-string values at every builder and forged-metadata boundary with a descriptive descriptor path. Placeholders SHALL NOT change inferred content value types, defaults, validation or stored values. Omission SHALL add no property.

#### Scenario: Nested portable placeholder
- **WHEN** a list of groups has a text child with placeholder "Short heading"
- **THEN** the builder and JSON-round-tripped metadata retain the string and infer the same content value type as without it

#### Scenario: Invalid placeholders fail before use
- **WHEN** a supported kind carries a number or object placeholder, or a boolean, date, datetime, media, group or list carries any placeholder
- **THEN** both builder normalization and forged metadata validation reject it with the descriptor path

#### Scenario: Empty and absent placeholders
- **WHEN** supported descriptors respectively supply an empty placeholder and omit the option
- **THEN** normalization retains the empty string in the first and no placeholder property in the second, without inserting content or defaults

### Requirement: Field text counts match existing length validation
Ordinary text and textarea length bounds and counters SHALL measure raw UTF-16 code units without trimming or Unicode normalization. SEO title and description SHALL retain their existing trimmed Unicode code-point measurement. Shared count semantics SHALL preserve these distinct contracts without changing accepted values.

#### Scenario: Whitespace and supplementary characters
- **WHEN** an ordinary text field contains one space, one supplementary emoji and one space
- **THEN** its count is four and its length validation uses four, while the same SEO text counts one

#### Scenario: Combining marks remain unchanged
- **WHEN** a text value contains a letter followed by a combining mark
- **THEN** ordinary and SEO measurement each count two without silently normalizing the value
