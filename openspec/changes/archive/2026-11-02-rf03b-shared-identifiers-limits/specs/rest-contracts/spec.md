## ADDED Requirements

### Requirement: Contract projections cover their application results
Every contracts projection input that mirrors an application result SHALL be
checked against that result when the code is built. This covers the content
model, collection list options, entry summary, import token, media
metadata, media detail, media usage location, public entry, public media,
public global and build-export page. The check SHALL require that:

- the application result is assignable to the projection input;
- every property of the application result is a property of the projection
  input or is named in a declared list of intentionally omitted properties
  (for example a media item's private storage key);
- every property of the projection input exists on the application result.

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
