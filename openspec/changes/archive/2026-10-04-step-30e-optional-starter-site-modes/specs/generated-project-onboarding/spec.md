## ADDED Requirements

### Requirement: Guides describe the project's site mode
The generated README and operations guide SHALL state the project's site mode and path. For existing-site mode they SHALL give the sequence: install the Lace site packages in the site, run `pnpm exec lace add block --all --site <path>` from the CMS directory, create the loader file and routes per `docs/lace-astro-site.md`, and build with the root `dev`/`build` scripts or the Compose builder selecting that site; they SHALL state that the generator did not modify the site. For no-site mode they SHALL state that no site is built, that build requests fail until a site is configured, and how to connect a site later with the existing-site guide and build-site settings. Starter-mode guidance SHALL remain as before.

#### Scenario: Existing-site README
- **WHEN** a project is generated with `--existing-site ..`
- **THEN** its README names the site path `..`, `pnpm exec lace add block --all --site ..`, and `docs/lace-astro-site.md`, and does not instruct editing `site/`

#### Scenario: No-site README
- **WHEN** a project is generated with `--no-site`
- **THEN** its README states that no site is built and links the connection guide for later
