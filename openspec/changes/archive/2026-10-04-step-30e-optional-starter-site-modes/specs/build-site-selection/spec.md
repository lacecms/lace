## MODIFIED Requirements

### Requirement: Deployment selects one accessible Astro project
The Node/VPS deployment SHALL select one installation root mounted read-only at `/source`, one Astro project directory relative to that root, the root's `pnpm-lock.yaml`, and one static output directory relative to the selected project. The project directory SHALL permit `.` for standalone projects; the output SHALL be a nonempty descendant directory. Workspace roots SHALL include `pnpm-workspace.yaml`; standalone roots SHALL NOT require it. The generated default SHALL follow the project's site mode: starter mode SHALL explicitly select root `.`, project `site`, and output `dist`; existing-site mode SHALL explicitly select the recorded site path as root, project `.`, and output `dist`; no-site mode SHALL configure no builder. Reference deployment SHALL explicitly select `apps/site` and `dist`. Selection SHALL use deployment configuration only and SHALL NOT infer the intended site from other projects present in the mount. Host mount paths SHALL be resolved by Compose and SHALL NOT be interpreted as container paths. Served releases SHALL remain in the fixed `/output` volume.

#### Scenario: Generated source is selected explicitly
- **WHEN** a starter project uses its default selection
- **THEN** its root lockfile is installed and its `site` Astro project supplies the static release

#### Scenario: Existing standalone site with a CMS subdirectory
- **WHEN** a project generated with `--existing-site ..` uses its default selection
- **THEN** the parent standalone root lockfile and root Astro project are used without requiring a workspace file, and no example site exists in the CMS directory

#### Scenario: Existing workspace site
- **WHEN** the operator mounts a pnpm workspace root and selects a declared Astro package within it
- **THEN** frozen installation uses that root lockfile and workspace dependencies and the selected package alone is the Astro build target

#### Scenario: Host source is unavailable inside the builder
- **WHEN** the configured bind source is missing, inaccessible or does not expose the selected package and root lockfile
- **THEN** deployment or build fails safely without creating an empty replacement source directory, choosing the example, or replacing the current release

#### Scenario: Headless project
- **WHEN** a project generated with `--no-site` publishes content
- **THEN** no builder runs, the build fails with the trigger-unavailable reason, and the current site identity is unconfigured
