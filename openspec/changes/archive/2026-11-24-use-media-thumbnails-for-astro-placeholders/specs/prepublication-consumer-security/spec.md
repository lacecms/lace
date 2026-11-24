## MODIFIED Requirements

### Requirement: Essential authorization and snapshot isolation pass
Acceptance SHALL verify editor and viewer publication denial, anonymous draft/admin denial, and build-token access to the published export without admin/draft permissions. Build credentials also allow eligible published-media thumbnail reads. A later unpublished draft SHALL not change public export or generated output. Setup credentials SHALL cease working after setup and token listings SHALL exclude plaintext build credentials.

#### Scenario: Restricted consumers request protected operations
- **WHEN** editor/viewer sessions attempt publication or anonymous/build-token consumers request drafts or admin resources
- **THEN** authorization fails and published state remains unchanged

#### Scenario: Draft changes after publication
- **WHEN** a later draft changes the title and blocks without publication
- **THEN** published export and rebuilt static output retain the earlier published snapshot
