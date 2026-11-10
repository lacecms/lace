## MODIFIED Requirements

### Requirement: Ordinary text counters distinguish declared hard limits from SEO advice
Text and textarea controls SHALL show a visible current count, measured using raw UTF-16 length, associated with the control. A control with declared minLength or maxLength SHALL show its count, including zero for an absent value, at all times; an unbounded control SHALL show its count only while its value is non-empty. The count SHALL be shown right-aligned in the field's label row rather than on a line of its own and SHALL be visible regardless of focus. When minLength or maxLength is declared, the counter and associated constraint guidance SHALL identify the declared bounds as validation limits. Unbounded fields SHALL show a count without inventing a limit. Counts SHALL be available in read-only inspection and absent from per-keystroke live announcements. Counter rendering SHALL NOT truncate input, block typing or replace existing save/publication validation. SEO counters SHALL explicitly identify 60/160 as recommendations, retain trimmed code-point counting, state their separate existing hard limits on the same line (for example "15 / 60 recommended · 200 max") and remain visible.

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

#### Scenario: Counter sits in the label row
- **WHEN** a writer views an empty unbounded caption field, types "Hi" and moves focus away
- **THEN** no count is shown while the field is empty, "2 characters" is then visible on the field's label row after focus leaves, the field occupies no extra line for it, and the control's accessible description includes the count

#### Scenario: A bounded empty field shows its count
- **WHEN** a writer views an empty optional text field declaring maxLength 80
- **THEN** its label row shows "0 characters" and its guidance identifies 80 as the validation maximum
