## ADDED Requirements

### Requirement: Entry payloads accept the global kind without a slug
Entry payload and aggregate validation SHALL accept the model kinds `page`,
`collection` and `global` and reject any other kind. A global entry payload
SHALL NOT carry a slug in draft or publish mode; a supplied slug SHALL fail
with a stable issue at the slug path. Publish validation of a global SHALL
otherwise follow page rules: the title and every required model and block field
are enforced, and no slug is required.

#### Scenario: Validate a global draft
- **WHEN** a global entry with a title, valid fields and allowed blocks and no
  slug is validated in draft or publish mode
- **THEN** validation succeeds when the publish-mode required fields are present

#### Scenario: Reject a global slug
- **WHEN** a global entry payload supplies a slug
- **THEN** validation fails with an issue at the slug path

#### Scenario: Reject an unknown kind
- **WHEN** a payload names a kind other than page, collection or global
- **THEN** validation fails with the invalid-kind issue
