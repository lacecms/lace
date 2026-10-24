# Internal URL links

Ordinary `field.url()` content fields accept manual safe URLs and canonical
`entry:<URI-component-encoded-id>` tokens. The editor's **CMS entry** picker
selects a published page or collection entry with a public path; **Manual URL**
keeps ordinary URLs available. Selection stores an identity, never its current
slug. This works inside model/global groups and lists and block data. Block
settings still permit only text/select/boolean/number with defaults. Rich-text
links, provider-restricted video URLs and SEO canonical URLs keep their existing
href grammar.

```ts
import { encodeEntryLink, field } from "@lacecms/content";

const fields = { relatedPage: field.url({ label: "Related page" }) };
const authoredValue = encodeEntryLink("opaque entry / 日本");
// entry:opaque%20entry%20%2F%20%E6%97%A5%E6%9C%AC
```

Use the helper instead of concatenating IDs. IDs are opaque and case-sensitive;
canonical encoding rejects malformed escapes, alternate encodings and control
characters. Tokens have no query, fragment, embedded slug or redirect history.
Manual paths, external URLs and anchors remain manual: changing a CMS slug does
not repair them, and deleting a block anchor does not repair an authored `#anchor`.
Do not infer references from text or arbitrary JSON strings.

## Authoring and publication

Switching editor modes preserves the current value until an explicit edit,
selection or clear. Missing/unpublished destinations retain their IDs and can be
replaced or cleared. Status lookup is deduplicated at editor scope in batches of
at most 200 IDs, including collapsed content; picker search is debounced,
cancelable, literal title-prefix search with bounded continuation pages.

A normalized snapshot may contain at most 200 reference occurrences across its
fields and block data, including hidden blocks and defaults. Repeated references
to one target count separately. Drafts may retain absent/unpublished targets;
known global targets are rejected because globals have no route. Publication
requires every delivered target to have a published route, including a valid
candidate route for a self-reference. Hidden references remain tracked but do
not block publication for unavailable targets.

Delete and unpublish dialogs show incoming draft, published-visible and hidden
locations. Published-visible incoming links require an additional unchecked
acknowledgment. Source and location lists are both paginated. Loading or failed
impact reads block submission. A changed graph invalidates its receipt and
requires a fresh review; unpublish network retries preserve their idempotency
key and original acknowledgment. Receipts confer no permissions. Existing
singleton restrictions and the prohibition on removing populated models remain;
there is no model-deletion CLI operation or impact override.

After confirmed target removal, incoming authored JSON stays intact. A successful
site rebuild renders unavailable destinations without navigation. Existing
published content can build with these warnings; publishing a source anew still
requires valid delivered targets. Republish the same ID to restore navigation
on the next build. A different ID taking the old slug never receives those links.
An export/network/build failure remains a failure; it cannot undo publication.

## Public transport and custom rendering

New public entry/global responses include `internalLinks`, including `[]`.
Each local manifest item is `{sourceKey, area, pointer, targetId}`: `$fields` plus
`fields`, or a block key plus `data`; pointers are relative RFC 6901 JSON Pointers.
Only delivered ordinary URL locations appear. Hidden blocks, settings, rich text
and draft data do not. Tokens in fields/data remain authored strings, not hrefs.

Build-export **format 2** requires manifests on every entry/global. Update the
SDK before consuming it: format-1-only SDKs reject it with upgrade guidance.
The current SDK accepts formats 1 and 2; legacy format 1 input without manifests
normalizes to `[]`. Known manifest properties remain validated even in tolerant
consumer parsing. Resolve only after the complete version-bound export traversal:
a destination can occur on a later page. The loader validates identity and
manifest consistency and never fetches individual targets.

```astro
---
const site = await getSite();
const destination = site.link(entry.fields.relatedPage);
// entry.link(value) and site.global("settings")?.link(value) use the same map.
---
{destination.state === "resolved" ? (
  <a href={destination.href}>Read more</a>
) : destination.state === "unavailable" ? (
  <span>Read more</span>
) : null}
```

