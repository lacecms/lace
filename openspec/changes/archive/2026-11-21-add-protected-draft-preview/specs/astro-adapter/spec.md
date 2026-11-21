## MODIFIED Requirements

### Requirement: The adapter ships Astro-bound code only
The adapter SHALL be published as Astro component source plus a compiled server module, SHALL declare `astro` as a peer dependency within the supported range, and SHALL depend only on the render core and SDK among Lace packages. It SHALL NOT ship visual block components or re-exports of render, SDK, or content APIs. It SHALL additionally ship an opt-in server-only preview integration that is inert for ordinary builds and preserves site ownership of route files and components. The only client script supplied by the adapter SHALL be the local video activation and ambient playback script used by the shared video component. It SHALL be part of the alpha release set at the shared release version.

#### Scenario: Packed adapter
- **WHEN** the adapter is packed for release
- **THEN** the tarball contains the server module, its declarations, and the block-list, rich-text, SEO head, image and video components, and no block component such as a hero or image block renderer

#### Scenario: Canonical import paths
- **WHEN** a site needs `defineBlockMap` or `BlockProps`
- **THEN** it imports them from the render core because the adapter does not re-export them

#### Scenario: Preview integration is opt-in
- **WHEN** a site imports the preview integration without an authorized preview build input
- **THEN** normal static rendering and published-only loading remain unchanged
