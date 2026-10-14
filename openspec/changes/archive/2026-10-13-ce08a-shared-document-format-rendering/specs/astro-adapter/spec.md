## MODIFIED Requirements

### Requirement: Rich text renders only the validated element description
The adapter SHALL provide a rich-text component that validates its `document` with the render core's rich-text description and renders only the described allowlisted elements, safe attributes, and escaped text, preserving node and mark order and nesting. It SHALL never render raw HTML. It SHALL accept optional override components keyed by originating node or mark name; an override SHALL receive only the validated element description and its already-rendered children, and nodes or marks without an override SHALL render with their described tag. An optional block context SHALL be included in rich-text failures.

The default rendering SHALL include `h4`, void `hr` and `pre` containing `code`,
and emit the description's href, target and rel on links. Code SHALL be escaped
as text with spaces, tabs and line breaks preserved. The component SHALL not
inject formatting whitespace into code or trim it. Overrides SHALL receive the
validated target and derived rel as well as href; code-block overrides SHALL
receive the corresponding validated element description and children.

#### Scenario: Supported formatting
- **WHEN** a document contains headings, paragraphs, lists, a blockquote, a hard break, and bold, italic, strike, code, and link marks
- **THEN** the output contains the corresponding structural elements with link `href` values that passed the shared URL check and no serialized rich-text JSON

#### Scenario: Unsafe document
- **WHEN** a document contains an unsupported node, mark, or attribute, invalid nesting, or a link such as `javascript:alert(1)` or `https:example.com`
- **THEN** rendering fails with `invalid_rich_text` and no markup derived from the unsafe input is emitted

#### Scenario: Link override
- **WHEN** a site passes an override for `link`
- **THEN** every link renders through the override with the validated `href` in the element description and its rendered children, and other nodes and marks render unchanged

#### Scenario: Expanded output and independent link choices
- **WHEN** a document containing H4, a rule, plain code and all four new-tab/nofollow combinations is rendered through Astro
- **THEN** output contains h4, hr, escaped pre/code and the exact safe link attributes described by the render core

#### Scenario: Code text is escaped without whitespace loss
- **WHEN** plain code contains a leading tab, repeated spaces, newlines and `<script>` or `&` text
- **THEN** the rendered code text preserves the exact whitespace and characters without creating script elements

#### Scenario: Expanded link override
- **WHEN** a link override receives a validated new-tab nofollow link
- **THEN** its description contains target `_blank` and rel `noopener noreferrer nofollow` and its already-rendered children

#### Scenario: Unsupported code and link input
- **WHEN** a document supplies a code language attribute, marked code-block text, arbitrary target/rel or an unsafe link URL
- **THEN** rendering fails with `invalid_rich_text` before emitting unsafe markup
