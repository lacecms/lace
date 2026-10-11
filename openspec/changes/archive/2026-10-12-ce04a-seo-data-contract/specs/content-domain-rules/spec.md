## ADDED Requirements

### Requirement: Snapshots carry an optional SEO group with shared validation rules
A draft or published snapshot SHALL be able to carry an SEO group, held apart
from model fields, with the optional values `title`, `description`, `image`,
`canonical` and `noindex`. One portable rule set SHALL normalize and validate
the group, and REST contracts SHALL reuse it:

- `title` and `description` SHALL be single-line plain text. They are trimmed,
  an empty value clears them, and control characters or unpaired surrogates
  are rejected. They are limited to 200 (title) and 500 (description) Unicode
  code points.
- `canonical` SHALL be an absolute `http:` or `https:` URL with a host, no
  user name or password, no fragment and no whitespace. It is at most 2,048
  characters and is stored as submitted after trimming. An empty value clears
  it.
- `image` SHALL be a media identifier.
- `noindex` SHALL be a boolean. `false` is equivalent to absent.

A group whose values are all cleared and whose `noindex` is not `true` SHALL
normalize to no group. Validation failures SHALL be content validation issues
whose JSON Pointers are under `/seo`, for example `/seo/canonical`. Snapshot
cloning, publication, revert and copy SHALL preserve the group unchanged.

#### Scenario: Normalize a submitted group
- **WHEN** a group `{title: "  Hello  ", description: "", noindex: false}` is
  normalized
- **THEN** the result is `{title: "Hello"}`

#### Scenario: An empty group normalizes to none
- **WHEN** a group `{title: " ", canonical: "", noindex: false}` is normalized
- **THEN** the snapshot carries no SEO group

#### Scenario: Reject a relative or unsafe canonical URL
- **WHEN** `canonical` is `/blog/hello`, `//example.com/a`, `ftp://example.com/`,
  `https://user:pass@example.com/` or `https://example.com/a#top`
- **THEN** validation fails at `/seo/canonical`

#### Scenario: Reject over-long or multi-line text
- **WHEN** `title` has 201 code points, `description` has 501 code points, or
  either contains a line break
- **THEN** validation fails at the matching `/seo/...` pointer

#### Scenario: Publication and revert preserve the group
- **WHEN** a draft with an SEO group is published and later reverted
- **THEN** the published snapshot and the reverted draft carry the same group
