import { defineBlock, field, toBlockMetadata } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  draftEntry,
  renderRoute,
  staticSessionSource,
  stubClient,
} from "../../../app/testing/index.js";

const note = defineBlock({
  type: "note",
  version: 1,
  label: "Note",
  fields: { text: field.text({ label: "Text" }) },
});
const noteBlock = {
  data: { text: "Hello" },
  hidden: false,
  key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  position: 1000,
  schemaVersion: 1,
  settings: {},
  type: "note",
};

function open(model: ContentModelDto, blocks: readonly unknown[] = []) {
  const entry = {
    ...draftEntry,
    draft: { ...draftEntry.draft, blocks, fields: { tagline: "Hi" } },
    model: { key: model.key, kind: model.kind },
  };
  renderRoute(
    `/content/${model.key}/entry-1`,
    staticSessionSource({ id: "editor-1", role: "editor" }),
    stubClient({
      listModels: async () => ({
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
        items: [model],
      }),
      loadEntry: async () => entry as never,
    }),
  );
}

const global: ContentModelDto = {
  blocks: [],
  fields: { tagline: field.text({ label: "Tagline" }) },
  key: "settings",
  kind: "global",
  label: "Site settings",
  version: 1,
};
const page: ContentModelDto = {
  blockDefinitions: [toBlockMetadata(note)],
  blocks: ["note"],
  fields: { tagline: field.text({ label: "Tagline" }) },
  key: "home",
  kind: "page",
  label: "Home",
  route: "/",
  version: 1,
};

test("a model without blocks shows its fields in the main column", async () => {
  open(global);
  const fields = await screen.findByRole("region", { name: "Fields" });
  expect(screen.queryByRole("heading", { name: "Blocks" })).toBeNull();
  expect(screen.queryByText("This model does not allow blocks.")).toBeNull();
  const details = screen.getByRole("complementary", { name: "Entry details" });
  expect(details).not.toContainElement(fields);
  expect(within(details).getByRole("region", { name: "Publication status" })).toBeVisible();
  expect(screen.queryByText(/List items/u)).toBeNull();
});

test("leftover blocks keep the Blocks section and the fields beside it", async () => {
  open({ ...global, blockDefinitions: [] }, [noteBlock]);
  expect(await screen.findByRole("heading", { name: "Blocks" })).toBeVisible();
  const details = screen.getByRole("complementary", { name: "Entry details" });
  expect(within(details).getByRole("region", { name: "Fields" })).toBeVisible();
});

test("a model with blocks keeps its fields in the right-hand column", async () => {
  open(page, [noteBlock]);
  expect(await screen.findByRole("heading", { name: "Blocks" })).toBeVisible();
  const details = screen.getByRole("complementary", { name: "Entry details" });
  expect(within(details).getByRole("region", { name: "Fields" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1, name: "Edit Home" })).toHaveClass("sr-only");
});
