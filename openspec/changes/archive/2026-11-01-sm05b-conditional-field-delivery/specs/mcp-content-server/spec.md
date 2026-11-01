## ADDED Requirements

### Requirement: Tool guidance describes conditional fields
`list_content_models` SHALL return each owner's `visibility` rules in the
shared model, group and block metadata, with no MCP-specific encoding. Tool
descriptions SHALL state that a field listed under `visibility` applies only
when its controller holds one of the listed values; that `create_entry` and
`save_draft` keep values of hidden fields and validate them as drafts; and
that `publish_entry` does not require hidden fields and never publishes their
values. Conditional behavior of every tool SHALL be the shared use-case
behavior, identical to REST on Node and Cloudflare.

#### Scenario: Agent discovers rules
- **WHEN** an agent lists content models for a model whose gallery items declare `visibility` on `kind`
- **THEN** the result carries the same rules as REST model discovery and the tool descriptions explain how they affect saving and publishing

#### Scenario: Agent publishes conditional content
- **WHEN** an agent saves a gallery item with `kind: "image"`, a `media` value and a leftover `videoUrl`, then publishes it
- **THEN** the save keeps `videoUrl` in the draft, publication succeeds, and the published snapshot returned by `get_entry` has no `videoUrl`
