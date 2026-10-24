## ADDED Requirements

### Requirement: Block props provide a framework-neutral link resolver
Renderable entries SHALL optionally supply a structurally typed link resolver;
prepared block props SHALL expose `link(value)` with the shared resolved,
unavailable and empty result contract. Render SHALL depend on content safety
primitives, not SDK or REST DTO imports. The Astro adapter SHALL forward that
resolver for entries and globals. When no resolver is supplied, manual safe
URLs SHALL continue to work and a canonical internal token SHALL throw a
contextual `missing_link_resolver` render error. Missing targets reported by a
supplied resolver SHALL NOT throw. Malformed/unsafe input or an unsafe returned
href SHALL fail with a contextual `invalid_link` error. Parsing SHALL validate
stored block data/settings before resolution; required authored URL values SHALL
not be removed to implement unavailable-target display.

#### Scenario: Custom framework source
- **WHEN** a custom block calls the supplied resolver for a URL field
- **THEN** it receives a safe href or explicit unavailable state without importing the SDK or duplicating route logic

#### Scenario: Old caller has no resolver
- **WHEN** a standalone block is prepared without a site resolver
- **THEN** manual links render normally, but an internal reference fails clearly instead of emitting its token as an href
