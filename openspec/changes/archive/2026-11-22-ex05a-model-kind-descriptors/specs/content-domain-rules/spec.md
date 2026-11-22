## ADDED Requirements

### Requirement: Portable model kind descriptors

`@lacecms/content` SHALL expose a read-only descriptor for every `ContentModelKind` and resolve its policy for a configured model. The domain package SHALL expose that same policy to backend consumers. Each descriptor SHALL specify cardinality, routing policy, public read family, build-export section and admin entry behavior. Typed lookup SHALL accept only supported kinds. Adding a kind without any one of those choices SHALL fail typechecking. Runtime boundaries receiving unknown values SHALL reject unregistered kinds through their existing validation failures before applying any kind policy.

The resolved policy SHALL match the following matrix on Node, Cloudflare and in the admin. Public families describe published reads. Permission, publication and revision checks still apply to entry actions.

| Configured model | Cardinality | Public path | Public read family | Export section | Admin behavior |
| --- | --- | --- | --- | --- | --- |
| Page | Singleton | Fixed path | Pages by key and lookup by path | `entries` | Open the singleton editor, editable title, no slug |
| Collection with route | Many | Route with entry slug | Collection list, item by slug and lookup by path | `entries` | Open the list, editable title and slug |
| Collection without route | Many | None | Records by model key | `records` | Open the list, editable title, no slug |
| Global | Singleton | None | Globals by model key | `globals` | Open the singleton editor, system-owned title, no slug |

#### Scenario: An incomplete kind cannot acquire behavior implicitly

- **WHEN** a typed consumer requests the descriptor for `article`, or a declaration extends the supported kind set with a kind whose descriptor omits its export section
- **THEN** TypeScript rejects the lookup or incomplete declaration respectively

#### Scenario: An unknown runtime kind has no singleton privileges

- **WHEN** entry payload validation receives `article` as the model kind
- **THEN** it reports `invalid_model_kind` at `kind` before applying cardinality or route rules

#### Scenario: Synchronization provisions only configuration-owned entries

- **WHEN** a configuration containing all four model shapes in the matrix is synchronized twice
- **THEN** the page and global each have one singleton entry, and both collections still have zero entries until an entry is explicitly created

#### Scenario: Collection routing selects the read family and export section

- **WHEN** published entries belong to `posts` with route `/posts/:slug` and `credits` without a route
- **THEN** the collection list serves posts, the records list serves credits, and requests to the opposite family return `404 NOT_FOUND`
- **AND** the export places each post in `entries` and each credit in `records` exactly once, and only posts can be looked up by public path

#### Scenario: Cardinality and route availability are independent in the admin

- **WHEN** a writer opens a page, a global and a route-less collection
- **THEN** the first two open a singleton editor without duplicate or delete actions, and the collection opens its list and supports creating an entry without a slug
- **AND** a viewer opening the same collection has no create action
