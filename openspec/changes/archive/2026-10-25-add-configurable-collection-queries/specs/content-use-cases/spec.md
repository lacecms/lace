## MODIFIED Requirements

### Requirement: Entry-list queries and editor names are authorized reads
The content-entry list use case SHALL require `content:read` before reading
state, SHALL resolve the model from the active configuration, and SHALL pass
the model's configured `listFields` (none for a page), the search term, the
status filter, canonical typed field filters, resolved configured query targets and the sort, defaulting to `-updatedAt`, to the read port. It
SHALL reject an unknown model, an unsupported status or sort, and a trimmed
search term exceeding the trusted runtime q budget with the stable invalid-state domain
error before querying. It SHALL also reject unsupported field operations, invalid filter operands and exceeded query limits before invoking the read port; transport mapping SHALL retain precise validation issue pointers. The composition root SHALL supply listQueryLimits (Node 200/null, Cloudflare 48/50), enforced on trimmed q and literal contains operands according to collection-query-options, including escaped-pattern UTF-8 size. Text eq SHALL retain 200 code units without a LIKE budget. Client parameters/config SHALL NOT override runtime policy, and excess input SHALL NOT be truncated. Resolved query identity SHALL bind sqlite-like-v1 and the effective policy. The same policy SHALL be exposed by admin runtime metadata without entering model hashes. It SHALL return a detached page including per-status
totals. A separate editor-description use case SHALL require `content:read`
and SHALL return an actor's `id` and display name through the read port. It
SHALL apply the same `System` and `Unknown user` fallbacks as list summaries.

#### Scenario: A viewer lists entries with a filter
- **WHEN** a viewer lists a collection with `status` `published` and a search
  term
- **THEN** the read port receives the model's list fields, the trimmed term,
  the status, and the default sort, and the viewer receives a detached page
  with totals

#### Scenario: Every role reads the same list data
- **WHEN** a viewer, an editor, and an administrator issue the same list query
  and describe the same editor
- **THEN** each receives identical items, totals, and display name, because
  each role holds `content:read`

#### Scenario: An invalid list query fails before a read
- **WHEN** a caller requests an unknown model, an unsupported sort, or an
  over-long search term
- **THEN** the use case fails with the invalid-state domain error and the read
  port is not queried

#### Scenario: Configuration is authoritative for every role
- **WHEN** a viewer or administrator requests a configured field filter and sort
- **THEN** the use case resolves the same effective query from active configuration and passes only validated portable query data to the read port

#### Scenario: Disabled operations fail before persistence
- **WHEN** an enabled filter field is removed from configuration and a client reuses its query
- **THEN** the use case rejects the stale query before reading entries



#### Scenario: Platform limits are enforced before reads
- **WHEN** a Cloudflare actor submits q or contains whose escaped substring pattern exceeds 50 UTF-8 bytes
- **THEN** the use case rejects it at /q or /filters/<index>/value without a read-port call, and Node accepts an otherwise valid operand within 200 code units
