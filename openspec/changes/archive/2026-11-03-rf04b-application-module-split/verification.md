# RF4B verification

## Baseline

Built with pnpm 12.3.4. The package lists 131 cases across 18 files.

### Declaration exports (name: meaning)

```text
ALLOWED_MEDIA_MIME_TYPES: value
AcceptInvitationResult: type
AccountError: value+type
AccountErrorCode: type
AccountSecurityPort: type
AccountUseCases: value+type
AccountUseCasesInput: type
ActorSummary: type
AdminContentEntryProjection: type
ApplyConfigurationSyncBlockMigrationsInput: type
ApplyConfigurationSynchronizationInput: type
ApplyConfigurationSynchronizationResult: type
BUILD_EXPORT_PAGE_BYTE_BUDGET: value
BlockMigrationEvidence: type
BlockMigrationFinding: type
BlockMigrationFindingKind: type
BuildContentExportPage: type
BuildDispatchOutcome: type
BuildExportCandidate: type
BuildExportCursorError: value+type
BuildExportVersionChangedError: value+type
BuildQueueReceipt: type
BuildTokenMetadata: type
BuildTriggerResult: type
ByteStream: type
CLOUDFLARE_LIST_QUERY_LIMITS: value
CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES: value
CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE: value
CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT: value
CONFIGURATION_SYNC_SCAN_PAGE_SIZE: value
CONTENT_ENTRY_SORTS: value
CONTENT_ENTRY_STATUSES: value
Cache: type
ChangePasswordResult: type
ClaimDispatcherEventsInput: type
Clock: type
CollectionFieldFilter: type
CollectionQueryField: type
CollectionQueryFieldType: type
CollectionQueryValidationError: value+type
CompleteDispatcherLeaseInput: type
CompleteDraftInput: type
CompleteImageContainerInspector: value+type
ConfigurationSyncApplyPort: type
ConfigurationSyncBlockMigration: type
ConfigurationSyncChange: type
ConfigurationSyncCheckResult: type
ConfigurationSyncContentWrite: type
ConfigurationSyncDiagnostic: type
ConfigurationSyncDiagnosticCode: type
ConfigurationSyncEntryMigration: type
ConfigurationSyncEvidence: type
ConfigurationSyncEvolution: type
ConfigurationSyncFieldRename: type
ConfigurationSyncFieldResult: type
ConfigurationSyncLinkRewrite: type
ConfigurationSyncMediaReference: type
ConfigurationSyncMigratedBlock: type
ConfigurationSyncMigrationBlock: type
ConfigurationSyncMigrationCounts: type
ConfigurationSyncMigrationEntry: type
ConfigurationSyncMigrationPage: type
ConfigurationSyncMigrationScanInput: type
ConfigurationSyncMigrationSnapshot: type
ConfigurationSyncMigrationTarget: type
ConfigurationSyncModel: type
ConfigurationSyncOperation: type
ConfigurationSyncPlan: type
ConfigurationSyncPlanInput: type
ConfigurationSyncReport: type
ConfigurationSyncScanRequest: type
ConfigurationSyncSingletonEntry: type
ConfigurationSyncSnapshot: type
ConfigurationSyncSnapshotFindings: type
ConfigurationSyncSnapshotMigration: type
ConfigurationSyncSnapshotPage: type
ConfigurationSyncSnapshotReference: type
ConfigurationSyncSnapshotRewrite: type
ConfigurationSyncSnapshotScanInput: type
ConfigurationSyncStateReadPort: type
ContentCommandResult: type
ContentCommandStatus: type
ContentEntryCommandPort: type
ContentEntryListPage: type
ContentEntryListValues: type
ContentEntryReadPort: type
ContentEntrySort: type
ContentEntryStatus: type
ContentEntryStatusTotals: type
ContentEntrySummary: type
ContentLinkReadPort: type
ContentLinkUseCases: value+type
ContentMediaReadPort: type
ContentModelDiscovery: type
ContentOperation: type
ContentUseCaseDependencies: type
ContentUseCases: value+type
ContentValidationError: value+type
CreateContentEntryInput: type
CreateContentEntryUseCaseInput: type
CreateInvitationResult: type
CreateMediaMetadataInput: type
CreateMediaUseCaseInput: type
CursorPage: type
DEFAULT_CONTENT_ENTRY_SORT: value
DEFAULT_MEDIA_SORT: value
DISPATCHER_LEASE_DURATION_MS: value
DISPLAY_NAME_MAX_LENGTH: value
DeferTask: type
DeleteContentEntryInput: type
DeleteContentEntryUseCaseInput: type
DeleteMediaUseCaseInput: type
DescribeActorUseCaseInput: type
DetachMediaFromDraftUseCaseInput: type
DiscoveredContentModel: type
DispatcherEvent: type
DispatcherEventId: type
DispatcherLease: type
DispatcherLeaseId: type
DispatcherLeasePort: type
DispatcherRetryPolicy: type
DuplicateContentEntryUseCaseInput: type
DuplicateSourceGuard: type
EMAIL_HTML_MAX_LENGTH: value
EMAIL_SENT: value
EMAIL_SUBJECT_MAX_LENGTH: value
EMAIL_TEXT_MAX_LENGTH: value
EmailDeliveryOutcome: type
EmailFailureReason: type
EmailMessage: type
EmailProviderKind: type
EmailSender: type
EmailSenderIdentity: type
EnqueueSiteBuildInput: type
EntryMigrationPlan: type
ExportBuildContentPageInput: type
GetMediaUseCaseInput: type
IMPORT_TOKEN_USE_RECORD_INTERVAL_MS: value
INVITATION_TTL_MS: value
IdGenerator: type
ImageDimensions: type
ImageInspector: type
ImportTokenCapabilities: type
ImportTokenMetadata: type
InvitationIssueResult: type
InvitationRecord: type
InvitationState: type
InvitationView: type
IssuePasswordResetResult: type
IssuedBuildToken: type
IssuedImportToken: type
LinkImpactAcknowledgment: type
LinkImpactAction: type
LinkImpactEvidence: type
LinkImpactPage: type
LinkImpactQuery: type
LinkIssueResult: type
LinkTargetPage: type
LinkTargetQuery: type
LinkTargetStatus: type
LinkUsageLocation: type
LinkUsageSource: type
ListContentEntriesInput: type
ListContentEntriesUseCaseInput: type
ListMediaInput: type
ListMediaTagsInput: type
ListMediaUseCaseInput: type
ListPublicContentInput: type
ListQueryLimits: type
LoadContentEntryInput: type
LoadContentEntryUseCaseInput: type
LoadMediaUsageInput: type
MAX_BUILD_EXPORT_PAGE_SIZE: value
MAX_CONTENT_ENTRY_SEARCH_LENGTH: value
MAX_IMAGE_DIMENSION: value
MAX_IMAGE_PIXELS: value
MAX_IMPORT_TOKEN_LIFETIME_DAYS: value
MAX_MEDIA_BYTES: value
MAX_MEDIA_SEARCH_LENGTH: value
MAX_MEDIA_USAGE_ENTRIES: value
MEDIA_SORTS: value
MIN_IMPORT_TOKEN_LIFETIME_DAYS: value
ManagedUser: type
MarkMediaForDeletionInput: type
MarkMediaForDeletionResult: type
MediaBinary: type
MediaBuildOutcome: type
MediaCatalogItem: type
MediaCatalogPort: type
MediaCommandPort: type
MediaDeletionDispatchPort: type
MediaDeletionDispatcher: value+type
MediaDeletionDispatcherLogger: type
MediaDeletionDispatcherOptions: type
MediaDetailView: type
MediaDraftDetachPort: type
MediaListPort: type
MediaMetadataPatch: type
MediaMimeType: type
MediaReadPort: type
MediaSort: type
MediaTagCount: type
MediaUsageEntry: type
MediaUsageLocation: type
MediaUsageState: type
MediaUseCaseDependencies: type
MediaUseCases: value+type
MediaView: type
MigrationBudgetContext: type
ModelSnapshotEvidence: type
NODE_LIST_QUERY_LIMITS: value
NormalizeDraftCandidateInput: type
NormalizedDraftCandidate: type
NormalizedMediaMetadataPatch: type
OAuthAuthority: type
OAuthConnection: type
OAuthConnectionPort: type
OAuthConnectionUseCases: value+type
OAuthGrant: type
OAuthIssuance: type
OAuthIssuancePersistence: type
OAuthPreparedToken: type
ObjectStorage: type
OpaqueCursor: type
OpaqueTokenHasher: type
OpaqueTokenSecret: type
OpaqueTokenVerifier: type
OperationalError: type
OperationalLogger: type
PASSWORD_RESET_TTL_MS: value
PreparedConfigurationSynchronization: type
ProviderDeploymentObservation: type
ProviderDeploymentReader: type
PublicContentEntry: type
PublicContentReadPort: type
PublicGlobalContent: type
PublicMediaBinaryUseCaseInput: type
PublicationIdempotency: type
PublicationIdempotencyKey: type
PublicationRequestFingerprint: type
PublishContentEntryCommand: type
PublishContentEntryResult: type
PublishContentEntryUseCaseInput: type
PublishContentEntryUseCaseResult: type
PublishedProjection: type
PutObjectInput: type
RateLimitDecision: type
RateLimitExceededError: value+type
ReadUrlOptions: type
ReissueInvitationResult: type
RenderedEmail: type
ResolvedCollectionQuery: type
ResolvedImportToken: type
RetryDispatcherLeaseInput: type
RevertContentDraftCommand: type
RevertContentDraftUseCaseInput: type
RoutableLinkTarget: type
SITE_BUILD_DEBOUNCE_MS: value
SYSTEM_ACTOR_DISPLAY_NAME: value
SaveCompleteDraftInput: type
SaveContentDraftUseCaseInput: type
SecurityRole: type
SecurityService: type
SensitiveRateLimitOperation: type
SensitiveRateLimiter: type
SessionBrowser: type
SessionOs: type
SessionRecord: type
SessionView: type
SiteBuildCommandPort: type
SiteBuildDispatchPort: type
SiteBuildDispatcher: value+type
SiteBuildDispatcherOptions: type
SiteBuildReadPort: type
SiteBuildRecord: type
SiteBuildRequest: type
SiteBuildTracker: value+type
SiteBuildTrackerOptions: type
SiteBuildTrigger: type
SiteBuildUseCases: value+type
SiteBuildWorkLease: type
SnapshotHolders: type
SnapshotStateCounts: type
StoredContentModelState: type
StoredObject: type
StructuralChange: type
StructuralChangeClass: type
StructuralChangeKind: type
StructureHintIssue: type
StructureHints: type
TrackedSiteBuildCheck: type
UNKNOWN_ACTOR_DISPLAY_NAME: value
UnpublishContentEntryCommand: type
UnpublishContentEntryResult: type
UnpublishContentEntryUseCaseInput: type
UnpublishContentEntryUseCaseResult: type
UpdateMediaMetadataInput: type
UpdateMediaMetadataResult: type
UpdateMediaMetadataUseCaseInput: type
UpdateMediaMetadataUseCaseResult: type
UserProfileReader: type
accountLink: value
actorDisplayName: value
actorPermissions: value
applyPreparedConfigurationSynchronization: value
assertBuildExportPageSize: value
assertLinkImpactAcknowledgment: value
assertLinkPageLimit: value
authorizeContentOperation: value
canContentOperation: value
canonicalizeJson: value
changeNeedsEvidence: value
checkConfigurationSynchronization: value
collectMediaBytes: value
collectionQueryIdentity: value
configurationSyncAdvancesPublicState: value
configurationSyncBackfills: value
configurationSyncBaseline: value
configurationSyncContentWrites: value
configurationSyncFieldChanges: value
configurationSyncLinkRewrites: value
configurationSyncMigrationSummary: value
configurationSyncSnapshotRewrites: value
contentModelRoute: value
contentOperationPermissions: value
contentSyncActor: value
createConfigurationSyncSingletonEntry: value
createMigrationEvidenceAccumulator: value
createSnapshotEvidenceAccumulator: value
decodeLinkImpactReceipt: value
defaultDispatcherRetryPolicy: value
delegatedContentOperations: value
detectMediaMimeType: value
diffContentModelStructures: value
dispatcherEventId: value
dispatcherLeaseId: value
dispatcherRetryDelay: value
duplicateTitle: value
effectiveActorPermissions: value
emailFailed: value
encodeEntryLink: value
encodeLinkImpactReceipt: value
escapeHtml: value
foldAscii: value
guardedEmailSender: value
importTokenCapabilities: value
importTokenExpiry: value
internalLinkIssuePath: value
invitationEmailTemplate: value
isEmailAddress: value
isMediaFocalCoordinate: value
normalizeAccountEmail: value
normalizeDisplayName: value
normalizeDraftCandidate: value
normalizeMediaMetadataPatch: value
normalizeMediaTags: value
normalizeMediaText: value
opaqueCursor: value
opaqueTokenSecret: value
opaqueTokenVerifier: value
packageName: value
parseEmailSender: value
passwordChangedEmailTemplate: value
passwordResetEmailTemplate: value
planConfigurationSyncScans: value
planConfigurationSynchronization: value
planEntryMigration: value
prepareConfigurationSynchronization: value
publicationIdempotencyKey: value
publicationRequestFingerprint: value
publishedProjectionBlockData: value
renderConfigurationSyncPlanJson: value
renderConfigurationSyncPlanText: value
renderEmail: value
reportConfigurationSynchronization: value
requireContentReader: value
requireSettingsManager: value
requireUsersManager: value
resolveCollectionQuery: value
sanitizeMediaFilename: value
selectBuildExportPage: value
sendTestEmail: value
siteBuildRetryPolicy: value
summarizeUserAgent: value
testEmailTemplate: value
transformConfigurationSyncFields: value
unconfiguredEmailSender: value
validateListQueryBudget: value
validateStructureHints: value
validatedMessage: value
withPublishedProjection: value
```

