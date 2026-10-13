## MODIFIED Requirements

### Requirement: Rich text is described through the shared allowlist
The render core SHALL describe a rich-text document only after validating it with the content package's rich-text validation, so it accepts and rejects exactly the documents the CMS accepts and rejects, including link URLs. The description SHALL be a tree of text nodes and element nodes; each element SHALL carry a tag from a fixed allowlist (`p`, `h1`–`h4`, `ul`, `ol`, `li`, `blockquote`, `br`, `hr`, `pre`, `strong`, `em`, `s`, `code`, `a`), only safe attributes (a validated link `href`, optional `target: "_blank"` and renderer-derived `rel`), the originating node or mark name, and its children. Marks SHALL wrap text in the order listed, first mark outermost. The description SHALL contain no raw HTML string. Invalid documents SHALL fail with `invalid_rich_text` carrying the optional block context and the field path.

The description SHALL represent a horizontal rule as an empty `hr` and a plain
code block as `pre` containing `code` containing escaped-by-adapter text,
without language, styles or raw HTML. Both code elements SHALL originate from
`codeBlock`. Code text and whitespace SHALL be preserved. A link without target
or rel SHALL describe only href. Nofollow alone SHALL describe rel `nofollow`;
new-tab alone SHALL describe target `_blank` and rel `noopener noreferrer`;
both SHALL describe target `_blank` and rel `noopener noreferrer nofollow`.
The generated safety tokens SHALL NOT expand the stored-document allowlist.

#### Scenario: A formatted document is described
- **WHEN** a document has a heading, a paragraph with bold and linked text, and a bullet list
- **THEN** the description contains the matching elements with the link `href` as the only attribute

#### Scenario: Drifted site-local cases are rejected
- **WHEN** a document contains a link to `https:example.com`, a `mailto:` link without `@`, or a paragraph nested inside a paragraph
- **THEN** describing it fails with `invalid_rich_text`, exactly as content validation rejects it

#### Scenario: Validation parity
- **WHEN** any document in the shared parity corpus is validated by the content package and described by the render core
- **THEN** both accept it or both reject it

#### Scenario: All four link descriptions
- **WHEN** the four accepted combinations of new-tab and nofollow are described
- **THEN** each has exactly the attributes and deterministic rel token order specified above

#### Scenario: Plain code and rules
- **WHEN** a valid document has H4, a rule and code containing tabs, newlines and markup-like text
- **THEN** its description contains h4, empty hr and pre/code with the original text and no raw HTML

#### Scenario: Expanded validation parity
- **WHEN** expanded documents, unsupported attributes, malformed code children and unsafe URLs are validated and described
- **THEN** both paths accept or reject exactly the same inputs with path-aware errors
