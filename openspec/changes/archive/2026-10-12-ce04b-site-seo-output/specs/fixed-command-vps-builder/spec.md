## ADDED Requirements

### Requirement: Builder passes the site URL and indexing switch to the site build
The builder SHALL accept two optional deployment settings: `LACE_BUILD_SITE_URL`, an absolute `http` or `https` site URL without credentials, query or fragment, and `LACE_SITE_INDEXING`, `on` or `off`. Empty values SHALL count as absent. An invalid value SHALL stop the builder at startup with an error naming the setting and not its value. Configured values SHALL be passed unchanged to the fixed install and build environment under the same names; absent values SHALL be omitted. Build requests SHALL NOT select or override either value.

#### Scenario: Settings reach the site build
- **WHEN** the builder runs with `LACE_BUILD_SITE_URL=https://example.com/` and `LACE_SITE_INDEXING=off`
- **THEN** the Astro build environment contains both values and the release is built with them

#### Scenario: Settings are absent
- **WHEN** the builder runs without either setting, or with empty values
- **THEN** the build environment contains neither variable and the build proceeds as before

#### Scenario: Invalid setting
- **WHEN** the builder starts with `LACE_SITE_INDEXING=maybe` or `LACE_BUILD_SITE_URL=ftp://example.com/`
- **THEN** startup fails naming the invalid setting without printing its value