### Runtime export keys

```text
ALLOWED_MEDIA_MIME_TYPES
AccountError
AccountUseCases
BUILD_EXPORT_PAGE_BYTE_BUDGET
BuildExportCursorError
BuildExportVersionChangedError
CLOUDFLARE_LIST_QUERY_LIMITS
CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES
CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE
CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT
CONFIGURATION_SYNC_SCAN_PAGE_SIZE
CONTENT_ENTRY_SORTS
CONTENT_ENTRY_STATUSES
CollectionQueryValidationError
CompleteImageContainerInspector
ContentLinkUseCases
ContentUseCases
ContentValidationError
DEFAULT_CONTENT_ENTRY_SORT
DEFAULT_MEDIA_SORT
DISPATCHER_LEASE_DURATION_MS
DISPLAY_NAME_MAX_LENGTH
EMAIL_HTML_MAX_LENGTH
EMAIL_SENT
EMAIL_SUBJECT_MAX_LENGTH
EMAIL_TEXT_MAX_LENGTH
IMPORT_TOKEN_USE_RECORD_INTERVAL_MS
INVITATION_TTL_MS
MAX_BUILD_EXPORT_PAGE_SIZE
MAX_CONTENT_ENTRY_SEARCH_LENGTH
MAX_IMAGE_DIMENSION
MAX_IMAGE_PIXELS
MAX_IMPORT_TOKEN_LIFETIME_DAYS
MAX_MEDIA_BYTES
MAX_MEDIA_SEARCH_LENGTH
MAX_MEDIA_USAGE_ENTRIES
MEDIA_SORTS
MIN_IMPORT_TOKEN_LIFETIME_DAYS
MediaDeletionDispatcher
MediaUseCases
NODE_LIST_QUERY_LIMITS
OAuthConnectionUseCases
PASSWORD_RESET_TTL_MS
RateLimitExceededError
SITE_BUILD_DEBOUNCE_MS
SYSTEM_ACTOR_DISPLAY_NAME
SiteBuildDispatcher
SiteBuildTracker
SiteBuildUseCases
UNKNOWN_ACTOR_DISPLAY_NAME
accountLink
actorDisplayName
actorPermissions
applyPreparedConfigurationSynchronization
assertBuildExportPageSize
assertLinkImpactAcknowledgment
assertLinkPageLimit
authorizeContentOperation
canContentOperation
canonicalizeJson
changeNeedsEvidence
checkConfigurationSynchronization
collectMediaBytes
collectionQueryIdentity
configurationSyncAdvancesPublicState
configurationSyncBackfills
configurationSyncBaseline
configurationSyncContentWrites
configurationSyncFieldChanges
configurationSyncLinkRewrites
configurationSyncMigrationSummary
configurationSyncSnapshotRewrites
contentModelRoute
contentOperationPermissions
contentSyncActor
createConfigurationSyncSingletonEntry
createMigrationEvidenceAccumulator
createSnapshotEvidenceAccumulator
decodeLinkImpactReceipt
defaultDispatcherRetryPolicy
delegatedContentOperations
detectMediaMimeType
diffContentModelStructures
dispatcherEventId
dispatcherLeaseId
dispatcherRetryDelay
duplicateTitle
effectiveActorPermissions
emailFailed
encodeEntryLink
encodeLinkImpactReceipt
escapeHtml
foldAscii
guardedEmailSender
importTokenCapabilities
importTokenExpiry
internalLinkIssuePath
invitationEmailTemplate
isEmailAddress
isMediaFocalCoordinate
normalizeAccountEmail
normalizeDisplayName
normalizeDraftCandidate
normalizeMediaMetadataPatch
normalizeMediaTags
normalizeMediaText
opaqueCursor
opaqueTokenSecret
opaqueTokenVerifier
packageName
parseEmailSender
passwordChangedEmailTemplate
passwordResetEmailTemplate
planConfigurationSyncScans
planConfigurationSynchronization
planEntryMigration
prepareConfigurationSynchronization
publicationIdempotencyKey
publicationRequestFingerprint
publishedProjectionBlockData
renderConfigurationSyncPlanJson
renderConfigurationSyncPlanText
renderEmail
reportConfigurationSynchronization
requireContentReader
requireSettingsManager
requireUsersManager
resolveCollectionQuery
sanitizeMediaFilename
selectBuildExportPage
sendTestEmail
siteBuildRetryPolicy
summarizeUserAgent
testEmailTemplate
transformConfigurationSyncFields
unconfiguredEmailSender
validateListQueryBudget
validateStructureHints
validatedMessage
withPublishedProjection
```

