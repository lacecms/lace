## ADDED Requirements

### Requirement: Saving preserves stored SEO values until the editor edits them
Until the editor offers SEO inputs, a draft save from the admin SHALL send
back the `seo` value of the draft it loaded, unchanged. The admin SHALL send
no `seo` key for an entry whose draft DTO has none. Values set through the API
SHALL therefore survive saves and publications from the admin. A server
validation issue under `/seo` SHALL appear in the validation summary.

#### Scenario: Save keeps SEO values
- **WHEN** an editor changes the title of an entry whose loaded draft has
  `seo.title` "Hello" and saves
- **THEN** the save request carries that `seo` object and the saved draft
  still has `seo.title` "Hello"

#### Scenario: Entry without SEO
- **WHEN** an editor saves an entry of a model without SEO
- **THEN** the save request has no `seo` key
