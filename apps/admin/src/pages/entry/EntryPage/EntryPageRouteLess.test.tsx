import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ContentModelDto } from "@lacecms/contracts";
import {
  draftEntry,
  models,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import type { AdminClient } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const testimonials: ContentModelDto = {
  blocks: [],
  fields: { quote: { required: true, type: "textarea" as const } },
  key: "testimonials",
  kind: "collection",
  version: 1,
};

test("a route-less entry editor has no slug or public path and saves without a slug", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: { ...draftEntry.draft, ...input, revision: 3 },
      model: { key: "testimonials", kind: "collection" as const },
    }),
  ) as unknown as AdminClient["saveDraft"];
  const draft = draftEntry.draft;
  renderRoute(
    "/content/testimonials/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, testimonials],
        }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draft, fields: { quote: "Great" } },
        model: { key: "testimonials", kind: "collection" as const },
      }),
      saveDraft,
    }),
  );
  await screen.findByRole("heading", { name: "Edit testimonials" });
  expect(screen.queryByLabelText("Slug")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Suggest from title")).not.toBeInTheDocument();
  expect(screen.queryByText("Public URL")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Quote")).toHaveValue("Great");
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Ada");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalled());
  const input = (saveDraft as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1];
  expect(input).toMatchObject({ title: "Ada" });
  expect(input).not.toHaveProperty("slug");
}, 15_000);
