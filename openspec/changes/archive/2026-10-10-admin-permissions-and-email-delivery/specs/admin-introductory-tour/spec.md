## MODIFIED Requirements

### Requirement: Tour content matches navigation and effective role permissions
Tour steps SHALL use the current shell navigation and the resolved session
permissions, never the role name. Pages and Collections SHALL be included only
when their respective navigation groups exist. Content guidance SHALL explain
saved drafts and published content. Guidance for sessions with `content:write`
SHALL describe editing and saving, guidance for sessions with
`content:publish` SHALL describe publication, and guidance for sessions without
`content:write` SHALL describe read-only inspection. Media SHALL describe
browse/preview for every session and upload/reuse in editable fields only for
sessions with `media:write`. Builds SHALL describe history/status for every
session and request/retry only for sessions with `settings:manage`. Users SHALL
appear only for sessions with `users:manage`. Settings, including build-token
creation, once-only plaintext display, and published-export read scope, SHALL
appear only for sessions with `settings:manage`. Guidance SHALL NOT instruct a
user to perform an unavailable action or present inaccessible route links.
Existing API authorization SHALL remain authoritative and the tour SHALL issue
no mutation requests.

#### Scenario: Administrator starts a tour with both model kinds
- **WHEN** an admin starts the tour with Pages and Collections navigation available
- **THEN** it explains those groups, draft/save/publication, Media, Builds with request/retry, Users, and Settings with build-token creation

#### Scenario: Editor starts a tour
- **WHEN** an editor starts the tour
- **THEN** it explains draft editing/saving, media browsing/upload/reuse, and build inspection without publication, build request/retry, Users, Settings, or token-creation instructions

#### Scenario: Viewer starts a tour
- **WHEN** a viewer starts the tour
- **THEN** it describes read-only content, media preview, and build inspection without instructions to save, publish, upload, select media into editable fields, request/retry builds, manage users/settings, or create tokens
