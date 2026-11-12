## Why

The public documentation (`apps/docs`, 20 pages under `en/latest`) no longer
matches the product. The CLI reference omits `lace upgrade`, `lace env prepare`
and every command flag; 30 of the `LACE_*` settings declared by the generated
project are not mentioned anywhere; none of the 58 REST paths of
`apps/api/openapi/api-v1.json` and none of the six MCP tool names are listed;
`lace.config.ts` options such as `removedFields`, `removedBlocks` and
`removedSeo` are undocumented. At the same time most internal notes in
`docs/*.md` (`mcp.md`, `media-tags.md`, `site-styling.md`, `field-guidance.md`,
…) carry user guidance that either duplicates or replaces the public site, so
a reader cannot tell which text is current. Nothing tells a reader which
release a page was last checked against.

This is roadmap Step RF8, session **RF8C — User documentation**
([refactoring roadmap](../../../../docs/refactoring-roadmap.md)), the last RF8
session after RF8A (architecture), RF8X/RF8Y (rc1 baseline, release history)
and RF8B (specifications). It follows RF7D, whose change is implemented and
awaiting archive; RF8C touches no file that RF7D changed.

## What Changes

- **Reference completeness.** The reference section lists every public CLI
  command and flag of `lace` and `create-lace`, every `LACE_*` setting that the
  generated project declares or the CLI reads, every `lace.config.ts` option
  and field builder, every REST path of the committed OpenAPI document and
  every MCP tool and scope. A new `reference/configuration` page, a new
  `reference/mcp` page and REST resource tables in `reference/api` are added;
  `reference/cli-environment` keeps its route and becomes complete.
- **Coverage guard.** A root test derives the command names and flags from the
  built CLIs' `--help`, the settings from the generated templates, the REST
  paths from `api-v1.json`, the MCP tools from the contracts' tool argument
  schemas and the configuration options from the declared input types, and
  fails naming each item that no reference page mentions.
- **Feature coverage.** Each delivered feature has a page or a section:
  content import, media tags, conditional fields, MCP with publication,
  collection queries (configuration, editor and API), internal links, video
  embeds, gallery item placement and size, default collection sort,
  route-less collections and the editor's block controls.
- **One place per topic.** Every `docs/*.md` note is classified. User guidance
  is promoted into public pages; a note left with no engineering content is
  deleted (`media-tags`, `field-guidance`, `form-organization`,
  `rich-text-authoring`, `site-styling`, `composite-fields`, `mcp`), and the
  owner's Russian `personal-site-guide.md` is deleted as superseded by the
  public journeys. Mixed notes keep only engineering content and link to the
  public page. `docs/README.md` marks every remaining note `internal note`,
  names the public page that owns its user topic and records each promotion;
  every incoming link is updated.
- **Page template.** Every page declares a `kind` (`overview`, `guide`,
  `reference`). Guides state their purpose, open with *Before you start*,
  continue with task sections and end with *Reference*; the documentation
  check enforces the shape.
- **Verified-against footer.** Every page declares `verifiedAgainst`; the
  footer renders "Verified against `<version>`". The check accepts only the
  current release `version` of `release/alpha.json` or one of its
  non-alpha `publishedVersions`; every page audited here records
  `0.1.0-rc2`. The documentation publication detector treats those two
  release fields as a public build input.
- **Open questions settled.** `en/latest` gains no pinned version section
  during prereleases; the first stable release adds one in its own change.
  Generated consumer guides stay generated, version-matched assets of the
  project template and are not published on the site.

No CLI, API, MCP, configuration or runtime behavior changes.

### Non-goals

- Translations or an additional version section.
- Renaming or removing existing `en/latest` routes.
- Renaming `release/alpha.json` or changing release tooling.
- Changing generated consumer guides beyond links that name a deleted
  internal note (none do today).
- Pruning the OpenSpec change archive or archived roadmaps beyond updating
  links to deleted notes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-documentation`: adds reference completeness and its guard, the page
  template and verified-against footer, coverage of the features delivered
  after the roadmaps, and one-place ownership between public pages and
  internal notes (replacing the topic-map wording of *Public and internal
  documentation retain explicit ownership*). *Upgrade guidance covers only the
  oldest supported release onward* is modified so that the permanent
  compatibility guide states the upgrade policy and links to the public
  upgrade steps instead of repeating them (found during apply).
- `documentation-publication`: the release version fields rendered in the
  footer become a declared publication input; the stale alpha.6 example in
  *Automatic publication depends on changed documentation inputs* is replaced.

## Impact

- `apps/docs`: pages under `src/content/docs/en/latest/`, a `Footer` component
  override, the content schema (`kind`, `verifiedAgainst`), `scripts/check.mjs`
  and its tests.
- `docs/*.md`: seven notes and the personal site guide deleted, mixed notes
  trimmed, `docs/README.md` and `docs/documentation-maintenance.md` updated;
  links in `docs/archive/*` and `DEVELOPMENT.md` to deleted notes updated.
- `scripts/docs-inputs.mjs` and `tests/docs-publication.test.mjs`: release
  version projection as an input.
- New root test `tests/docs-reference.test.mjs`; it reads built `dist/`
  outputs of `@lacecms/cli`, `create-lace` and `@lacecms/contracts`, like
  `tests/content-import-sample.test.mjs`.
- Architecture: none of `docs/architecture/` changes; §6/§19/§20
  (`workspace.md`) already state that public guides live in `apps/docs`.
- Roadmap: RF8C progress row and outcome.
