## Context

`normalizeCommonModel` is shared by all three code-first model builders.
Model discovery already projects normalized configuration through one shared
REST and MCP contract. Desktop navigation and the mobile sheet render the
same `SidebarNav` and derive per-item data from `navigationGroups`.

## Goals / Non-Goals

**Goals**

Keep the authored value a single JSON string, validate it consistently on both
runtimes, and carry it along the existing model discovery path.

**Non-goals**

The feature covers the sidebar, including the mobile sheet. The content
overview, breadcrumbs, icon uploads and an icon picker are outside this change.

## Decisions

### Share the supported names and emoji validation

Place the twelve Lucide names and the portable value checks in
`@lacecms/content`, which is already a dependency of configuration and
contracts. The admin will use the same catalog to type its static lookup table.
A type-level check in the admin can verify the catalog's names against
`IconName` from the installed Lucide package and verify that every supported
name maps to a component. The portable code only consumes strings.

Keep `icon` as an optional string in the config type. With the agreed
syntax, TypeScript's `string` also covers Lucide names. Check known names and
one complete emoji sequence during normalization and use the existing config
error convention to report the model key and option. Use a pinned
[`emoji-regex`](https://github.com/mathiasbynens/emoji-regex) release so the
Unicode data is the same in Node, Workers, and browsers. Bound the value
before matching and compare the single match against the entire input.
Code-point counts and grapheme segmentation alone would accept invalid icon
text or reject emoji with multiple code points.

### Keep discovery tolerant of additional names

Project the optional string alongside the existing display metadata in the
application discovery use case. The shared contracts layer validates the
shape of an icon identifier or a complete recognized emoji. The config
loader also checks Lucide catalog membership. The admin resolves known names
using the same catalog, renders an emoji as text, and falls back by model
kind for an otherwise valid identifier. Sharing the stricter config check
with the transport would make an otherwise valid model list fail to load
when its catalog grows.

Use direct Lucide imports in the admin and reuse the model item's existing
icon slot on desktop and mobile. This keeps the decorative icon aligned with
the label and accessible through the same named link. Using Lucide's full
dynamic catalog would expand what the admin build must process for this small
set. See [Lucide's dynamic icon guidance](https://lucide.dev/guide/react/advanced/dynamic-icon-component).

### Reuse the public identity guard

Amend architecture §8's public identity rule to add the root model `icon`
alongside collection `listOptions`. Keep the icon in normalized model
metadata and full projection identity. Exclude only the root descriptor
property from both structural hash paths and from the existing model public
projection hash. This preserves icon-named fields and default keys. The
config package's serializable model projection carries descriptor metadata.
The public content API and build export use separate content projections.

The existing synchronization planner already compares public hashes for a
projection-only update. Reuse its atomic identity writes, stale-plan guard,
and conservative recovery for a missing or untrusted public baseline.
Including the icon in public identity would trigger a site build even for a
sidebar-only edit. Excluding it from full identity would make such edits
invisible to configuration sync.

## Risks / Trade-offs

- Emoji glyphs depend on the device font. Render them as text in a fixed-width
  decorative slot and retain the visible model label.
- Adding a field to a strict response schema requires matching admin and API
  assets when upgrading from a version that predates the field. Once both
  sides support the optional field, adding names to the catalog can use the
  older sidebar's fallback.

## Migration Plan

The rollout uses the existing database schema and the normal configuration
deployment and synchronization workflow. Existing configs without an icon
retain their hashes. On a legacy installation, an ordinary sync before
adding icons can record a missing public baseline while the full identity
still matches. For a rollback to a version before this change, remove the
added icon options from the project config before running the older version
and use its normal sync workflow.
