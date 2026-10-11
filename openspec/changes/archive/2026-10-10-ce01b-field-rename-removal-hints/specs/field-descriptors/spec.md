## ADDED Requirements

### Requirement: Field rename hint option
Every field builder SHALL accept an optional `renamedFrom` option naming the
former key of the field. The value SHALL be a valid field key: an ASCII letter
followed by ASCII letters or digits. The builder SHALL reject any other value
and SHALL keep a valid value on the returned definition as temporary
synchronization metadata. The option SHALL NOT change the field's kind,
inferred value type, validation, or default-value rules.

#### Scenario: Accept a valid rename hint
- **WHEN** configuration code defines `field.text({ renamedFrom: "headline" })`
- **THEN** the returned definition is a text field that carries the former key
  `headline` and validates values exactly like a text field without the hint

#### Scenario: Reject a malformed rename hint
- **WHEN** a builder receives a `renamedFrom` value that is not a string or is
  not a valid field key
- **THEN** field definition fails with a descriptive error before a definition
  is returned
