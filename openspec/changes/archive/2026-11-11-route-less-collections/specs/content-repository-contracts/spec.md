## ADDED Requirements

### Requirement: Repository contract fixtures cover route-less collections
The shared repository contract fixtures SHALL include a route-less collection
and SHALL run the same scenarios against the Node and Cloudflare repositories:
publishing, unpublishing and deleting route-less entries without a published
route, the published-state version and build request of each publication, the
public records read and its order, the build export records phase across page
boundaries and the byte budget, record media scoping, `non-routable` link
target state and link-picker exclusion, and synchronization refusing to add or
remove a route of a published collection.

#### Scenario: Both runtimes export the same records
- **WHEN** the shared fixtures publish routed entries and route-less entries
  and read the build export with a small page limit on Node and on Cloudflare
- **THEN** both runtimes return identical pages, cursors and assembled exports
