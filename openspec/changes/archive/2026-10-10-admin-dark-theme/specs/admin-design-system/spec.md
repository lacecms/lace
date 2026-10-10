## ADDED Requirements

### Requirement: The admin ships light and dark themes under a data-theme selector
The admin application SHALL ship exactly two themes, `light` and `dark`. The
`light` theme SHALL apply when the document root has no `data-theme` attribute
and when it carries `data-theme="light"`; the `dark` theme SHALL apply when it
carries `data-theme="dark"`. Both themes SHALL define the same set of color
token names in the single theme source, SHALL share the non-color tokens
(radius, focus, and motion), SHALL declare the matching CSS
`color-scheme`, and SHALL be scoped only by the `data-theme` selector so that
components adopt either theme without theme-specific component source. The
framework's dark utility variant SHALL match only the `dark` theme selector.
Every foreground token SHALL meet the contrast requirement of the theme
contract against its paired surface in each theme, and a primitive SHALL not
replace a paired surface token with a theme-specific translucent variant that
lowers that contrast.

#### Scenario: No theme attribute is present
- **WHEN** the admin document root has no `data-theme` attribute
- **THEN** every token resolves to its light theme value

#### Scenario: The dark theme is selected
- **WHEN** the admin document root carries `data-theme="dark"`
- **THEN** every token resolves to its dark theme value, the document's
  `color-scheme` is `dark`, and components restyle without source changes

#### Scenario: Dark pairs are checked for contrast
- **WHEN** each dark foreground token is compared with its paired dark surface
  token
- **THEN** the contrast ratio is at least 4.5:1

#### Scenario: A destructive button renders in the dark theme
- **WHEN** a destructive button renders with `data-theme="dark"`
- **THEN** its text and background resolve from the destructive token pair
  without an added transparency that lowers their contrast

### Requirement: The admin theme preference is remembered per browser
The admin application SHALL keep a theme preference with the values `system`,
`light`, and `dark`, defaulting to `system`. `system` SHALL resolve to `dark`
when the browser reports a dark color-scheme preference and to `light`
otherwise, and SHALL follow changes to that browser preference while the admin
is open. The preference SHALL be stored in the browser's local storage on the
admin origin and SHALL survive reloads and new sessions without a server
request. The resolved theme SHALL be applied to the document root before the
admin first renders any screen, including setup and sign-in. A stored value
that is missing or not one of the three values SHALL be treated as `system`;
storage that is unavailable or throws SHALL not prevent the admin from
rendering and SHALL keep the current choice for the open document. A
preference changed in one admin tab SHALL be applied by other open admin tabs
of the same origin. The preference SHALL not contain or be keyed by user
identifiers.

#### Scenario: A first visit follows the operating system
- **WHEN** a browser with no stored preference and a dark color-scheme
  preference opens the admin
- **THEN** the admin renders in the dark theme with the preference `system`

#### Scenario: An explicit choice survives a reload
- **WHEN** a user chooses `light` while the browser prefers dark and reloads
  the admin
- **THEN** the admin renders in the light theme before the first screen
  appears and the preference is still `light`

#### Scenario: The system preference changes while open
- **WHEN** the preference is `system` and the browser color-scheme preference
  changes from light to dark
- **THEN** the admin switches to the dark theme without a reload

#### Scenario: A stored value is invalid
- **WHEN** local storage holds an unrecognized theme value
- **THEN** the admin treats the preference as `system`

#### Scenario: Storage is unavailable
- **WHEN** local storage access throws and the user chooses `dark`
- **THEN** the admin renders, applies the dark theme for the open document, and
  reports no error to the user

#### Scenario: Another tab changes the preference
- **WHEN** two admin tabs are open and the user chooses `dark` in one
- **THEN** the other tab applies the dark theme without a reload

## REMOVED Requirements

### Requirement: The light theme ships under a dark-ready selector structure
**Reason**: The admin now ships a dark theme; the MVP-only rule that no dark
values ship is lifted.
**Migration**: Replaced by "The admin ships light and dark themes under a
data-theme selector", which keeps the light default and the `data-theme`
scoping and adds the `dark` token set.
