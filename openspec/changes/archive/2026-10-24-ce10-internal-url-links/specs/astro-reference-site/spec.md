## ADDED Requirements

### Requirement: Maintained sites exercise stable links and the standalone Link block
The reference and generated starter SHALL register/install version 1 `link`
and allow it on their routable starter models, advancing model/template versions
where existing ownership rules require it. Site-owned layouts and components
SHALL resolve ordinary URL fields through the shared helper, including global
navigation and model-level nested URL examples. Fixtures SHALL exercise manual
URLs, internal links, both Link appearances, slug change, hidden references,
confirmed target removal and recovery. Builds SHALL use one complete export
traversal and no per-link requests. Existing videoEmbed, image optimization,
lightbox, envelope, source ownership and CSS hook behavior SHALL be retained.

#### Scenario: Packed generated starter
- **WHEN** a packed fresh starter is synchronized, populated and built from a format 2 export
- **THEN** image, gallery, navigation, Hero/CTA and both Link appearances use resolved paths, and no href contains `entry:`

#### Scenario: Target disappears and returns
- **WHEN** a fixture removes then restores a target under the same ID and a new path
- **THEN** its builds first preserve non-navigating content and diagnostics, then restore links, without changing source tokens
