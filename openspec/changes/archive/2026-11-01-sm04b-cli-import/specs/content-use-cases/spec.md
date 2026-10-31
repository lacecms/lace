## ADDED Requirements

### Requirement: Draft normalization is a shared pure function
The application SHALL expose one pure, runtime-portable function that turns a
submitted draft (title, slug, fields, blocks with their envelope, SEO input)
for a given model and block registry into the normalized draft that create,
save and publish store: validated and defaulted fields and block data, block
settings with defaults, the block envelope with `hidden` resolved, normalized
SEO values and, for a global, the model label or key as the title. The create,
save and publish use cases SHALL use this function, and it SHALL perform no
persistence, authorization, media existence or link-target check. The same
input SHALL always produce the same normalized draft, so a client applying it
can predict whether a save would change the stored draft.

#### Scenario: Client prediction matches the stored draft
- **WHEN** a client normalizes a valid draft with the shared function and the server saves the same input
- **THEN** the normalized title, slug, fields, blocks and SEO equal the saved draft's values in canonical JSON

#### Scenario: Global title is replaced
- **WHEN** the function normalizes a draft of the `settings` global labelled `Site settings` with the title `Anything`
- **THEN** the normalized title is `Site settings`

#### Scenario: Invalid draft
- **WHEN** the function receives block data that fails its block definition
- **THEN** it raises the same validation issue and path as a draft save
