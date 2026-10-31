## ADDED Requirements

### Requirement: Administrator manages import tokens in Settings
For an actor with `settings:manage`, the Settings screen SHALL show an Import
tokens card, separate from build tokens, that explains that an import token
lets `lace import` write drafts and media as its creator. It SHALL list
import-token metadata without plaintext: name, token prefix, creator, created
time, expiry, last-used time or "Never", whether it may publish, and an Active,
Expired or Revoked badge, with times shown relative to now and the absolute
local time on hover. A Create import token dialog SHALL collect a name, an
expiry of 1, 3 or 7 days (default 1 day) and an "Allow publishing" checkbox,
unchecked by default and offered only when the session has `content:publish`.
After the API confirms creation, the dialog SHALL show the plaintext once with
the same Copy, Done, no-outside-dismissal and transient-state rules as build
tokens, and SHALL state the expiry. Each active token SHALL offer Revoke with a
confirmation naming the token. Failed operations SHALL keep their dialog open
with the error and leave confirmed metadata unchanged. The card SHALL be usable
by keyboard alone and at 320 CSS pixels wide.

#### Scenario: Administrator issues an import token
- **WHEN** an administrator creates `Framer import` for 3 days with publishing allowed
- **THEN** the dialog shows the plaintext once with Copy and Done and its expiry date, and the list shows the token as Active with publishing

#### Scenario: Token expires
- **WHEN** an import token's expiry has passed
- **THEN** its row shows Expired and offers no Revoke action

#### Scenario: Viewer opens Settings
- **WHEN** a viewer opens `/settings`
- **THEN** no import-token request is made and the card is not shown
