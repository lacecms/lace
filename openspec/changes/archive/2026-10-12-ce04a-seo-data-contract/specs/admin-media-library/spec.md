## ADDED Requirements

### Requirement: Media usage names SEO image locations
The media details panel SHALL describe an SEO image usage as
"SEO image · <states>", where states is "Draft", "Published" or "Draft and
published". It SHALL never show block keys.

#### Scenario: Show an SEO image usage
- **WHEN** a media item is the published SEO image of the entry "Hello"
- **THEN** the usage list shows "Hello" with "SEO image · Published"
