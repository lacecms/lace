## Context

See proposal.md. BlockEditor uses React Hook Form array operations: moves preserve stale positions, insertion and duplication allocate max + 1,024. The domain checks strict ascending positions before repository writes; both SQLite and D1 persist complete aggregates. The API currently replaces domain messages with generic sanitized text and attaches request IDs.

## Goals / Non-Goals

**Goals:** ensure every structural operation serializes the visible order and failures preserve work.
**Non-Goals:** change repositories, permissions, REST schemas, published snapshot isolation, or release artifacts.

## Decisions

1. Add a pure client helper in apps/admin/entities/content to map ordered blocks to `(index + 1) * 1000`. Call it after cleared-value removal at save and recovery JSON boundaries. Do not mutate form state during serialization: failed saves stay dirty, and successful responses establish the canonical baseline. Keeping sparse positions valid after every UI mutation was considered but adds gap exhaustion and undo bookkeeping without benefit for complete-aggregate saves. Importing domain into admin would violate current package direction; the helper uses contract types only.
2. Keep strict ordering checks in packages/domain. Introduce a dedicated BlockOrderError subclass of DomainError, producing one bounded message with zero-based index and key only if the identifier matches the safe ULID format, plus condition and corrective action. Never include data or arbitrary key text. packages/contracts transports only this explicitly safe subclass message unchanged; apps/admin adds recovery advice for CONTENT_INVALID_STATE and continues displaying request correlation through PageError. Other domain errors keep generic transport text; no REST DTO changes are needed.
3. Test helper non-mutation and empty/sparse/reversed lists; domain failures and HTTP atomic rejection; browser operations through saves, reload and publication. Add a real local API/browser regression with SQLite, build-token export and the actual Astro fixture build, independent of Docker/object storage, using existing portable composition and generated configuration. Existing D1 repository contracts remain the parity oracle and run with Node contracts.

## Risks / Trade-offs

- Every save updates positions even for title-only changes → complete aggregates already replace block rows; keys/data remain stable and server normalization already uses 1,000.
- Mocked browser saves can hide rejection → strict mock checks and a real SQLite/API/HTML proof cover the boundary.
- Error text could leak arbitrary identifiers → only bounded ULID keys are echoed; all other keys are omitted.

## Migration Plan

No schema or data migration. Existing valid positions load unchanged and normalize on explicit Save. Rollback affects only admin serialization and diagnostic text; current saved snapshots remain valid. Publication, permissions and revision concurrency checks stay unchanged.
