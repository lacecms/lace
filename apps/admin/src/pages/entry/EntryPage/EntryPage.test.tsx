import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ContentModelDto } from "@lacecms/contracts";
import {
  addBlock,
  draftEntry,
  mediaItem,
  models,
  renderRoute,
  stubClient as client,
  staticSessionSource,
  sessionFor,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("entry editor keeps an incompatible entry or failed load out of an editable form", async () => {
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      loadEntry: async () => ({ ...draftEntry, model: { key: "home", kind: "page", path: "/" } }),
    }),
  );
  expect(await screen.findByRole("heading", { name: "Entry not found" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      loadEntry: async () => Promise.reject(new AdminClientError({ message: "Not found." })),
    }),
  );
  expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
});

test("entry editor renders metadata fields, preserves blocks, suggests a slug, and saves one complete draft", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: { ...draftEntry.draft, ...input, revision: 3 },
    }),
  ) as unknown as AdminClient["saveDraft"];
  const editorModel: ContentModelDto = {
    blocks: [],
    fields: {
      date: { required: false, type: "date" as const },
      datetime: { required: false, type: "datetime" as const },
      enabled: { defaultValue: false, required: false, type: "boolean" as const },
      hero: { required: false, type: "media" as const },
      link: { required: false, type: "url" as const },
      richBody: { required: false, type: "richText" as const },
      score: { max: 5, min: 1, required: false, type: "number" as const },
      summary: { minLength: 3, required: true, type: "textarea" as const },
      teaser: { required: false, type: "text" as const },
      topic: { options: ["news", "release"], required: false, type: "select" as const },
    },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, editorModel],
        }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, fields: { summary: "Draft" } },
      }),
      saveDraft,
    }),
  );

  await screen.findByRole("heading", { name: "Edit posts" });
  expect(screen.getByLabelText("Summary")).toBeInstanceOf(HTMLTextAreaElement);
  expect(screen.getByRole("textbox", { name: "Rich Body" })).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "Enabled" })).toHaveAttribute("aria-checked", "false");
  expect(screen.getByLabelText("Score")).toHaveAttribute("type", "number");
  expect(screen.getByRole("button", { name: "Date" })).toHaveTextContent("Pick a date");
  expect(screen.getByRole("button", { name: "Datetime" })).toHaveTextContent("Pick a date");
  expect(screen.getByLabelText("Datetime time (UTC)")).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Link" })).toHaveAttribute("type", "url");
  expect(screen.getByRole("combobox", { name: "Topic" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose media for Hero" })).toBeInTheDocument();
  await user.click(screen.getByLabelText("Suggest from title"));
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Release notes");
  expect(screen.getByLabelText("Slug")).toHaveValue("release-notes");
  await user.click(screen.getByRole("switch", { name: "Enabled" }));
  screen.getByRole("combobox", { name: "Topic" }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("option", { name: "release" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(saveDraft).toHaveBeenCalledWith(
      "entry-1",
      expect.objectContaining({
        expectedRevision: 2,
        fields: expect.objectContaining({ enabled: true, topic: "release" }),
      }),
    ),
  );
  expect(await screen.findByText("Saved revision 3")).toBeInTheDocument();
}, 15_000);

test("entry editor prevents invalid local submission and keeps manual slug edits", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(async () => draftEntry);
  const editorModel: ContentModelDto = {
    blocks: [],
    fields: { summary: { minLength: 5, required: false, type: "text" as const } },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, editorModel],
        }) as never,
      saveDraft,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.click(screen.getByLabelText("Suggest from title"));
  await user.clear(screen.getByLabelText("Slug"));
  await user.type(screen.getByLabelText("Slug"), "manual-slug");
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Another post");
  expect(screen.getByLabelText("Slug")).toHaveValue("manual-slug");
  await user.click(screen.getByLabelText("Suggest from title"));
  await user.click(screen.getByLabelText("Suggest from title"));
  expect(screen.getByLabelText("Slug")).toHaveValue("another-post");
  await user.type(screen.getByLabelText("Summary"), "bad");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    await screen.findByText("Enter at least 5 characters.", { selector: "p" }),
  ).toHaveAttribute("role", "alert");
  expect(screen.getByLabelText("Summary")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("heading", { name: "There is 1 problem to fix" })).toBeInTheDocument();
  expect(saveDraft).not.toHaveBeenCalled();
});

