import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  renderBlockMap,
  renderCustomScaffold,
  missingMapLines,
  customComponentFile,
} from "../dist/blocks-map.js";
import {
  checkFramework,
  detectFramework,
  serializeLock,
  validateLock,
} from "../dist/blocks-site.js";

const starter = new URL("../../create-lace/templates/site/", import.meta.url);
const builtIns = ["cta", "hero", "image", "quote", "richText"];
const builtInEntries = builtIns.map((type) => ({
  type,
  component: `src/components/lace/${type[0].toUpperCase()}${type.slice(1)}Block.astro`,
}));

test("lock serialization reproduces the committed starter lock", async () => {
  const bytes = await readFile(new URL("lace.site.json", starter));
  expect(serializeLock(validateLock(JSON.parse(bytes.toString("utf8")))).equals(bytes)).toBe(true);
});

test("lock validation fails closed on unknown keys, escaping paths and bad hashes", () => {
  const base = {
    schemaVersion: 1,
    framework: "astro",
    componentsDir: "src/components/lace",
    blockMap: "src/lace/blocks.ts",
    blockMapSha256: null,
    items: {},
  };
  expect(validateLock(base).blockMapSha256).toBeNull();
  expect(() => validateLock({ ...base, extra: true })).toThrow(/unsupported keys/u);
  expect(() => validateLock({ ...base, componentsDir: "../shared" })).toThrow(
    /inside the site root/u,
  );
  expect(() => validateLock({ ...base, blockMap: "/abs/blocks.ts" })).toThrow(
    /inside the site root/u,
  );
  expect(() => validateLock({ ...base, blockMapSha256: "abc" })).toThrow(/SHA-256/u);
  expect(() =>
    validateLock({
      ...base,
      items: { hero: { revision: 1, files: { "../x.astro": "0".repeat(64) } } },
    }),
  ).toThrow(/inside the site root/u);
  const custom = validateLock({
    ...base,
    definitions: "../lace.blocks.ts",
    customBlocks: { faq: { files: { "src/components/lace/FaqBlock.astro": "a".repeat(64) } } },
  });
  expect(serializeLock(custom).toString()).toMatch(
    /"blockMapSha256": null,\n  "definitions": "\.\.\/lace\.blocks\.ts",\n  "items": \{\},\n  "customBlocks"/u,
  );
});

test("framework detection and reserved framework keys", () => {
  expect(detectFramework({ dependencies: { astro: "7.3.1", react: "19" } })).toBe("astro");
  expect(detectFramework({ dependencies: { react: "19" } })).toBe("react");
  expect(detectFramework({ devDependencies: { svelte: "5" } })).toBe("svelte");
  expect(detectFramework({ dependencies: { nuxt: "4" } })).toBe("vue");
  expect(detectFramework(undefined)).toBe("astro");
  expect(checkFramework("astro")).toBe("astro");
  expect(() => checkFramework("react")).toThrow(/not supported yet/u);
  expect(() => checkFramework("solid")).toThrow(/Unknown framework/u);
});

test("the block map renderer reproduces the committed starter map", async () => {
  const committed = await readFile(new URL("src/lace/blocks.ts", starter));
  expect(renderBlockMap("src/lace/blocks.ts", builtInEntries, undefined).equals(committed)).toBe(
    true,
  );
});

test("custom blocks import their definitions module and edited maps get exact lines", () => {
  const entries = [
    ...builtInEntries.slice(0, 1),
    {
      type: "pricing-table",
      component: "src/components/lace/PricingTableBlock.astro",
      definitionExport: "pricingTable",
    },
  ];
  const map = renderBlockMap("src/lace/blocks.ts", entries, "src/lace/definitions.ts").toString();
  expect(map).toContain('import * as definitions from "./definitions";');
  expect(map).toContain(
    '  "pricing-table": { definition: definitions.pricingTable, component: PricingTableBlock },',
  );
  expect(customComponentFile("pricing-table")).toBe("PricingTableBlock.astro");
  const edited = renderBlockMap("src/lace/blocks.ts", builtInEntries.slice(0, 1), undefined)
    .toString()
    .replace("// Generated", "// Mine");
  expect(missingMapLines(edited, "src/lace/blocks.ts", entries, "src/lace/definitions.ts")).toEqual(
    [
      'import * as definitions from "./definitions";',
      'import PricingTableBlock from "../components/lace/PricingTableBlock.astro";',
      '"pricing-table": { definition: definitions.pricingTable, component: PricingTableBlock },',
    ],
  );
});

test("custom scaffolds are typed from the definition and use the hook conventions", () => {
  const source = renderCustomScaffold({
    component: "src/components/lace/FaqBlock.astro",
    definitions: "../lace.blocks.ts",
    definitionExport: "faq",
    fields: {
      question: { type: "text", required: true },
      answer: { type: "richText" },
      photo: { type: "media" },
      link: { type: "url" },
      open: { type: "boolean", defaultValue: false },
    },
  }).toString();
  expect(source).toBe(`---
import RichText from "@lacecms/astro/RichText.astro";
import type { BlockProps } from "@lacecms/render";
import type * as definitions from "../../../../lace.blocks";

type Props = BlockProps<typeof definitions.faq>;

const { block, context, data, mediaUrl } = Astro.props;
---

<section data-lace-block={block.type} data-lace-block-key={block.key}>
  <p data-lace-part="question">{data.question}</p>
  {data.answer !== undefined && <div data-lace-part="answer"><RichText context={{ block: context, fieldPath: ["answer"] }} document={data.answer} /></div>}
  {data.photo !== undefined && <img alt="" data-lace-part="photo" src={mediaUrl(data.photo)} />}
  {data.link !== undefined && <a data-lace-part="link" href={data.link}>{data.link}</a>}
  <p data-lace-part="open" data-lace-state={data.open ? "on" : "off"}>{data.open ? "Yes" : "No"}</p>
</section>
`);
});
