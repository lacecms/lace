## ADDED Requirements

### Requirement: Admin list page limits have one bound
The admin entry-list and media-list query contracts, the server's page
parsing, the persistence adapters and the generated OpenAPI document SHALL
use the shared list page limit: an integer from 1 to 100, defaulting to 50
when omitted. A limit outside that range, or one that is not a canonical
decimal integer, SHALL fail with the stable `VALIDATION_FAILED` envelope and
the pointer `/limit` before any list read. The OpenAPI document SHALL describe
the same range that the server enforces. Bounded reads with their own
declared limits are unchanged: the build export (1–100, default 100),
internal-link pages (1–50, default 20) and the media tag catalog (1–100,
default 50).

#### Scenario: OpenAPI and the server agree
- **WHEN** a client reads the `limit` parameter of the admin entry-list and
  media-list operations in the generated OpenAPI document
- **THEN** it is described as an integer string from 1 to 100, exactly the
  range the server accepts

#### Scenario: An over-large page is refused
- **WHEN** a client requests an admin entry list or media list with
  `limit=101` or `limit=500`
- **THEN** the API returns `422` `VALIDATION_FAILED` with pointer `/limit`
  and runs no list query

#### Scenario: The default page size applies
- **WHEN** a client omits `limit`
- **THEN** the list returns at most 50 items

## MODIFIED Requirements

### Requirement: Contract projections cover their application results
Every contracts projection input that mirrors an application result SHALL be
checked against that result when the code is built. This covers the content
model, collection list options, entry summary, import token, media
metadata, media detail, media usage location, public entry, public media,
public global and build-export page. The set of checked pairs SHALL be total:
every type that the contracts package exports with a name ending in `Source`
SHALL appear in the checks, so a new projection input cannot be added without
one. The check SHALL require that:

- the application result is assignable to the projection input;
- every property of the application result is a property of the projection
  input or is named in a declared list of intentionally omitted properties
  (for example a media item's private storage key);
- every property of the projection input exists on the application result;
- a property optional on one side is optional on the other;
- nested object and array-element shapes (the content model's `seo` and
  `seoDefaults`, and the media detail's `usage` items) satisfy the same
  rules.

The content model projection SHALL map every property of its input to the
content model DTO. Its mapped properties SHALL equal the properties of the
content model DTO schema, so a new optional model property cannot be
accepted by the schema while being dropped from discovery responses on REST
or MCP. Existing DTO shapes, values and OpenAPI SHALL remain unchanged.

#### Scenario: A new application property is caught at build time
- **WHEN** a maintainer adds an optional property to a discovered content
  model without adding it to the contracts projection input
- **THEN** typechecking fails and names the content model pair until the
  property is projected or declared as intentionally omitted

#### Scenario: A property the application already returns is declared
- **WHEN** content model discovery returns conditional-field `visibility`
- **THEN** the application result type declares `visibility`, and REST and
  MCP discovery responses contain the same normalized `visibility` as before

#### Scenario: The content model projection matches its schema
- **WHEN** the content model DTO schema gains or loses a property
- **THEN** a contracts test fails until the projection maps exactly the
  schema's properties

#### Scenario: Private storage data stays out of public media
- **WHEN** a public media projection input is checked against stored media
  metadata
- **THEN** every other stored property, including the storage key,
  filename, tags, hash, size, status, timestamps and attribution, is listed
  as intentionally omitted, and public media responses do not contain them

#### Scenario: A new projection input must be checked
- **WHEN** a maintainer exports a new `…Source` type from contracts without a
  mirror check
- **THEN** the test-utils check fails and names the unchecked type

#### Scenario: A nested property drifts
- **WHEN** the application adds a property to a media usage location or to a
  model's SEO configuration without adding it to the projection input
- **THEN** typechecking fails and names the nested pair
