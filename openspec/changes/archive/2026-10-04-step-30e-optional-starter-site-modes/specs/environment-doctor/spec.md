## ADDED Requirements

### Requirement: Doctor checks the recorded site
Doctor SHALL report a `site` check derived from `.lace/manifest.json` in the working directory without modifying files. Without a manifest the check SHALL be not applicable; a manifest that cannot be read or validated SHALL fail as configuration. For mode `none` the check SHALL pass and state that no build site is configured. For `starter` and `existing` it SHALL fail as configuration when the site directory is missing or lacks `astro.config.*` or an `astro` dependency in its `package.json`, and SHALL report as unfinished (expected during `setup`, failed during `ready`) when `@lacecms/astro` or `@lacecms/render` is not installed for the site, or when `lace.site.json` or the block map it names is missing, with the next action naming `pnpm install` for the site or `pnpm exec lace add block --all --site <path>`. Doctor SHALL NOT expect `site/` when the recorded mode is not starter.

#### Scenario: Headless project
- **WHEN** doctor runs in a project recorded with mode `none`
- **THEN** the `site` check passes and no `site/` path is probed

#### Scenario: Existing site without blocks
- **WHEN** doctor runs with `--stage setup` in a project recorded as existing site at `..` whose site has no `lace.site.json`
- **THEN** the `site` check is expected and its next action names `pnpm exec lace add block --all --site ..`

#### Scenario: Missing site directory
- **WHEN** the recorded site path does not exist
- **THEN** the `site` check fails as configuration with exit code 4
