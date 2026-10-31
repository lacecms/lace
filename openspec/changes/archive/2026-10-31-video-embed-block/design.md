## Context

See proposal.md for motivation and selected roadmap unit. Today the public URL
DSL accepts safe generic links but has no provider restriction; its builder and
metadata rehydration live in `packages/content/src/index.ts`. `isFieldValue`
validates URLs through `isSafeUrl`. Built-ins are public DSL definitions in that
same module. `packages/render/src/blocks.ts` already supplies parsed props,
contextual errors and `image()`. `registry/` is the canonical component source,
bundled by the CLI and copied into the reference and generated starter sites.
Accepted block-source-registry behavior currently bans all component scripts.
That prohibition must be changed explicitly for preview activation only.

## Goals / Non-Goals

**Goals:** Keep one portable provider parser, generic authoring and safe static
output. Make embeds independently deliverable from uploaded video. Preserve
ordinary URL metadata identity and all existing block versions.

**Non-Goals:** See proposal.md. In particular, this adds no storage port, upload
transport, provider fetch, player SDK or framework hydration. The admin form
edits metadata and image references without previewing third-party players.

## Decisions

### Shared URL restriction and parser

Add `embedProviders?: readonly ("youtube" | "vimeo")[]` to the public URL field
options/definitions and metadata validation/rehydration. Canonicalize its order,
validate its defaults and preserve omission for existing hashes. Reuse one pure
URL parser in content validation and render description; export the portable
result as necessary. Follow the exact bounded grammar in video-embeds/spec.md;
never resolve redirects or treat arbitrary URL tails as IDs. Ignore unrecognized
query parameters rather than copying them into iframe URLs. Preserve Vimeo's
privacy hash and reject conflicting identities. No new raw HTML value type.

Extend structural evolution comparison in
`packages/application/src/configuration-evolution.ts`: adding/narrowing the
restriction is breaking; removing/widening is compatible unless another delta
is stricter. Update metadata consumers rather than assuming unknown options
survive their shape checks. Tests must pin ordinary metadata hashes.

Alternative: validate only in the site component. Rejected because invalid data
would save/publish successfully and fail only at build time. A block-specific
validator is also rejected: built-ins must use the same public DSL as custom
blocks. A new field kind is unnecessary for a string URL with a restriction.

### Block and render contracts

Define `builtInBlocks.videoEmbed` version 1, label Video embed, fields `url`,
`title`, `poster`, `caption`; no settings/default URL/provider select. `url` is
required and restricted to both providers; `title` is required text with
`minLength: 1`. The native player uses this title for its accessible name.
The poster is an optional ordinary image `field.media`, not an external image
URL. Ordinary media collection/reference rebuilding therefore handles usage,
deleting states, publication and hidden blocks without new lifecycle code.
Caption belongs to the video and does not inherit the poster caption.

Expose a pure `describeVideoEmbed(url, context?)` from `@lacecms/render`, with
provider, video ID, canonical `src` and optional Vimeo privacy hash. It delegates
to the content parser and throws existing `invalid_block_data` errors with
`url` field path. Do not add mandatory props to BlockProps: the site-owned
component imports this helper, and uses existing `image(data.poster)` for
media. `prepareBlocks` already skips hidden blocks before parsing.

### Site-owned preview activation

Add `registry/astro/videoEmbed/VideoEmbedBlock.astro`, a companion structural CSS
file and manifest revision 1, plus registry index entry. Keep dependency ranges
consistent with the release carrying the new content/render exports. The CSS
reserves 16:9, full-width player geometry in a low-specificity layer; site CSS
owns decoration. Root figure preserves envelope and documented data hooks.
Without poster render a lazy iframe immediately. With poster render a named
native button, optimized LaceImage with alt="", and an inert template for the
validated iframe. A local Astro-processed script installs an idempotent,
per-block activation handler, clones only the prevalidated template, removes
the button and focuses the new frame. It never uses innerHTML or a provider SDK.
No live iframe or provider resource exists before activation. Event handling
must be safe for more than one block and repeated initialization.

No `autoplay` parameter or permission is supplied, even after activation. The
visitor can need to press Play in the player after loading it. Keep a visible
source link in both modes and a no-JavaScript fallback. Do not rely on cross-
origin failure detection: unavailable/private/domain-restricted videos are the
provider's UI, with the source link remaining available. Referrer policy is
strict-origin-when-cross-origin, rather than no-referrer which can interfere
with player identification. Frame permissions and escaping follow the spec.

Alternative: always load an iframe beneath a poster. Rejected because the poster
would not defer external requests. A script-free disclosure cannot reliably
prevent provider loading. External player SDKs add unnecessary weight and
ownership complexity. Only this registry component gets a script exception;
`@lacecms/astro` remains free of client scripts and visual block implementations.

### Distribution and existing consumers

Update reference and starter block maps, site locks, canonical source copies,
page allowed-block lists, model versions where structure changes, and generated
snapshots using the existing source generation/install paths. Existing consumers
opt in with `lace add block videoEmbed` and an explicit model/config sync; no
upgrade should inject this into an existing model. Preserve local modifications
through the existing lock/conflict and .new recovery behavior.

### Portability, atomicity and observability

No SQL migration or binary media change. Provider URLs are block JSON strings;
only posters add ordinary media references. Existing revision guards and atomic
save/publish transactions cover the change on Node and Workers identically.
Runtime failures use existing field paths and render error context, without
logging full private Vimeo URLs or adding telemetry. Static builds never call
providers; local poster optimization retains its existing media fetch behavior.

## Risks / Trade-offs

- Provider embed rules or availability can change → parser syntax tests and
  canonical URL tests stay offline; document a manual provider smoke check and
  use the always-visible source fallback. Vimeo privacy/domain permissions
  remain external configuration.
- A fixed 16:9 slot can letterbox portrait video → provider player owns fitting;
  custom ratios and playback controls are future scope.
- Poster activation is client code in previously script-free block sources →
  explicit, bounded architecture/spec exception and browser tests for keyboard,
  focus, multiple instances and blocked pre-activation requests.
- URL restrictions affect configuration safety → structural evolution tests,
  unchanged existing hashes and explicit sync/model versions on opt-in.

## Migration Plan

1. During apply update architecture §§8, 11 and 13 for the selected block,
   provider restriction and bounded registry script exception before code edits.
   Retain the current image-only media contract in §9.7.
2. Ship content/render support, then registry/component and maintained-site
   integration together. Build both reference fixtures and generated starter.
3. Update public/internal/generated block docs and the topic ownership map as
   applicable; explain URL forms, preview click-to-load, source fallback,
   embedding/privacy limitations and that video-file uploads remain deferred.
4. No automatic existing-content migration: opt-in sites advance model versions
   and run normal config sync. Roll back deployed site assets with the previous
   known build; before removing the definition from CMS config, remove/migrate
   any stored embed content through normal guarded configuration workflows.
   Never deploy a renderer lacking a type still present in published content.

## Provider references

- [YouTube embedded player URL format](https://developers.google.com/youtube/player_parameters).
- [Vimeo unlisted-video hash requirement](https://help.vimeo.com/hc/en-us/articles/12426470858001-Embedded-player-displays-This-video-does-not-exist-message).
- [Vimeo embed options](https://developer.vimeo.com/player/sdk/embed).

These references inform canonical player URLs; the accepted input grammar is
intentionally narrower than every URL the providers might support.
