## ADDED Requirements

### Requirement: Writers can detach draft-only usage before deleting media
A deletion request SHALL accept an explicit option to detach draft usage
first. With the option the system SHALL, in this order:

1. require both `media:write` and `content:write` before any read or write;
2. refuse an item that is not `active` with `CONTENT_INVALID_STATE`;
3. refuse with `MEDIA_IN_USE`, changing no draft, when any current published
   snapshot references the item or when the item's `usageCount` exceeds the 50
   entries a usage read returns;
4. remove the item from the current draft of every using entry and save each
   such draft as an ordinary guarded draft save by the requesting actor at the
   revision it was read with;
5. request deletion through the unchanged guarded deletion path, which still
   refuses with `MEDIA_IN_USE` when any reference remains.

Removing the item from a draft SHALL clear a media field whose value is the
item, remove an element whose value is the item from a list of media, and
clear an SEO image that is the item. It SHALL apply at every nesting depth of
groups and lists, in entry fields and in the data of visible and hidden blocks
alike, and SHALL leave every other value, block, block envelope and the
title and slug unchanged. A draft may afterwards miss a required value or fall
below a list minimum; draft validation accepts that and publication reports
it. A published snapshot SHALL never be rewritten, so detaching requests no
build and never changes public delivery. Without the option, deletion SHALL
behave exactly as before.

Each draft save SHALL be atomic on its own; the request as a whole SHALL NOT
be. When a draft save fails with `CONTENT_REVISION_CONFLICT` or any other
error, the request SHALL fail with that error, drafts already saved SHALL stay
detached, later drafts SHALL stay unchanged, and the item SHALL stay `active`
and may be detached again.

The behavior SHALL be identical on the Node and Cloudflare runtimes.

#### Scenario: Draft-only usage is detached and the item is queued
- **WHEN** an editor requests deletion with the detach option of an image that
  two entries use only in their drafts, one in a `cover` field and one in an
  `image` block and in a gallery list
- **THEN** the `cover` field is cleared, the block's `image` value is cleared,
  the gallery element is removed, each draft's revision advances by one with
  the editor as its last editor, the image's `usageCount` is 0, and the item is
  `deleting` with one deletion event queued

#### Scenario: Published usage refuses detaching without changing drafts
- **WHEN** a writer requests deletion with the detach option of an image that a
  current published snapshot uses
- **THEN** the request fails with `MEDIA_IN_USE`, no draft revision changes,
  and the item stays `active`

#### Scenario: A published-only usage is released by publishing
- **WHEN** an entry's published snapshot uses an image in a block, the writer
  removes that block from the draft and saves it, and later publishes the
  entry
- **THEN** after the save the image reports that entry with the block location
  marked published only and deletion is refused as in use, and after the
  publication its `usageCount` is 0 and an ordinary deletion request is
  accepted

#### Scenario: Detaching requires content write permission
- **WHEN** an actor with `media:write` but without `content:write` requests
  deletion with the detach option
- **THEN** the request fails with the stable authorization error before any
  read or write

#### Scenario: Too many using entries are refused
- **WHEN** 51 entries use an image only in their drafts and a writer requests
  deletion with the detach option
- **THEN** the request fails with `MEDIA_IN_USE` and no draft changes

#### Scenario: A concurrent draft edit stops detaching
- **WHEN** a using entry's draft is saved by someone else after the detach
  request read it and before the request saves it
- **THEN** the request fails with `CONTENT_REVISION_CONFLICT`, the concurrent
  draft is kept, and the item stays `active`

#### Scenario: A new reference committed during detaching blocks deletion
- **WHEN** another draft starts using the item after detaching saved the last
  known using draft and before deletion is requested
- **THEN** the request fails with `MEDIA_IN_USE` and the item stays `active`
