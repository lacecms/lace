## ADDED Requirements

### Requirement: Only an authentication failure starts session recovery
The admin application SHALL treat a protected API response as an expired
session only when its status is `401`. It SHALL then run the existing
recovery: clear authenticated remote state and redirect to login. A `403`
response SHALL be shown as that request's access-denied or error state. It
SHALL NOT re-read the session, clear remote state or leave the current screen.

#### Scenario: Session expired during a save
- **WHEN** a draft save returns `401` `AUTHENTICATION_REQUIRED`
- **THEN** the application clears authenticated remote state and redirects to
  login, keeping the dirty-editor leave confirmation

#### Scenario: Permission denied during an action
- **WHEN** a signed-in editor's request returns `403` `AUTHORIZATION_DENIED`
- **THEN** the editor stays on the current screen, sees the request's error
  state, and no session re-read or redirect happens
