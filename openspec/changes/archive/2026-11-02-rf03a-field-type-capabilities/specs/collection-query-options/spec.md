## ADDED Requirements

### Requirement: Query eligibility derives from shared field type capabilities

Collection query configuration, shared metadata schemas, query resolution,
cursor validation and SQL construction SHALL obtain sort/filter/search
eligibility, the sort family of a field and the operators of its filter kind
from the field type capability declaration of `field-descriptors`. The
accepted sets SHALL stay as specified by this capability: sort and filter
targets are text, textarea, number, boolean, select, date, datetime or url;
search targets are text or textarea; text, textarea and url filters accept
`eq` and `contains`; select accepts `in`; number accepts `eq` and `range`;
boolean accepts `eq`; date and datetime accept `range`; every filterable kind
accepts `isSet` and `isNotSet`. Fields of the string sort family (text,
textarea, select and url) SHALL keep string-anchor continuations and NOCASE
ordering; datetime fields SHALL keep UTC-instant ordering and safe-integer
boundaries. Node SQLite and local D1 SHALL produce identical pages,
continuations and validation failures, because both use the same shared
statement builder.

#### Scenario: Unchanged query validation

- **WHEN** the existing collection query, cursor and repository contract
  suites run against Node and D1
- **THEN** every case passes without modification, including rejection of a
  `contains` filter on a number field at `/filters/<index>/op` and of a
  searchable number field during configuration normalization

#### Scenario: Server and admin agree on operators

- **WHEN** the admin condition editor lists the operators for each
  filterable field kind
- **THEN** the list equals the operators the server accepts for that kind,
  followed by `isSet` and `isNotSet`
