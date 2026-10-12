## ADDED Requirements

### Requirement: Nested media participate in the complete content lifecycle
Create, save and publish SHALL validate normalized nested media as active media,
count every location toward the existing 200-reference cap (including SEO and
hidden blocks), and rebuild references from declared fields without guessing
from strings. A root scalar path SHALL keep its existing field key; nested paths
SHALL use RFC 6901 JSON Pointers relative to `$fields` or the block source key,
such as `/images/0/image`. Groups SHALL use field keys and lists zero-based
indices. Saves SHALL replace reference paths atomically with JSON and revision,
including after reorder/removal. Load, publish, revert and duplicate SHALL
preserve nested data and the corresponding locations, remapping duplicated block
source keys as today. Authorization, expected revisions, idempotency and media
deletion-race protections SHALL remain unchanged.

#### Scenario: References have unambiguous paths
- **WHEN** model `cover`, group `contact.photo`, block `images[0].image` and a media-list item are stored
- **THEN** their field paths are respectively `cover`, `/contact/photo`, `/images/0/image` and the list's pointer ending `/0`, with the existing source keys

#### Scenario: Reorder and remove
- **WHEN** a draft list referencing media A and B is reordered and A is removed
- **THEN** B's location uses its new index, A has no stale draft location, and any published location of A still protects it

#### Scenario: Inactive nested media
- **WHEN** a writer saves a nested media value whose metadata is missing or deleting
- **THEN** the command fails and draft JSON, references and revision stay unchanged

#### Scenario: Reference maximum counts occurrences
- **WHEN** a snapshot repeats one media ID at 201 nested locations
- **THEN** the command rejects it before writing, despite having one distinct media ID

#### Scenario: Existing authorization applies
- **WHEN** a viewer saves composite data, or an editor without publish permission publishes it
- **THEN** authorization is denied before content reads or writes

#### Scenario: Stale nested save
- **WHEN** two writers save different list orders using the same expected revision
- **THEN** only one commits and the other receives the existing revision conflict without partial reference changes
