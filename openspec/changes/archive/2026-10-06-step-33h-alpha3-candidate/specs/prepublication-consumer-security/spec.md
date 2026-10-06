## ADDED Requirements

### Requirement: Exact-artifact acceptance runs the alpha.2 field-trial regressions
Release acceptance against a complete clean-source inventory SHALL, in addition to the onboarding feedback suite and with only that inventory's generator, package archives and loaded API/builder image IDs, run these alpha.2 field-trial regressions and name each in the receipt:

- **Block order:** in the admin served by the loaded API image, pointer and keyboard reordering, insertion and duplication in the middle of the list, removal and undo of removal SHALL save, survive reload and publish in the displayed order, and the build export and the packed consumer's static output SHALL contain the blocks in that order. A draft whose positions do not ascend SHALL be rejected with `CONTENT_INVALID_STATE`, a safe block-order explanation and a request ID, without advancing the draft revision or changing the published export.
- **Builder source diagnostics:** an existing-site consumer running the Compose production stack with the loaded images SHALL build with excluded root service-document links, and each injected unsupported source (in-site link, escaping link, unreadable entry, missing lockfile) SHALL reach a terminal failed build with its closed reason and safe relative path in the admin while the previous static release remains served; a corrected retry SHALL succeed.
- **Weak ETags:** the packed Astro loader SHALL read the build export from the Compose API through a compressing proxy that turns the strong validator weak, in static and development modes without a custom fetch, revalidate with the received validator, receive `304` while unchanged and new content after a publication.
- **Credential separation:** the packed CLI SHALL keep remote Lace credentials in the explicit private operator file, report OAuth shadowing by dotenv or shell tokens through preflight without contacting a real account, and the generated Worker SHALL bundle without an account.
- **Pages tracking:** the packed Cloudflare Worker, configured with Pages tracking against a local Pages API stub, SHALL record a hook-accepted deployment as running and complete it as `succeeded` only after the stub reports a successful deploy stage, and as `failed` with a tracked reason when the stub reports a failed stage; an untracked hook SHALL end in `accepted`. The Pages token SHALL not appear in build history, responses or captured diagnostics.
- **Scenario guides:** the packed consumer's development, production and Cloudflare guides SHALL contain the reviewed ordered command sequences, and the journeys SHALL run the commands those guides name; a missing, renamed or reordered command SHALL fail naming the guide.
- **Upgrade from the published alpha.2 template:** the template `0.14.0` default and Cloudflare fixtures SHALL upgrade with the packed CLI to the candidate template as specified for that upgrade, in addition to the `0.4.0` fixtures.

These journeys SHALL use only local stubs and SHALL NOT contact a real Cloudflare account, registry or remote host. A failing regression SHALL stop the run at its named stage without a success receipt.

#### Scenario: Candidate carries every field-trial fix
- **WHEN** a complete clean-source inventory passes every field-trial regression journey
- **THEN** the receipt lists the block-order, builder-diagnostics, weak-ETag, credentials, Pages-tracking, scenario-guide and published-template upgrade journeys with the inventory's identity

#### Scenario: Reordered blocks lose their order
- **WHEN** the packed admin saves or publishes blocks in an order different from the displayed one
- **THEN** acceptance fails at the block-order stage

#### Scenario: Weak validator rejected
- **WHEN** the packed loader rejects a weak build-export ETag received through the compressing proxy
- **THEN** acceptance fails at the weak-ETag stage

#### Scenario: Tracking reports success without proof
- **WHEN** the packed Worker marks a tracked build `succeeded` before the stub reports a successful deploy stage, or leaves it `running` after a terminal stub result
- **THEN** acceptance fails at the Pages-tracking stage

#### Scenario: Guide drift
- **WHEN** a generated guide in the packed consumer omits or reorders a command of its reviewed sequence
- **THEN** acceptance fails naming that guide
