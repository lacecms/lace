## MODIFIED Requirements

### Requirement: Configured custom blocks are scaffolded from their definitions
For a block type registered in `lace.config.ts` without a registry item, the command SHALL require a `definitions` module recorded in `lace.site.json`, SHALL load it, and SHALL find the export whose definition type equals the block type; it SHALL fail with an actionable error when no module is recorded or no matching export exists. It SHALL write a component named from the block type under the components directory, typed with `BlockProps` of the definition imported from the definitions module (never copied), rendering each field with a `data-lace-part` hook named after the field inside an element carrying `data-lace-block` and `data-lace-block-key`, rich-text fields through the adapter's rich-text component and media fields through `mediaUrl`. The scaffold's root element SHALL carry the block's class name as its `class` and the block's anchor as its `id`, each only when the block has one. It SHALL record the component under `customBlocks` and register it in the block map. An existing scaffold SHALL never be rewritten. `--all` SHALL install every configured block type that has a registry item, scaffold the others when a definitions module is recorded, and report every configured block type left without a renderer.

#### Scenario: Custom block scaffold
- **WHEN** the configuration registers a custom `faq` block exported as `faq` from the recorded definitions module and `lace add block faq` runs
- **THEN** `FaqBlock.astro` is written typed from that definition, the map imports the definition from the module and registers the component, and the lock records it under `customBlocks`

#### Scenario: Scaffold places the envelope
- **WHEN** a custom block is scaffolded
- **THEN** its root element binds `class` to the block's class name and `id` to the block's anchor, so a block without either renders neither attribute

#### Scenario: Missing definitions module
- **WHEN** `--all` runs, the configuration registers a custom block, and no `definitions` module is recorded
- **THEN** registry items are installed and the custom block type is reported as having no renderer with instructions to record a definitions module
