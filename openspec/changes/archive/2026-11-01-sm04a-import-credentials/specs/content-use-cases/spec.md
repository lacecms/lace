## ADDED Requirements

### Requirement: Entry lists filter by exact draft slug
The entry-list use case SHALL accept an optional slug for collection models and
SHALL return only entries whose current draft slug equals it exactly, under
the existing `list` operation and `content:read` authorization. The predicate
SHALL apply before paging and to the per-status totals and SHALL combine with
search, status, filters and sorts. It SHALL be validated before persistence
reads and SHALL be refused for page and global models. Draft slugs are not
unique, so a result MAY contain more than one entry; the use case SHALL NOT
pick one.

#### Scenario: Two drafts share a slug
- **WHEN** two drafts of `posts` both have slug `about` and a client lists `posts` with slug `about`
- **THEN** both are returned and the totals count two

#### Scenario: Slug was changed after publication
- **WHEN** an entry was published with slug `old` and its draft now has slug `new`
- **THEN** a slug lookup for `new` returns it and a lookup for `old` does not
