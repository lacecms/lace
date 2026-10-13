## MODIFIED Requirements

### Requirement: Safe rich-text documents and URL values

The content package SHALL expose a safe shared rich-text document type and SHALL
accept only Tiptap JSON documents whose nodes are `doc`, `paragraph`, `text`,
`heading` at levels 1 through 4, `bulletList`, `orderedList`, `listItem`,
`blockquote`, `hardBreak`, `horizontalRule`, and `codeBlock`; and whose marks are `bold`, `italic`, `strike`,
`code`, and `link`. `heading` SHALL permit only its numeric `level` attribute.
`link` SHALL require its string `href` attribute and permit only optional
`target: "_blank"` and `rel: "nofollow"` in addition. Omission SHALL mean the
current browsing context and no nofollow respectively; null, empty strings,
other targets, arbitrary rel tokens and extra attributes SHALL be rejected.
`horizontalRule` SHALL contain only its type. `codeBlock` SHALL permit only its
type and optional content array containing text nodes without marks or
attributes; empty code blocks SHALL be valid. Code text SHALL preserve spaces,
tabs and line breaks. Code blocks and rules SHALL be permitted at the document
root and in list items and blockquotes, alongside their previously permitted
children; all other existing nesting rules SHALL remain unchanged. Every link and URL-field
value SHALL be an `https:`, `http:`, `mailto:`, or `tel:` URL, a root-relative
path beginning with one `/` but not `//`, or a fragment beginning with `#`.
The validator SHALL reject all other nodes, marks, attributes, raw HTML,
scriptable schemes, event-handler attributes, style attributes, and malformed
document structure.

#### Scenario: Accept an approved formatted document

- **WHEN** a rich-text field contains a structurally valid document using an
  approved node/mark set and an allowed link URL
- **THEN** rich-text validation succeeds and returns the safe shared document
  type

#### Scenario: Reject executable rich-text content

- **WHEN** a document contains a raw HTML node, an unknown node or mark, a
  style/event attribute, an unsupported heading/link attribute, or a
  `javascript:` link
- **THEN** validation fails at the offending document path

#### Scenario: Reject an unsafe URL field

- **WHEN** a URL field contains a protocol-relative, malformed, or unapproved
  protocol URL
- **THEN** validation fails with a path-aware issue

#### Scenario: Expanded shared document
- **WHEN** a document contains H4, horizontal rules and empty or multiline plain code blocks at the root, inside a list item or inside a blockquote
- **THEN** validation accepts it with its text and whitespace unchanged

#### Scenario: Independent link choices
- **WHEN** an approved link supplies neither optional attribute, only target `_blank`, only rel `nofollow`, or both
- **THEN** validation accepts all four choices and preserves the supplied attributes

#### Scenario: Unsupported expanded attributes
- **WHEN** a document contains H5, a code language attribute, marked code-block text, a rule with children, target `_self`, null attributes or rel `noopener`, `noreferrer` or arbitrary token combinations
- **THEN** validation rejects it at the offending document path

#### Scenario: Nested rich-text leaves use the same rules
- **WHEN** an expanded document is used in a field inside a group or list, or in block data
- **THEN** the same validation accepts it in draft and publication modes without counting rich-text nodes toward CE7 list budgets or changing required-field semantics

#### Scenario: Existing documents stay valid
- **WHEN** a previously valid H1–H3 or href-only document is validated
- **THEN** it succeeds without rewriting headings, attributes or content
