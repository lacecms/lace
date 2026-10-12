import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  draftEntry,
  entry,
  entryList,
  renderInRouter,
  stubClient,
} from "../../app/testing/index.js";
import { seoSiteDefaults, useSeoDefaults } from "./seo-defaults.js";

const settings = {
  blocks: [],
  fields: {},
  key: "settings",
  kind: "global",
  seoDefaults: { description: "tagline", image: "logo", siteName: "siteName", titleTemplate: null },
  version: 1,
} as unknown as ContentModelDto;

const draftOnly = {
  ...draftEntry,
  draft: { ...draftEntry.draft, fields: { siteName: "Draft name" } },
  id: "settings-1",
  model: { key: "settings", kind: "global" },
} as unknown as AdminContentEntryDto;

const published = {
  ...draftOnly,
  published: {
    ...draftOnly.draft,
    fields: { logo: "media-1", siteName: "  Lace  ", tagline: "" },
    state: "published",
  },
} as unknown as AdminContentEntryDto;

test("maps the published fields through the defaults mapping", () => {
  expect(seoSiteDefaults(settings, published)).toEqual({ image: "media-1", siteName: "Lace" });
  expect(seoSiteDefaults(settings, draftOnly)).toBeUndefined();
  expect(seoSiteDefaults(settings, undefined)).toBeUndefined();
});

function Probe({ models }: { readonly models: readonly ContentModelDto[] }) {
  const { defaults, error } = useSeoDefaults(models);
  return (
    <p>
      {error === null ? `defaults: ${JSON.stringify(defaults ?? null)}` : `error: ${error.message}`}
    </p>
  );
}

const summary = { ...entry, id: "settings-1", modelKey: "settings", title: "Site settings" };

describe("useSeoDefaults", () => {
  test("reads the published defaults global", async () => {
    renderInRouter(<Probe models={[settings]} />, {
      client: stubClient({
        listEntries: async () => entryList([summary]),
        loadEntry: async () => published,
      }),
    });
    expect(
      await screen.findByText('defaults: {"image":"media-1","siteName":"Lace"}'),
    ).toBeInTheDocument();
  });

  test("yields no defaults without a defaults global", async () => {
    renderInRouter(<Probe models={[]} />);
    expect(await screen.findByText("defaults: null")).toBeInTheDocument();
  });

  test("yields no defaults for an unsynchronized global", async () => {
    renderInRouter(<Probe models={[settings]} />, {
      client: stubClient({ listEntries: async () => entryList([]) }),
    });
    expect(await screen.findByText("defaults: null")).toBeInTheDocument();
  });

  test("yields no defaults for a draft-only global", async () => {
    let loads = 0;
    renderInRouter(<Probe models={[settings]} />, {
      client: stubClient({
        listEntries: async () => entryList([summary]),
        loadEntry: async () => {
          loads += 1;
          return draftOnly;
        },
      }),
    });
    await expect.poll(() => loads).toBe(1);
    expect(screen.getByText("defaults: null")).toBeInTheDocument();
  });

  test("reports a read error and yields no defaults", async () => {
    renderInRouter(<Probe models={[settings]} />, {
      client: stubClient({
        listEntries: async () => entryList([summary]),
        loadEntry: async () => {
          throw new Error("Unavailable");
        },
      }),
    });
    expect(await screen.findByText("error: Unavailable")).toBeInTheDocument();
  });
});
