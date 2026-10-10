## ADDED Requirements

### Requirement: The user menu offers theme selection
The authenticated shell's user menu SHALL offer a Theme choice with the
options System, Light, and Dark, presented as a single-selection group that
exposes the currently stored preference as checked. The choice SHALL be
operable with the keyboard alone in both the wide-screen sidebar and the
narrow-screen navigation sheet. Selecting an option SHALL store the theme
preference and apply the resolved theme immediately, without a reload and
without changing the current route or unsaved editor state.

#### Scenario: A user switches to the dark theme
- **WHEN** a signed-in user opens the user menu and selects Dark
- **THEN** the admin restyles in the dark theme immediately, the Dark option is
  reported as checked the next time the menu opens, and the current route is
  unchanged

#### Scenario: The menu is operated by keyboard
- **WHEN** a keyboard user opens the user menu, moves to the Light option with
  the arrow keys, and presses Enter
- **THEN** the light theme is applied and stored

#### Scenario: The choice is made in the navigation sheet
- **WHEN** a user on a narrow screen opens the navigation sheet, opens the
  user menu, and selects System
- **THEN** the admin follows the browser color-scheme preference

## MODIFIED Requirements

### Requirement: Every admin route passes automated accessibility checks
The browser test suite SHALL run an automated accessibility audit using the
WCAG 2.0, 2.1, and 2.2 level A and AA rules against every admin route once it
has finished loading: setup, sign-in, the content home, a collection list, the entry
editor for a page and for a collection entry, the media library, Builds,
Users, Settings, the access-denied state, and the not-found route. It SHALL
also audit the main dialogs while they are open: the add-block menu, the media
picker, the publication confirmation, the create-user dialog, and the
build-token dialog including its once-shown token step. Sign-in, every
authenticated route above, and the main dialogs SHALL be audited in both the
light and the dark theme. Any violation SHALL
fail the suite and report the rule and the affected elements. No rule SHALL be
disabled globally; a rule MAY be excluded only for a named third-party element
with a recorded reason.

#### Scenario: A route is audited
- **WHEN** the accessibility suite opens an admin route and its loading state
  has resolved
- **THEN** the audit reports no WCAG A or AA violation for that route

#### Scenario: A route is audited in the dark theme
- **WHEN** the accessibility suite opens an admin route with the stored theme
  preference `dark` and its loading state has resolved
- **THEN** the audit reports no WCAG A or AA violation for that route

#### Scenario: A dialog is audited
- **WHEN** the suite opens one of the main dialogs
- **THEN** the audit of the page with the dialog open reports no WCAG A or AA
  violation

#### Scenario: A violation is introduced
- **WHEN** an admin route renders a control without an accessible name or text
  below the required contrast
- **THEN** the accessibility suite fails and names the rule and the element
