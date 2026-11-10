# admin-source-structure Specification

## Purpose

Defines how admin application source is organized into ordered layers with
closed public APIs, and the lint gate that keeps screens, sections, actions,
domain presentation, and shared primitives from depending on each other in the
wrong direction as the admin is rebuilt.

## Requirements

### Requirement: Admin source is organized into ordered layers
Every admin application source module SHALL belong to exactly one of the layers
`app`, `pages`, `widgets`, `features`, `entities`, and `shared`, ordered from
highest to lowest in that sequence. The only exceptions SHALL be the
application entry module at the source root and test-environment setup. The
`pages`, `widgets`, `features`, and `entities` layers SHALL be divided into
named slices; `app` and `shared` SHALL not be divided into slices.

#### Scenario: A module is added outside the layers
- **WHEN** an admin source module is placed outside every layer and is neither
  the application entry module nor test-environment setup
- **THEN** `pnpm lint` fails and names the module

#### Scenario: Existing admin behavior after the move
- **WHEN** the admin source has been organized into the layers
- **THEN** every existing admin route, accessible name, API request, and
  workflow behaves as before and its automated tests pass

### Requirement: Admin imports follow the layer direction
A module SHALL import only from layers lower than its own, or from its own
slice. Modules in different slices of the same layer SHALL not import each
other. Modules in `shared` MAY import other `shared` public units. The entry
module MAY import any layer's public API. Test files MAY import any layer's
public API, including higher layers, so a test can mount the real application
router.

#### Scenario: An upward import is added
- **WHEN** a module in `entities` imports a module from `features`
- **THEN** `pnpm lint` fails and reports the importing file, both layers, and
  the import

#### Scenario: A cross-slice import is added
- **WHEN** a module in one `pages` slice imports a module from another `pages`
  slice
- **THEN** `pnpm lint` fails and reports a cross-slice import

#### Scenario: A downward import through a public API
- **WHEN** a `pages` module imports a `widgets` slice through that slice's
  public index
- **THEN** the boundary check passes

#### Scenario: A page test mounts the application router
- **WHEN** a test file in a `pages` slice imports the `app` layer's public test
  harness
- **THEN** the boundary check passes, while the same import from a non-test
  module fails

### Requirement: Slices and component folders expose only their index
Every slice SHALL expose its public API through an `index.ts` at the slice root, and every `shared` or `app` unit SHALL expose its public API through an `index.ts` at the unit root. A React component module SHALL be `<Name>/<Name>.tsx` inside a PascalCase folder containing `index.ts` and `<Name>.test.tsx`, except that a PascalCase `<Name>.tsx` leaf module MAY be a sibling file within its owning slice or unit. A sibling leaf SHALL NOT be exported, directly or transitively, from its slice or unit public index and SHALL be imported only within that slice or unit; it SHALL have a colocated `<Name>.test.tsx`. A module outside a slice, unit, or component folder SHALL import it only through its `index.ts`. Existing layer direction and cross-slice restrictions remain in force.

#### Scenario: A slice internal file is imported
- **WHEN** a `pages` module imports a file inside a `widgets` slice other than the slice `index.ts`
- **THEN** `pnpm lint` fails and names the public index to import instead

#### Scenario: A component folder is incomplete
- **WHEN** a component folder lacks its `index.ts` or its `<Name>.test.tsx`
- **THEN** `pnpm lint` fails and names the folder and the missing file

#### Scenario: A component module is misplaced
- **WHEN** a React component module neither matches its PascalCase folder nor qualifies as a private PascalCase sibling leaf
- **THEN** `pnpm lint` fails and names the module

#### Scenario: A slice has no public index
- **WHEN** a slice directory has no `index.ts`
- **THEN** `pnpm lint` fails and names the slice

#### Scenario: A private sibling leaf is used inside its owner
- **WHEN** a PascalCase sibling component with a colocated test is used within its owning slice or unit and is not exported from its public index
- **THEN** the boundary check accepts it without requiring a component folder or index

#### Scenario: A sibling leaf is exposed or imported from outside
- **WHEN** a sibling leaf is exported directly or through intermediate re-exports from its owner public index, or imported from outside its owner
- **THEN** the boundary check fails and identifies the leaf and violating path

#### Scenario: A sibling leaf has no companion test
- **WHEN** a sibling component has no same-name colocated test
- **THEN** the boundary check fails and names the missing test

### Requirement: Admin browser tests live outside application source
Admin Playwright browser tests SHALL live in a dedicated end-to-end directory of
the admin application rather than in application source, and the default and
acceptance browser suites SHALL run from that directory.

#### Scenario: The editor browser suite is run
- **WHEN** a contributor runs the admin end-to-end command
- **THEN** the editor browser tests run from the end-to-end directory and no
  browser test file remains under application source
