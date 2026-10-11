## ADDED Requirements

### Requirement: Global models are route-less configuration singletons
The system SHALL let configuration code define a `global` model with
`defineGlobal`, accepting the same stable key, version, optional label and
description, typed fields, allowed block types and temporary synchronization
hints (`renamedFrom`, `removedFields`, `removedBlocks`) as a page, with the
same validation. A global SHALL have no path, route or `listFields`, and
configuration SHALL reject a global definition that supplies one of them.
Model keys SHALL be unique across pages, collections and globals, and a
`renamedFrom` source SHALL not repeat any configured key of any kind. A global
SHALL take part in no path or route collision check. The normalized model, the
runtime projection and the public projection SHALL carry `kind: "global"`, and
both the structural and projection hashes SHALL include the kind, so changing
a model's kind changes its structural hash.

#### Scenario: Define a global model
- **WHEN** configuration defines `defineGlobal({ key: "settings", version: 1, label: "Site settings", fields: { siteName: field.text({ required: true }) } })`
- **THEN** the normalized configuration contains a `global` model `settings`
  with that field, no path or route, and deterministic hashes

#### Scenario: Reject a key shared with another kind
- **WHEN** a page and a global both use the key `settings`
- **THEN** configuration normalization fails and names the duplicate key

#### Scenario: Reject routing options on a global
- **WHEN** a global definition supplies `path`, `route` or `listFields`
- **THEN** configuration normalization fails before application startup

#### Scenario: A kind change changes the structure
- **WHEN** two otherwise identical definitions with the same key are declared
  once as a page without blocks and fields and once as a global
- **THEN** their structural hashes differ
