## ADDED Requirements

### Requirement: Model discovery transports optional sidebar icons
The shared model discovery contract used by authorized REST and MCP reads
SHALL carry an optional `icon` string on each model. The model response
schema SHALL document the option in OpenAPI and accept one recognized emoji
sequence or a lowercase kebab-case icon identifier beginning with an ASCII
letter. The string SHALL fit within 64 UTF-16 code units. A syntactically
valid identifier outside the local catalog SHALL pass transport validation
so that an admin version with a smaller catalog can use its kind fallback.
Public entry payloads and build exports SHALL keep their existing shape.

#### Scenario: Model discovery preserves icon metadata
- **WHEN** an authorized client discovers models on Node or Cloudflare with
  one configured Lucide name, one emoji, and one omitted icon
- **THEN** both shared transport representations contain exact strings for
  the first two models and omit the property on the third

#### Scenario: A newer icon name reaches the admin fallback
- **WHEN** a metadata response carries a well-formed icon name unknown to
  the installed admin
- **THEN** the shared response schema accepts that name and delivers the
  rest of the model list

#### Scenario: Malformed icon metadata fails response validation
- **WHEN** discovery metadata contains a non-string, an empty or overlong
  string, whitespace around its value, or multiple emoji
- **THEN** shared response validation rejects it
