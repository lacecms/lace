## ADDED Requirements

### Requirement: Field visibility is structural model configuration
`definePage`, `defineCollection` and `defineGlobal` SHALL accept optional
model-level `visibility` over the model's own fields with the rules of the
`conditional-fields` capability; nested owners use their group or block data
declarations. Visibility at model, group and block-data positions SHALL be
part of configuration projection identity and of structural identity, because
it changes validation and published shape. Content and default values
containing a `visibility` key SHALL remain ordinary structural data. Any structural
visibility change SHALL require a model version increase. A block data
visibility change SHALL be a block definition change under the existing
block-version and migration rules. Block `settingsVisibility` SHALL remain
projection-only. Configurations without `visibility` SHALL retain previous
projection and structure hashes.

A global's `seoDefaults` SHALL NOT reference a field that is a visibility
target; normalization SHALL reject such a reference naming the global and
option. Model `seo` fallback fields, `listFields`, `listOptions` and group
`itemLabel` MAY name a conditional field; a hidden value behaves like an
absent one there.

#### Scenario: Model-level rule
- **WHEN** a page model declares `visibility: { heroVideo: { field: "heroKind", values: ["video"] } }` over its own fields and increases its version
- **THEN** the configuration loads and its structure hash differs from the same model without the rule

#### Scenario: Version increase required
- **WHEN** a populated model adds a visibility rule without increasing its version
- **THEN** configuration synchronization refuses the plan as for any structural change without a version increase

#### Scenario: Conditional SEO default rejected
- **WHEN** a global's `seoDefaults.siteName` names a text field that depends on a select
- **THEN** configuration fails before startup naming the global and `seoDefaults.siteName`

#### Scenario: Settings visibility unchanged
- **WHEN** only a block's `settingsVisibility` changes
- **THEN** structure identity is unchanged and synchronization follows the existing projection-only rules
