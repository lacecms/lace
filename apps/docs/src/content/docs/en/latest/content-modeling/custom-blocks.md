---
title: Create a custom block
description: Define a custom content block, add it to a model and render it in Astro.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

A block has a content definition in the CMS and a separate site-owned renderer.
The definition generates a generic Admin form; the Astro component decides how
published content looks. This example adds a small notice to a generated
project with a starter site.

## Before you start

- A generated project with the starter Astro site in `site/`
  ([Getting started](../../getting-started/)).
- Familiarity with [field builders](../) and
  [configuration synchronization](../synchronization/).

## Define and register the block

Create `lace.blocks.ts` in the CMS project root:

```ts
import { defineBlock, field } from "@lacecms/content";

export const notice = defineBlock({
  type: "notice",
  version: 1,
  label: "Notice",
  fields: { message: field.text({ label: "Message", required: true }) },
  settings: {
    tone: field.select({ options: ["info", "warning"], defaultValue: "info" }),
  },
});
```

In `lace.config.ts`, import `notice` from `./lace.blocks.ts`, add it to the
existing top-level `blocks` array, and add `"notice"` to the `blocks` array of
Home or another chosen model. Preserve its existing types. Increase that
model's version because its allowed block types changed, and review and apply
[configuration sync](../synchronization/). Deploy the updated Worker as well
when using Cloudflare.

## Scaffold and implement the renderer

In the existing `site/lace.site.json`, add `"definitions": "../lace.blocks.ts"`
at the top level, preserving the other properties. The path is relative to the
site root. From the CMS root run:

```sh
pnpm exec lace add block notice --site site
```

The command scaffolds a typed component and registers it in the site's block
map. Edit the generated `site/src/components/lace/NoticeBlock.astro` to render
its data, for example:

```astro
---
import type { BlockProps } from "@lacecms/render";
import type { notice } from "../../../../lace.blocks";

type Props = BlockProps<typeof notice>;
const { anchor, block, className, data, settings } = Astro.props;
---

<aside id={anchor} class:list={[`notice--${settings.tone}`, className]}
  data-lace-block={block.type} data-lace-block-key={block.key}>
  <p data-lace-part="message">{data.message}</p>
</aside>
```

The relative type import above assumes the component is in
`site/src/components/lace/`; adjust it if the scaffold chooses another path.
Keep the type import aligned with the generated component. Add your own CSS.
Publish an entry containing the block and build the site to verify it. A missing
renderer or invalid published block fails the build rather than silently
omitting content. Hidden blocks are not rendered.

## Change the block later

If a stored block's fields or settings later change, increase the block version,
provide the necessary [migrations](../synchronization/#migrate-block-data) and
increase the version of every model that allows it. Update its renderer to match and review sync before applying it; see
[configuration synchronization](../synchronization/) and the generated
`docs/lace-astro-site.md`. The scaffold command does not overwrite your custom
component when you later change its definition.

Presentation-only changes, such as `settingsLayout`, `settingsVisibility`,
labels, descriptions or placeholders, need synchronization but no block or
model version increase.

## Reference

- [Configuration reference](../../reference/configuration/): `defineBlock`
  options, block settings and migrations.
- [CLI and environment](../../reference/cli-environment/): `lace add block`
  and its flags.
