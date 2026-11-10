## MODIFIED Requirements

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
