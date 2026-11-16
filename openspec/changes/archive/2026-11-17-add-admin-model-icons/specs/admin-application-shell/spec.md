## ADDED Requirements

### Requirement: Sidebar model items show the configured icon
In both the desktop sidebar and narrow-screen navigation sheet, a model item
SHALL display its configured icon as the corresponding Lucide glyph or
emoji text. A model with an omitted icon or an unrecognized icon value from
the metadata API SHALL display the existing fallback for its kind. The
fallbacks are FileText for pages, Layers for collections, and Globe for
globals. Each icon SHALL be decorative and hidden from assistive technology,
with the visible model label, accessible link name, and current-page and
entry-count behavior supplied by the existing navigation item.

#### Scenario: Global models are visually distinct
- **WHEN** Navigation configures `"menu"` and Site settings configures
  `"⚙️"`
- **THEN** each navigation surface shows a menu glyph beside Navigation and
  a gear emoji beside Site settings, with accessible names derived from the
  existing labels

#### Scenario: A missing or unrecognized value uses the kind fallback
- **WHEN** metadata omits `icon` or supplies a name absent from the admin's
  supported catalog
- **THEN** the item shows its kind fallback and the link stays usable
