## MODIFIED Requirements

### Requirement: Serializable normalized configuration

The content package SHALL accept only JSON-serializable builder option values
and SHALL return a detached, normalized field definition. The returned
definition and its derived form metadata SHALL survive a JSON stringify/parse
round trip without executable values, runtime schemas, symbols, cyclic
references, non-finite numbers, or host-specific objects. An option array
SHALL be refused when it carries a non-index property, because serialization
would drop it, and SHALL be accepted when an element is a non-enumerable data
property, because serialization reads elements by index. Normalization SHALL
handle any nesting depth that a JSON parser produces and SHALL report a
non-portable value with a descriptive error rather than a host stack error.

#### Scenario: Project metadata for an admin form

- **WHEN** a caller derives form metadata from a valid field definition
- **THEN** the metadata exposes the field kind, normalized common options, and
  applicable type-specific options using JSON data only

#### Scenario: Reject a non-portable option value

- **WHEN** a builder receives an option graph containing a function, symbol,
  bigint, cyclic reference, non-finite number, or non-plain object
- **THEN** configuration normalization fails with a descriptive error before a
  field definition is returned

#### Scenario: Reject an array that loses data when serialized

- **WHEN** a builder receives a default value containing an array with a
  non-index property
- **THEN** configuration normalization fails with a descriptive error that
  names the array's path

#### Scenario: Normalize a deeply nested portable value

- **WHEN** a portable value nested 100,000 levels deep is normalized
- **THEN** normalization returns a detached copy equal to the input, and a
  non-portable value at the innermost level fails with a descriptive error
  instead of a stack overflow
