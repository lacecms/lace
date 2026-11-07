## ADDED Requirements

### Requirement: Filter values are checked by one portable rule
The content package SHALL publish the presence operators (`isSet`,
`isNotSet`) that every filterable type supports, and one portable check that
returns whether a filter's operation and value are valid for a field filter
kind. The check covers the operator and operand rules of "Filters have
bounded type-specific semantics", including select option membership and the
50-value `in` bound. The application query validation and the admin filter
editor SHALL use that check instead of their own copies. Their pointers,
failure codes and admin messages SHALL stay unchanged. A shared parity table
SHALL show that the application and the admin accept and reject the same
filters. The per-kind operator table and everything derived from it
(capability discovery, OpenAPI and SQL) SHALL be unchanged.

#### Scenario: Application and admin agree on a filter
- **WHEN** the parity table supplies a select `in` filter with 51 values, a
  number `range` with min above max, or a text `contains` with an empty
  operand
- **THEN** the application query validation and the admin filter editor both
  reject it, and both accept the corresponding valid filters

#### Scenario: Presence operators have one declaration
- **WHEN** a maintainer adds a filterable field type
- **THEN** it supports `isSet` and `isNotSet` through the shared declaration
  without an edit in the application or the admin
