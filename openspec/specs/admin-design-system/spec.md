# admin-design-system Specification

## Purpose

Defines the admin design-token contract, the rule that admin UI is styled only
through those tokens, and the lint gate that keeps raw color values and arbitrary token-replacing
values out of admin components, so every screen shares one visual system in both
the light and dark themes. It also defines how the remembered theme preference
is resolved and applied.

## Requirements

### Requirement: Admin design tokens are defined in one theme contract
The admin application SHALL define its color, typography, spacing, radius,
shadow, focus, and motion values as CSS custom properties in a single theme
source. Color tokens SHALL use semantic surface/foreground pairs in the shadcn
naming convention, including at least `background`, `foreground`, `card`,
`popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`,
`input`, `ring`, the `sidebar` family, and Lace status pairs for success and
warning. Every foreground token SHALL meet WCAG 2.2 AA text contrast (4.5:1)
against its paired surface token in each shipped theme.

#### Scenario: A component needs a surface color
- **WHEN** an admin component renders a surface, text, border, or focus color
- **THEN** the value resolves from a named theme token rather than a value
  embedded in the component

#### Scenario: Paired tokens are checked for contrast
- **WHEN** each shipped foreground token is compared with its paired surface
  token
- **THEN** the contrast ratio is at least 4.5:1

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

### Requirement: Admin typography uses self-hosted Inter at a 13px base
The admin application SHALL serve the Inter variable font from its own origin
without requesting a third-party font host, SHALL fall back to the system
sans-serif stack when the font is unavailable, and SHALL render body text at a
13px base size.

#### Scenario: The admin loads offline from a third-party font host
- **WHEN** the admin loads in a browser that cannot reach any external host
- **THEN** body text renders in Inter from the admin origin at 13px, or in the
  system sans-serif fallback if the font fails to load

### Requirement: Admin components are styled through utilities over tokens
Admin components SHALL be styled with utility classes that resolve to theme
tokens. The admin stylesheet SHALL contain only the theme source, font import,
utility framework setup, and element-level base rules (focus indication,
reduced motion, document defaults); it SHALL not contain component-specific
class rules. Utility color classes outside the token set SHALL not produce
styles.

#### Scenario: A default palette color class is used
- **WHEN** an admin component uses a utility color from the framework's
  default palette instead of a token
- **THEN** no color style is generated for that class and the lint gate
  reports it

### Requirement: Lint rejects raw color literals in admin components
`pnpm lint` SHALL fail when admin application source outside the theme source
contains a raw color literal: a hexadecimal color, a CSS color function, a CSS
named color used as a color value, an arbitrary utility value containing a
color literal, or a utility class naming a default palette color. The failure
SHALL name the file, line, and offending literal. Test files SHALL be exempt.
The theme source SHALL be the only admin file permitted to contain color
literals.

#### Scenario: A component embeds a hex color
- **WHEN** an admin component contains `className="bg-[#ff0000]"` or a style
  value `#ff0000`
- **THEN** `pnpm lint` fails and reports the file, line, and literal

#### Scenario: A component uses a default palette utility
- **WHEN** an admin component contains the class `text-red-600`
- **THEN** `pnpm lint` fails and reports the class

#### Scenario: Components use only token utilities
- **WHEN** admin components use only token-backed utilities and the theme
  source defines the color values
- **THEN** the color-literal check passes

#### Scenario: A non-color hash string is present
- **WHEN** admin source contains a string such as `"#root"` that is not a
  hexadecimal color
- **THEN** the color-literal check does not report it

### Requirement: Admin UI primitives are generated Lace-owned source
The admin application SHALL provide its generic UI primitives as source
generated from shadcn/ui on Radix primitives and committed to the admin shared
UI layer, one primitive per component folder. The primitives SHALL resolve every
color from theme tokens, SHALL not depend on a themed component library or an
animation plugin at runtime, and SHALL keep their accessible roles, names, and
keyboard behavior when adapted to Lace conventions. Buttons SHALL default to a
non-submitting type unless a caller requests submission.

#### Scenario: A generated primitive is inspected for color values
- **WHEN** the color-literal check scans the generated primitives
- **THEN** it reports no raw color literal, because overlay, destructive, and
  surface colors resolve from theme tokens

#### Scenario: A primitive button is placed inside a form
- **WHEN** a primitive button without an explicit type is activated inside a
  form
- **THEN** the form is not submitted

#### Scenario: A dialog primitive is opened from the keyboard
- **WHEN** a keyboard user opens a dialog built from the primitives and presses
  Escape
- **THEN** the dialog exposes its title as its accessible name, traps focus
  while open, closes on Escape, and returns focus to its trigger

### Requirement: Lint rejects arbitrary values that bypass design tokens
`pnpm lint` SHALL fail when admin application source outside the theme source
uses an arbitrary utility value in place of a typography, radius, shadow,
focus-width, or motion token: an arbitrary font size, border radius, box
shadow, ring or outline width, or transition duration, delay, or easing. An
arbitrary value that references a CSS custom property, or a radius of
`inherit`, SHALL be allowed. The failure SHALL name the file, line, and
offending class. Test files SHALL be exempt. Layout values such as widths,
grid tracks, and positions are outside this rule. The radius scale SHALL
include an extra-small step derived from the base radius so small decorations
need no arbitrary radius.

#### Scenario: A component sets an arbitrary font size
- **WHEN** an admin component contains the class `text-[0.8rem]`
- **THEN** `pnpm lint` fails and reports the file, line, and class

#### Scenario: A component sets an arbitrary radius or shadow
- **WHEN** an admin component contains `rounded-[2px]` or
  `shadow-[0_1px_2px]`
- **THEN** `pnpm lint` fails and reports each class

#### Scenario: A component uses token-backed or layout arbitrary values
- **WHEN** an admin component uses `text-sm`, `rounded-xs`,
  `rounded-[inherit]`, `min-w-[8rem]`, or `grid-cols-[auto_1fr]`
- **THEN** the token-bypass check does not report them