test("a later draft save preserves the published public output", async () => {
  const user = userEvent.setup();
  const initiallyPublished = {
    ...draftEntry,
    draft: { ...draftEntry.draft, revision: 4, slug: "draft-path" },
    published: {
      ...draftEntry.draft,
      id: "published-1",
      revision: 3,
      slug: "published-path",
      state: "published" as const,
    },
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      loadEntry: async () => initiallyPublished,
      saveDraft: async (_entryId, input) =>
        ({
          ...initiallyPublished,
          draft: { ...initiallyPublished.draft, ...input, revision: 5 },
        }) as never,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Later draft");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText("Saved revision 5")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Publication status" })).toHaveTextContent(
    "/posts/published-path",
  );
  expect(screen.getByRole("region", { name: "Publication status" })).toHaveTextContent(
    "DraftRevision 5",
  );
});

test("revision conflicts retain local values until reload and copying changes nothing", async () => {
  const user = userEvent.setup();
  const loadEntry = vi
    .fn()
    .mockResolvedValueOnce(draftEntry)
    .mockResolvedValueOnce({
      ...draftEntry,
      draft: { ...draftEntry.draft, title: "Server title" },
    });
  const clipboard = { writeText: vi.fn(async () => undefined) };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      loadEntry,
      saveDraft: async () => {
        throw new AdminClientError({
          code: "CONTENT_REVISION_CONFLICT",
          message: "The draft was modified by another request.",
          status: 409,
        });
      },
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Keep local");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Draft changed elsewhere");
  expect(screen.getByLabelText("Title")).toHaveValue("Keep local");
  await user.click(screen.getByRole("button", { name: "Copy my JSON" }));
  await waitFor(() =>
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Keep local")),
  );
  expect(screen.getByLabelText("Title")).toHaveValue("Keep local");
  expect(loadEntry).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Reload server draft" }));
  await waitFor(() => expect(loadEntry).toHaveBeenCalledTimes(2));
  expect(await screen.findByLabelText("Title")).toHaveValue("Server title");
  expect(screen.queryByText("Draft changed elsewhere")).not.toBeInTheDocument();
});

test("a server-normalized media draft becomes clean after save", async () => {
  const user = userEvent.setup();
  const model: ContentModelDto = {
    blockDefinitions: [
      {
        fields: {
          alt: { required: true, type: "text" },
          caption: { required: false, type: "text" },
          media: { required: true, type: "media" },
        },
        type: "image",
        version: 1,
      },
    ],
    blocks: ["image"],
    fields: {
      heroImage: { required: false, type: "media" },
      publishedAt: { required: true, type: "date" },
    },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  const saveDraft = vi.fn(async (_id: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
    ...draftEntry,
    draft: {
      ...draftEntry.draft,
      blocks: input.blocks.map((block) => ({
        ...block,
        data: { alt: "Test image", media: mediaItem.id },
      })),
      fields: { heroImage: mediaItem.id, publishedAt: "2026-09-25" },
      revision: 3,
      slug: "media-reuse-test",
    },
  })) as unknown as AdminClient["saveDraft"];
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listMedia: async () => ({ items: [mediaItem] }),
      listModels: async () => ({
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
        items: [model],
      }),
      saveDraft,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.click(screen.getByRole("button", { name: "Choose media for Hero Image" }));
  await user.click(
    await within(screen.getByRole("dialog", { name: "Choose media for Hero Image" })).findByRole(
      "button",
      { name: "cover.png" },
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Replace media for Hero Image" }),
  ).toBeInTheDocument();
  await addBlock(user, "Image");
  await user.type(screen.getByRole("textbox", { name: "Alt" }), "Test image");
  await user.click(screen.getByRole("button", { name: "Choose media for Media" }));
  await user.click(
    await within(screen.getByRole("dialog", { name: "Choose media for Media" })).findByRole(
      "button",
      { name: "cover.png" },
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Replace media for Media" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("cover.png")).toHaveLength(2);
  await user.type(screen.getByRole("textbox", { name: "Slug" }), "media-reuse-test");
  fireEvent.change(screen.getByLabelText("Published At"), { target: { value: "2026-09-25" } });
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Saved revision 3")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
});

test("dirty entry navigation requires an explicit leave-or-stay choice without autosaving", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(async () => draftEntry);
  const editorModel: ContentModelDto = {
    blocks: [],
    fields: { summary: { required: false, type: "text" } },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, editorModel],
        }) as never,
      saveDraft,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.type(screen.getByLabelText("Summary"), "Keep this");
  await user.click(
    within(screen.getByRole("complementary", { name: "Admin navigation" })).getByRole("link", {
      name: "Content",
    }),
  );
  expect(
    await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Stay" }));
  expect(screen.getByLabelText("Summary")).toHaveValue("Keep this");
  expect(saveDraft).not.toHaveBeenCalled();
});

test("server validation issues remain on their field and keep the draft editable", async () => {
  const user = userEvent.setup();
  const editorModel: ContentModelDto = {
    blocks: [],
    fields: { summary: { required: false, type: "text" } },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, editorModel],
        }) as never,
      saveDraft: async () => {
        throw new AdminClientError({
          issues: [
            { code: "invalid_value", message: "Summary is unavailable.", path: "/fields/summary" },
          ],
          message: "The draft was rejected.",
          status: 422,
        });
      },
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.type(screen.getByLabelText("Summary"), "Retain me");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    await screen.findByText("Summary is unavailable.", { selector: "#field-fields-summary-error" }),
  ).toHaveAttribute("role", "alert");
  expect(screen.getByLabelText("Summary")).toHaveValue("Retain me");
  expect(screen.getByRole("link", { name: "Summary" })).toBeInTheDocument();
  expect(screen.queryByText("The draft was rejected.")).not.toBeInTheDocument();
  expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent("Not saved");
});

