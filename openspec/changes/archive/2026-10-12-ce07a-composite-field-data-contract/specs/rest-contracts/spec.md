## ADDED Requirements

### Requirement: Composite metadata and values cross existing REST boundaries
Model and block metadata schemas SHALL accept recursively validated group/list
descriptors and reject malformed, over-depth or cyclic definitions. OpenAPI
SHALL describe the recursive descriptor alternatives and bounds. Existing admin
request/response and public entry, global and export shapes SHALL carry groups
as objects and lists as arrays without item envelopes or new IDs; media values
SHALL stay IDs. Composite validation errors SHALL use exact JSON Pointer paths
under fields or block data. Media usage locations SHALL retain their existing
shape with nested pointer strings in `field` and unchanged scalar strings.
Public media dictionaries and eligibility SHALL include nested published model
and visible-block references and exclude draft-only and hidden-only references.
Existing response sanitization, header and concurrency contracts SHALL remain.

#### Scenario: Metadata round trip
- **WHEN** the API exposes a model containing nested groups/lists
- **THEN** its response passes the shared metadata contract and the recursive descriptor shape is documented in OpenAPI

#### Scenario: Precise error response
- **WHEN** an authorized save supplies invalid media data at images item index 2 in block index 0
- **THEN** the 422 validation envelope includes `/blocks/0/data/images/2/image`

#### Scenario: Nested usage location
- **WHEN** media is used in a group child of a draft list item
- **THEN** admin media detail reports its nested `field` pointer with the existing draft/published state representation

#### Scenario: Published nested media dictionary
- **WHEN** nested media is used by a published field or visible block and other media only by hidden blocks or drafts
- **THEN** public reads, globals and exports resolve only the publicly eligible IDs, without storage keys or uploader data