### Test titles by file

```text
src/accounts.test.ts > administrator invitations > deny actors without users:manage before any port call
src/accounts.test.ts > administrator invitations > a sent invitation carries no link and normalizes the address
src/accounts.test.ts > administrator invitations > an undelivered invitation returns the accept link once
src/accounts.test.ts > administrator invitations > conflicts and missing invitations map to closed errors
src/accounts.test.ts > administrator invitations > listed invitations derive pending and expired states without tokens
src/accounts.test.ts > administrator invitations > public inspection and acceptance fail with the invalid-invitation outcome
src/accounts.test.ts > password recovery > reset requests are uniform for unknown and disabled accounts and defer delivery
src/accounts.test.ts > password recovery > the response never waits for a slow sender
src/accounts.test.ts > password recovery > per-email limits refuse a fourth request before issuing
src/accounts.test.ts > password recovery > confirmation failures share one invalid-reset outcome
src/accounts.test.ts > password recovery > administrator resets report delivery and hand over undelivered links once
src/accounts.test.ts > self-service > password changes require the current password and defer the notice
src/accounts.test.ts > self-service > no password-changed notice is scheduled without an email provider
src/accounts.test.ts > self-service > sessions mark the current one and the current session cannot be deleted
src/accounts.test.ts > self-service > display names are trimmed and bounded
src/accounts.test.ts > self-service > administrators sign users out everywhere
src/accounts.test.ts > user agents classify into coarse browser and OS families
src/accounts.test.ts > account templates escape every paragraph and state expiry in hours
src/build-export.test.ts > selects build-export pages by limit and stored byte budget
src/collection-queries.test.ts > configured list queries resolve before reads with role parity and detached canonical operands
src/collection-queries.test.ts > trusted runtime LIKE budgets reject before reads and preserve original filter pointers
src/collection-queries.test.ts > entry lists pass an exact collection slug and refuse it for singleton models
src/conditional-publication.test.ts > conditional publication > publishes the projection of fields, every block and their references
src/conditional-publication.test.ts > conditional publication > does not check hidden links but still checks visible ones
src/conditional-publication.test.ts > conditional publication > refuses a stale revision before attaching a projection
src/conditional-publication.test.ts > conditional publication > keeps the copy path for content without rules
src/conditional-publication.test.ts > conditional publication > enforces visible required targets with exact paths on the server
src/conditional-publication.test.ts > conditional drafts > create keeps hidden values and validates them as drafts
src/configuration-evolution.test.ts > classifies every structural change kind deterministically
src/configuration-evolution.test.ts > reports allowlist reorder as display and changed block definitions as migration
src/configuration-evolution.test.ts > accumulates evidence across pages and caps named violations
src/configuration-evolution.test.ts > records baselines for unchanged models and accepts legacy hashes
src/configuration-evolution.test.ts > keeps the strict refusal when a populated model has no baseline
src/configuration-evolution.test.ts > applies compatible changes to populated models without scanning
src/configuration-evolution.test.ts > prepares evidence-backed plans with backfills and refusals
src/configuration-evolution.test.ts > refuses media default backfills, used block changes, breaking types and published routes
src/configuration-evolution.test.ts > renders identical reports for equivalent inputs
src/configuration-evolution.test.ts > pairs hinted renames with their former definitions and marks hinted removals
src/configuration-evolution.test.ts > treats applied hints as inert and rejects contradicting ones
src/configuration-evolution.test.ts > evaluates moved, pruned and backfilled values in apply order
src/configuration-evolution.test.ts > plans hinted rewrites, refuses unhinted removals and renames onto data
src/configuration-evolution.test.ts > keeps plans without hints free of hinted write fields
src/configuration-evolution.test.ts > classifies enabling and disabling SEO and collects SEO holders
src/configuration-evolution.test.ts > composite adoption preserves compatibility and requires evidence for nested evolution
src/configuration-evolution.test.ts > nested evolution pairs ancestors before child hints and retains inert hints
src/configuration-evolution.test.ts > nested hint validation refuses source ambiguity and invalid traversal
src/configuration-evolution.test.ts > nested scalar items and type changes are classified without composite fallback
src/configuration-evolution.test.ts > recursive field transforms keep presence, values, arrays and media paths
src/configuration-evolution.test.ts > recursive media backfills, per-item collisions and tightening carry concrete paths
src/configuration-evolution.test.ts > composite defaults normalize descendants and nested media relocates with parent rename
src/configuration-evolution.test.ts > recursive plans apply satisfied tightening and refuse named violating occurrences
src/configuration-evolution.test.ts > nested tightening preserves draft minima and unrelated published absence
src/configuration-evolution.test.ts > nested reports count snapshots once, cap evidence and retain schema/value paths
src/configuration-evolution.test.ts > prospective nested values enforce aggregate list, media and JSON boundaries
src/configuration-evolution.test.ts > schema hint lookup uses own field keys even for constructor
src/configuration-evolution.test.ts > itemLabel sync is projection-only without content writes or version changes
src/configuration-evolution.test.ts > CE9B model and nested layouts plan no content writes
src/configuration-evolution.test.ts > select card presentation plans display updates without content writes
src/configuration-evolution.test.ts > setting visibility changes plan display-only metadata without content writes
src/configuration-evolution.test.ts > embed restrictions classify narrowing as breaking at root and nested paths
src/configuration-evolution.test.ts > query identity classifies trusted, legacy and mixed public changes
src/configuration-migration.test.ts > plans entry migrations with the revision rule and published snapshots first
src/configuration-migration.test.ts > validates migrated drafts and published snapshots in their own modes
src/configuration-migration.test.ts > validates hidden published blocks in draft mode and migrates settings
src/configuration-migration.test.ts > refuses failed, missing and ahead migrations and plans valid ones from evidence
src/configuration-migration.test.ts > migrates in units, re-prepares, and resumes after an interruption
src/configuration-migration.test.ts > stops before the final mutation when the reviewed plan changed
src/configuration-migration.test.ts > migrates version 1 built-in image blocks to the current version without changing their data
src/configuration-migration.test.ts > checks complete resulting composite budgets and nested prior-media locations
src/configuration-migration.test.ts > a later model removal cannot make an unsafe migration intermediate acceptable
src/configuration-sync.test.ts > plans creates, no-ops, display changes, and compatible version updates
src/configuration-sync.test.ts > rejects kind changes, version regressions, and unversioned structure changes
src/configuration-sync.test.ts > requires explicit safe renames and protects stored entries and snapshots
src/configuration-sync.test.ts > refuses kind changes involving globals and blocks removing a synchronized global
src/configuration-sync.test.ts > materializes a global singleton entry for a created global
src/configuration-sync.test.ts > rejects duplicate and ambiguous synchronization identity evidence
src/configuration-sync.test.ts > renders canonical deterministic reports and check outcomes
src/configuration-sync.test.ts > prepares a detached dry run and materializes page defaults only for apply
src/configuration-sync.test.ts > plans a list-field change as a projection-only label update
src/configuration-visibility.test.ts > classifies added, removed, narrowed, widened and controller changes
src/configuration-visibility.test.ts > pairs renamed targets and controllers and reports only field changes for added or removed targets
src/configuration-visibility.test.ts > nested group rules use schema paths
src/configuration-visibility.test.ts > transforms prune hidden published values, skip hidden backfills and keep drafts
src/configuration-visibility.test.ts > pruning releases media held only by hidden published values
src/configuration-visibility.test.ts > revealed published occurrences must satisfy publication; hidden ones keep draft semantics
src/configuration-visibility.test.ts > sync plans prune published values, report affected counts and refuse revealed gaps
src/configuration-visibility.test.ts > published block migrations store the published projection of block data
src/content-authority.test.ts > delegated authority is immutable, role-intersected and can only narrow another ceiling
src/content-authority.test.ts > shared operation policy preserves browser roles and denies unregistered/delegated lifecycle operations
src/content-authority.test.ts > direct delegated content calls deny before any content/media port access, including both deletion states
src/content-authority.test.ts > even publication ceilings cannot grant destructive or other lifecycle operations
src/content-authority.test.ts > browser deletion keeps unpublished-versus-published permission checks
src/content-authority.test.ts > delegated writes store audit identity without reusable authority
src/content-authority.test.ts > model discovery and admin projections share normalized metadata, defaults and bounded safe attribution
src/draft-normalization.test.ts > client prediction matches the draft a save stores
src/draft-normalization.test.ts > a global's title is replaced by its label
src/draft-normalization.test.ts > invalid block data fails with the draft-save issue path
src/draft-normalization.test.ts > application re-exports the portable import helpers
src/draft-normalization.test.ts > draft candidates keep hidden values and publish without hidden requirements
src/email.test.ts > accepts one bare recipient address only
src/email.test.ts > parses a sender with an optional display name
src/email.test.ts > rejects header injection, several recipients and unbounded bodies
src/email.test.ts > guarded senders validate before delivery and never throw
src/email.test.ts > escapes every paragraph in the shared HTML layout
src/email.test.ts > { installationUrl: "https://cms.example.com/" }
src/email.test.ts > sends the test email only to the acting administrator
src/email.test.ts > denies the test email to editors and viewers
src/email.test.ts > propagates closed failures and short-circuits an unconfigured provider
src/field-filter-capabilities.test.ts > each queryable kind rejects unsupported operators at the operator pointer
src/image-container.test.ts > detects GIF87a and GIF89a signatures only
src/image-container.test.ts > reports the logical screen of static and animated GIFs
src/image-container.test.ts > rejects a GIF with %s
src/image-container.test.ts > rejects GIF bytes declared as another format and PNG bytes declared as GIF
src/import-tokens.test.ts > import-token capabilities require settings management and current publish permission
src/import-tokens.test.ts > import-token lifetimes are 1 to 7 whole days
src/index.test.ts > exports its package identity
src/index.test.ts > brands portable opaque values without exposing runtime dependencies
src/index.test.ts > resolves portable actor display names and ASCII-only search folding
src/internal-links.test.ts > link receipts bind actor, target, action, target guards and the graph without granting permissions
src/media-use-cases.test.ts > validates and defaults media list queries before reading
src/media-use-cases.test.ts > returns media details with bounded usage and uploader names
src/media-use-cases.test.ts > reloads catalog views after create and deletion commands
src/media-use-cases.test.ts > resolves media binary eligibility without reading object storage
src/media-use-cases.test.ts > validates media metadata patches before any read and merges onto stored values
src/media-use-cases.test.ts > media tags validate before I/O, preserve authorization, and separate build effects
src/media-use-cases.test.ts > uploads record the stored bytes' SHA-256 and lists filter by a valid hash
src/site-build.test.ts > site-build timing follows the fixed architecture defaults
src/site-build.test.ts > only administrators can enqueue manual or retry build commands
src/site-build.test.ts > site-build dispatcher maps every trigger result to one truthful lifecycle write
src/site-build.test.ts > site-build tracker maps observations to proven outcomes and later checks
src/site-build.test.ts > site-build tracker enforces grace, backoff bounds and the overall deadline
```

## Final export and dependency checks

The declaration export list matches the baseline with exactly two additional type-only names: `SessionSecurityPort` and `TokenSecurityPort`. The 140 runtime keys match exactly. The scratch dependency graph check covered 42 production modules, including type-only imports, and found no cycles or directory-direction violations.

## Final quality gates

Root typecheck, lint, format check and build passed. The full test command passed
with the pinned Node 24.12.0 and pnpm 12.3.4: 64 Turbo tasks and 284 root cases
in 35 files. The application suite passed 139 expanded cases, matching its
baseline of 131 listed titles. The cross-runtime project in
`vitest.verification.config.mjs` passed 7 cases in 4 files. The originally
listed `vitest.cross-runtime.config.mjs` does not exist; the owner approved
using the existing verification project's command. Strict change validation
passed.
