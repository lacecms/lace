import { screen, waitFor, within } from "@testing-library/react";
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

const settingsModel: ContentModelDto = {
  blocks: [],
  description: "Name and tagline shown on every page.",
  fields: {
    siteName: { label: "Site name", required: true, type: "text" },
    tagline: { label: "Tagline", required: false, type: "text" },
  },
  key: "settings",
  kind: "global",
  label: "Site settings",
  version: 1,
};
const settingsEntry = {
  ...draftEntry,
  draft: {
    ...draftEntry.draft,
    entryId: "settings-1",
    fields: { siteName: "Lace", tagline: "Old tagline" },
    title: "Site settings",
  },
  id: "settings-1",
  model: { key: "settings", kind: "global" as const },
};

test("a global editor shows site content without title, slug, or public URL", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn<AdminClient["saveDraft"]>(
    async (_entryId, input) =>
      ({ ...settingsEntry, draft: { ...settingsEntry.draft, ...input, revision: 3 } }) as never,
  );
  const published = {
    ...settingsEntry,
    published: { ...settingsEntry.draft, id: "published-1", state: "published" as const },
  };
  renderRoute(
    "/content/settings/settings-1",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      listModels: async () => ({
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
        items: [...models.items, settingsModel],
      }),
      loadBuildSite: async () => ({
        site: { id: "main-site", label: "Main site", url: "https://example.com/" },
      }),
      loadEntry: async () => published,
      saveDraft,
    }),
  );
  expect(await screen.findByRole("heading", { name: "Edit Site settings" })).toBeInTheDocument();
  expect(screen.getByText("Name and tagline shown on every page.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Slug")).not.toBeInTheDocument();
  const publication = screen.getByRole("region", { name: "Publication status" });
  expect(publication).not.toHaveTextContent("Public URL");
  expect(within(publication).queryByRole("link", { name: /on site/ })).not.toBeInTheDocument();

  await user.clear(screen.getByLabelText(/Site name/));
  await user.type(screen.getByLabelText(/Site name/), "Lace Journal");
  await user.click(screen.getByRole("button", { name: "Save and publish" }));
  const dialog = await screen.findByRole("dialog", { name: "Save and publish this site content?" });
  expect(dialog).toHaveTextContent(
    "It affects every page that shows it after the next site build.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  const input = saveDraft.mock.calls[0]?.[1];
  expect(input?.title).toBe("Site settings");
  expect(input).not.toHaveProperty("slug");
  expect(input?.fields).toEqual({ siteName: "Lace Journal", tagline: "Old tagline" });
  expect(await screen.findByText("Saved revision 3")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Publish" }));
  const publish = await screen.findByRole("dialog", { name: "Publish this site content?" });
  expect(publish).toHaveTextContent(
    "Draft revision 3 becomes the public version. It affects every page that shows it after the next site build.",
  );
});
