# ADR 0003: Project media references and delete objects asynchronously

- Status: Accepted
- Date: 2026-09-07
- Governing architecture: [sections 4.6](../architecture/README.md#46-media-never-lives-in-sql), [9.7](../architecture/data-model.md#97-media), and [9.8](../architecture/data-model.md#98-outbox-and-site-builds)

## Context

Media IDs live in validated JSON, but SQL must quickly determine whether a media
record remains referenced. SQL and object storage cannot share one transaction.

## Decision

Binary objects remain in R2 or MinIO; SQL stores metadata and object keys. Lace
projects every validated `mediaId` into `content_media_references`, keyed by
snapshot, source key, and field path. Draft saves rebuild this projection in the
same atomic mutation, and publication copies it with the new snapshot.

Deletion refuses referenced media. For an unreferenced active item, it atomically
sets `deleting` and writes a `media.delete.requested` outbox event. The dispatcher
deletes the object then metadata; failures become `delete_failed`, retain an
error, and are retryable.

## Consequences

- Content cannot acquire dangling media references through a deletion race.
- Object-store failures retain an operational retry handle rather than becoming
  unrecoverable SQL/object-storage half-deletes.

## Alternatives considered

- Searching JSON before deletion was rejected as unbounded and unsafe under
  concurrent writes.
- Deleting the object first was rejected because metadata can point to missing
  content after a failure.
- Deleting metadata first was rejected because it can orphan the object without
  a retry handle.
