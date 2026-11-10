import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ContentModelDto } from "@lacecms/contracts";
import { expect, test } from "vitest";
import {
  draftEntry,
  models,
  renderRoute,
  staticSessionSource,
  stubClient,
} from "../../../app/testing/index.js";

const model: ContentModelDto = {
  blockDefinitions: [
    {
      fields: { heading: { required: true, type: "text" } },
      label: "Hero",
      type: "hero",
      version: 1,
    },
  ],
  blocks: ["hero"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};
const blocks = ["First", "Second"].map((heading, index) => ({
  data: { heading },
  key: `01ARZ3NDEKTSV4RRFFQ69G5FA${index + 1}`,
  position: (index + 1) * 100,
  hidden: false,
  schemaVersion: 1,
  settings: {},
  type: "hero",
}));

test("reordering then removing and undoing targets the same block", async () => {
  const user = userEvent.setup();
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    stubClient({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, model],
        }) as never,
      loadEntry: async () => ({ ...draftEntry, draft: { ...draftEntry.draft, blocks } }),
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  const act = async (index: number, action: string) => {
    const trigger = screen.getAllByRole("button", { name: "Actions for Hero block" })[index]!;
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("menuitem", { name: action }));
  };
  await act(0, "Move down");
  expect(
    within(screen.getAllByRole("article")[1]!).getByRole("textbox", { name: "Heading" }),
  ).toHaveValue("First");
  await act(1, "Remove");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(within(screen.getByRole("article")).getByRole("textbox", { name: "Heading" })).toHaveValue(
    "Second",
  );
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(
    within(screen.getAllByRole("article")[1]!).getByRole("textbox", { name: "Heading" }),
  ).toHaveValue("First");
});