test("header actions sit in the shell header and the save shortcut saves once", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(async (_id: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
    ...draftEntry,
    draft: { ...draftEntry.draft, ...input, revision: 3 },
  })) as unknown as AdminClient["saveDraft"];
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({ saveDraft }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  const header = screen.getByRole("banner");
  const save = within(header).getByRole("button", { name: "Save draft" });
  expect(save).toBeDisabled();
  expect(within(header).getByRole("status")).toHaveTextContent("Saved revision 2");
  expect(within(screen.getByRole("main")).queryByRole("button", { name: "Save draft" })).toBe(null);
  await user.keyboard("{Control>}s{/Control}");
  expect(saveDraft).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Title"), " again");
  expect(within(header).getByRole("status")).toHaveTextContent("Unsaved changes");
  const event = new KeyboardEvent("keydown", { cancelable: true, ctrlKey: true, key: "s" });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft).toHaveBeenCalledWith(
    "entry-1",
    expect.objectContaining({ expectedRevision: 2, title: "First post again" }),
  );
  expect(await within(header).findByRole("status")).toHaveTextContent("Saved revision 3");
});

test("a failed save keeps local changes and reads as not saved", async () => {
  const user = userEvent.setup();
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      saveDraft: async () => {
        throw new AdminClientError({ message: "The Lace API could not be reached." });
      },
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.type(screen.getByLabelText("Title"), " again");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await within(screen.getByRole("banner")).findByText("Not saved")).toBeInTheDocument();
  expect(screen.getByLabelText("Title")).toHaveValue("First post again");
});

test.each(["save", "publish", "reload"] as const)(
  "expired session during %s offers sign-in recovery",
  async (action) => {
    const user = userEvent.setup();
    let expired = false;
    const expiredError = () => {
      expired = true;
      throw new AdminClientError({
        code: "AUTHENTICATION_REQUIRED",
        message: "Sign in again.",
        status: 401,
      });
    };
    const source = {
      get: async () => (expired ? null : sessionFor({ id: "admin-1", role: "admin" })),
      invalidate: vi.fn(),
    };
    let expireOnLoad = false;
    renderRoute(
      "/content/posts/entry-1",
      source,
      client({
        loadEntry: async () => {
          if (expireOnLoad) return expiredError();
          return draftEntry;
        },
        saveDraft: async () => {
          if (action === "reload")
            throw new AdminClientError({
              code: "CONTENT_REVISION_CONFLICT",
              message: "Changed elsewhere.",
              status: 409,
            });
          return expiredError();
        },
        publishEntry: async () => expiredError(),
      }),
    );
    await screen.findByRole("heading", { name: "Edit posts" });
    if (action === "publish") {
      await user.click(screen.getByRole("button", { name: "Publish" }));
      await user.click(screen.getByRole("button", { name: "Confirm publication" }));
    } else {
      await user.clear(screen.getByLabelText("Title"));
      await user.type(screen.getByLabelText("Title"), "Unsaved local title");
      await user.click(screen.getByRole("button", { name: "Save draft" }));
      if (action === "reload") {
        await screen.findByRole("heading", { name: "Draft changed elsewhere" });
        expireOnLoad = true;
        await user.click(screen.getByRole("button", { name: "Reload server draft" }));
      }
      await screen.findByRole("button", { name: "Leave without saving" });
      expect(screen.getByLabelText("Title")).toHaveValue("Unsaved local title");
      if (action === "save") {
        await user.click(screen.getByRole("button", { name: "Stay" }));
        expect(screen.getByLabelText("Title")).toHaveValue("Unsaved local title");
        await user.click(screen.getByRole("button", { name: "Save draft" }));
      }
      await user.click(await screen.findByRole("button", { name: "Leave without saving" }));
    }
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(source.invalidate).toHaveBeenCalled();
  },
);
