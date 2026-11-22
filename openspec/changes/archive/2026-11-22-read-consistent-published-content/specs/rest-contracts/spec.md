## ADDED Requirements

### Requirement: Each ordinary public content response observes one committed state

On Node and Cloudflare, each anonymous page, collection item by slug, by-path lookup, routed collection list, route-less record list and global read SHALL derive its complete response from one committed state observed during that request. When a republish replaces an existing snapshot and the requested resource remains published at the same address, the read SHALL succeed with the complete earlier or later representation. This guarantee covers resource identity, applicable path and slug, title, fields, publication time, SEO, visible blocks in order, delivered internal links and the public media dictionary. Waiting for the client to retry a missing snapshot, returning a spurious 404, and combining parts of different publications SHALL NOT satisfy the requirement.

For either list family, page membership, order, item contents, media and the presence and value of the continuation cursor SHALL agree with that same state under the existing limit and cursor rules. Each subsequent page request observes its own committed state.

#### Scenario: Republish keeps a route live

- **WHEN** an anonymous request reads a page or collection item while a republish at the same path changes fields, visible blocks, an internal link and referenced media
- **THEN** the first request returns 200 and its entire body equals the old or the new public body, including the publication timestamp and the corresponding media dictionary
- **AND** lookup by path and the corresponding page or collection-slug endpoint provide the same consistency guarantee

#### Scenario: A republished item moves across a page boundary

- **WHEN** a republish advances an item's publication time across a limited page boundary during a routed collection list or route-less record list request
- **THEN** the items, their order, media dictionary and next cursor all match the same pre-commit or post-commit page for that request, including on a continuation read

#### Scenario: A route-less global is republished

- **WHEN** a global remains published at its model key while a republish replaces a field, block and image
- **THEN** the request returns 200 with that global's complete old or new public representation and matching media

#### Scenario: A path actually moves or publication is withdrawn

- **WHEN** a republish moves an entry to a new path or an unpublish removes the requested publication while a client reads the old address
- **THEN** the request may return the complete prior representation or the established 404 according to the state observed, and a later read after the commit returns 404 at the old address if it remains absent

#### Scenario: Only the draft changes

- **WHEN** a writer changes fields, block order or media in a draft without publishing
- **THEN** anonymous reads continue to return the published body and omit draft-only content and media
