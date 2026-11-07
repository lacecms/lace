## ADDED Requirements

### Requirement: Contract JSON values follow the content portable-JSON rule

Every shared contract schema that accepts a consumer-owned JSON value or JSON
object (entry `fields`, block `data` and `settings`, field metadata defaults,
layouts, visibility rules and error `details`) SHALL accept exactly the values
that content configuration normalization accepts, and SHALL refuse every
other value. The rule SHALL accept `null`, booleans, strings, finite numbers,
dense arrays and objects with the ordinary or null prototype whose own keys
are strings, whose properties are data properties, and whose children follow
the same rule. Object properties SHALL be enumerable. An array SHALL have no
own keys other than its indices and `length`, and SHALL have no holes or
accessor elements; an array element SHALL NOT need to be enumerable. A
reference cycle SHALL be refused, and an acyclic value that reaches the same
object twice SHALL be accepted. Validation SHALL return a result, never a
host stack error, for any nesting depth that a JSON parser produces.
Contract validation and content normalization SHALL be checked against one
shared table of edge values that expects no difference.

#### Scenario: An array with a named property is refused

- **WHEN** a caller validates an entry `fields` object whose list value is an
  array that also carries a non-index property
- **THEN** contract validation refuses it, as content normalization does,
  because `JSON.stringify` would drop that property

#### Scenario: A non-enumerable array element is accepted

- **WHEN** a JSON value contains a dense array one of whose elements is a
  non-enumerable data property
- **THEN** contract validation accepts it, as content normalization does

#### Scenario: Parsed request bodies are unaffected

- **WHEN** a request body produced by `JSON.parse` carries valid JSON values
  of any shape
- **THEN** contract validation gives the same result as before this rule

#### Scenario: A deeply nested value is validated

- **WHEN** a JSON value is an array nested 100,000 levels deep around a number
- **THEN** contract validation accepts it without a stack overflow, and the
  same value with an `undefined` at its innermost level is refused

#### Scenario: The edge table agrees

- **WHEN** the shared edge table (primitives, non-finite numbers, executable
  and host values, prototypes, symbol keys, accessors, non-enumerable
  properties, cycles, shared references, sparse arrays and the two array
  cases above) runs against contract validation and content normalization
- **THEN** both give the same verdict for every value