Results are `resolved` with a safe `href` and optional `targetId`, `unavailable`
with `targetId` and no href, or `empty` with no href. Invalid targets throw.
Never use `href={entry.fields.relatedPage}`. Custom REST consumers must explicitly
adopt the new URL-target grammar and manifests before writing hrefs.

`site.linkDiagnostics` exposes `total`, the first 100 `items`, and `truncated`.
Items are ordered by source ID, area, source key and pointer and contain only
IDs, model keys and locations, never authored URL values or content. The optional
`onLinkDiagnostics` loader callback runs once per assembled view; static cache
hits, repeated renders and 304 revalidation reuse that view and its diagnostics.

## Installed components and adoption

Link v1 has required `label` and ordinary `url` fields, with defaulted `appearance`
(`button` or `text`) and `newTab` settings. Both appearances use an anchor when
resolved. New-tab anchors add `_blank` and `noopener noreferrer`. Unavailable
links use a plain label without button styling, role or tabindex. Site-owned CSS
can select `.link[data-lace-appearance]` and the `link`/`label` part hooks.

Update SDK/render/Astro/content packages and installed sources before authors
store tokens. Current source manifests require the coordinated, still-unpublished
alpha.7 candidate; this change does not publish a new package release. Review:

```bash
pnpm exec lace add block image gallery navigation hero cta link --site site --dry-run
pnpm exec lace add block image gallery navigation hero cta link --site site
# For locally edited sources, review proposals without overwriting them:
pnpm exec lace add block image gallery navigation hero cta link --site site --write-new
```

Retain user edits while merging `.new` files and update the lock through the
normal installer. Existing image/gallery/Hero/CTA/navigation block schema versions
do not change solely for resolver adoption. Adding Link to allowed blocks or
adding model/global URL fields requires raising affected model versions and
normal configuration sync. Template 0.38.0 includes source copies, helpers, URL
examples and styles; upgrades preserve user-owned site files and configuration.

## Persistence, migration and rollback

Apply `0010_internal_url_links.sql` after backing up SQLite/D1 and before starting
the matching API. It adds the reference projection, target and title-prefix
indexes and singleton graph revision without rewriting legacy content JSON.
The source snapshot foreign key cascades outgoing rows; target identity has no
foreign key so incoming links survive removal. Lifecycle and schema/default/block
migrations maintain projections atomically; unchanged tuples need no reference
writes, and a graph-changing atomic unit increments revision once. Existing
unavailable tuples allow unrelated schema updates; new published references
must pass target checks. Field/block pruning removes its outgoing locations.

Use the deployment's normal migration and configuration-sync commands. Stop the
Node API/dispatcher before copying the complete SQLite data directory; use a D1
export/restore point for Cloudflare. Rollback requires restoring the matching
database backup together with the matching API/admin/site artifacts: older
engines do not maintain this projection or understand the new URL grammar.
No down migration or automatic token-to-path conversion is provided.

Authenticated reads are `GET /api/v1/admin/link-targets`, `POST
/api/v1/admin/link-targets/resolve`, and `GET
/api/v1/admin/entries/:entryId/link-impact`. Delete/unpublish accept optional
`linkImpact: {receipt, acknowledgePublishedLinks: true}` with existing target
preconditions. `CONTENT_LINKS_IN_USE` requires review;
`CONTENT_LINK_IMPACT_CHANGED` requires refresh and renewed acknowledgment. See
the [generated OpenAPI](../apps/api/openapi/api-v1.json) for strict query modes,
limits and sanitized issue/error responses.

Embedded API compositions supply `ContentLinkUseCases` through the server's
`links` input and implement `ContentLinkReadPort` in custom repositories. The
bundled Node/Worker compositions already wire this port. Strict server DTOs
represent format 2; the SDK's `BuildExportData` and page types represent supported
formats `1 | 2` after legacy normalization.
