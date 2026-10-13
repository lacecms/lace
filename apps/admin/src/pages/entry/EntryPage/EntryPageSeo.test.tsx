import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  draftEntry,
  entry,
  entryList,
  models,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const editor = staticSessionSource({ id: "editor-1", role: "editor" });

const posts = {
  blocks: [],
  fields: { excerpt: { label: "Excerpt", required: false, type: "textarea" } },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  seo: { description: "excerpt", image: null },
  version: 1,
} satisfies ContentModelDto;

const settings = {
  blocks: [],
  fields: {
    siteName: { label: "Site name", required: true, type: "text" },
    tagline: { label: "Tagline", required: false, type: "text" },
  },
  key: "settings",
  kind: "global",
  label: "Site settings",
  seoDefaults: { description: "tagline", image: null, siteName: "siteName", titleTemplate: null },
  version: 1,
} satisfies ContentModelDto;

const emptySeo = { canonical: null, description: null, image: null, noindex: false, title: null };

const post = (seo = {}, published = false): AdminContentEntryDto => {
  const draft = {
    ...draftEntry.draft,
    fields: { excerpt: "A short intro" },
    seo: { ...emptySeo, ...seo },
    slug: "first-post",
  };
  return {
    ...draftEntry,
    draft,
    ...(published ? { published: { ...draft, id: "pub-1", state: "published" as const } } : {}),
  };
};

const settingsEntry: AdminContentEntryDto = {
  ...draftEntry,
  draft: { ...draftEntry.draft, fields: { siteName: "Lace" }, title: "Site settings" },
  id: "settings-1",
  model: { key: "settings", kind: "global" },
  published: {
    ...draftEntry.draft,
    fields: { siteName: "Lace", tagline: "Notes on Lace" },
    id: "settings-pub",
    state: "published",
    title: "Site settings",
  },
};

function seoClient(overrides: Partial<AdminClient> = {}, loaded = post()): AdminClient {
  return client({
    listEntries: async (modelKey) =>
      modelKey === "settings"
        ? entryList([{ ...entry, id: "settings-1", modelKey: "settings", title: "Site settings" }])
        : entryList([entry]),
    listModels: async () => ({ items: [models.items[0]!, posts, settings] }) as never,
    loadBuildSite: async () => ({
      site: { id: "main", label: "Main", url: "https://example.com/" },
    }),
    loadEntry: async (entryId) => (entryId === "settings-1" ? settingsEntry : loaded),
    ...overrides,
  });
}

function saving(loaded: AdminContentEntryDto) {
  return vi.fn<AdminClient["saveDraft"]>(async (_id, input) => ({
    ...loaded,
    draft: {
      ...loaded.draft,
      revision: loaded.draft.revision + 1,
      seo: { ...emptySeo, ...input.seo } as never,
      title: input.title,
    },
  }));
}

async function openPost(user: UserEvent) {
  await screen.findByRole("heading", { name: "Edit posts" });
  return user;
}

test("edits SEO values with inherited placeholders and saves the complete group", async () => {
  const user = userEvent.setup();
  const loaded = post({ description: "Old text" });
  const saveDraft = saving(loaded);
  renderRoute("/content/posts/entry-1", editor, seoClient({ saveDraft }, loaded));
  await openPost(user);
  const card = within(screen.getByRole("region", { name: "SEO" }));
  const title = card.getByRole("textbox", { name: "SEO title" });
  await waitFor(() =>
    expect(title).toHaveAttribute("placeholder", "Uses entry title: First post | Lace"),
  );
  expect(card.getByRole("textbox", { name: "Canonical URL" })).toHaveAttribute(
    "placeholder",
    "Uses this page's URL: https://example.com/posts/first-post",
  );
  const description = card.getByRole("textbox", { name: "SEO description" });
  expect(description).toHaveValue("Old text");
  await user.clear(description);
  expect(description).toHaveAttribute("placeholder", "Uses Excerpt: A short intro");
  await user.clear(screen.getByRole("textbox", { name: "Excerpt" }));
  await user.type(screen.getByRole("textbox", { name: "Excerpt" }), "New intro");
  expect(description).toHaveAttribute("placeholder", "Uses Excerpt: New intro");
  await user.type(title, "Hello from Lace");
  await user.click(card.getByRole("switch", { name: "Hide from search engines" }));
  expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(
    "Unsaved changes",
  );
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft.mock.calls[0]![1].seo).toEqual({
    canonical: null,
    description: null,
    image: null,
    noindex: true,
    title: "Hello from Lace",
  });
  expect(await screen.findByText(/^Saved revision 3/u)).toBeInTheDocument();
  expect(card.getByRole("textbox", { name: "SEO description" })).toHaveValue("");
}, 15_000);

test("a model without SEO shows no SEO card and saves no seo key", async () => {
  const user = userEvent.setup();
  const saveDraft = saving(draftEntry);
  renderRoute("/content/posts/entry-1", editor, client({ saveDraft }));
  await openPost(user);
  expect(screen.queryByRole("region", { name: "SEO" })).not.toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Title" }), "!");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft.mock.calls[0]![1]).not.toHaveProperty("seo");
});

test("reverting unsaved SEO changes restores the published values", async () => {
  const user = userEvent.setup();
  const loaded = post({ title: "Live title" }, true);
  renderRoute("/content/posts/entry-1", editor, seoClient({}, loaded));
  await openPost(user);
  const title = screen.getByRole("textbox", { name: "SEO title" });
  await user.type(title, " changed");
  screen.getByRole("button", { name: "Entry actions" }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Revert to published" }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Revert to published?" })).getByRole(
      "button",
      { name: "Revert to published" },
    ),
  );
  await waitFor(() => expect(title).toHaveValue("Live title"));
  expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(
    /^Saved revision 2/u,
  );
});

test("a relative canonical URL blocks saving and is linked from the summary", async () => {
  const user = userEvent.setup();
  const saveDraft = saving(post());
  renderRoute("/content/posts/entry-1", editor, seoClient({ saveDraft }));
  await openPost(user);
  await user.type(screen.getByRole("textbox", { name: "Canonical URL" }), "/posts/hello");
  await user.keyboard("{Control>}s{/Control}");
  const summary = await screen.findByRole("alert", { name: /problems? to fix/u });
  await waitFor(() => expect(summary).toHaveFocus());
  await user.click(within(summary).getByRole("link", { name: "Canonical URL" }));
  expect(screen.getByRole("textbox", { name: "Canonical URL" })).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Canonical URL" })).toHaveAccessibleDescription(
    "Enter an absolute URL that starts with https:// or http://, without credentials or a # fragment.",
  );
  expect(saveDraft).not.toHaveBeenCalled();
});

test("server SEO issues appear on their controls, and a group issue as text", async () => {
  const user = userEvent.setup();
  renderRoute(
    "/content/posts/entry-1",
    editor,
    seoClient({
      saveDraft: async () => {
        throw new AdminClientError({
          issues: [
            {
              code: "invalid_seo_image",
              message: "must be a media identifier.",
              path: "/seo/image",
            },
            { code: "seo_not_allowed", message: "is not enabled.", path: "/seo" },
          ],
          message: "The draft was rejected.",
          status: 422,
        });
      },
    }),
  );
  await openPost(user);
  await user.type(screen.getByRole("textbox", { name: "SEO title" }), "Title");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  const summary = await screen.findByRole("alert", { name: /problems? to fix/u });
  expect(within(summary).getByRole("link", { name: "SEO image" })).toBeInTheDocument();
  expect(
    within(summary).getByText(
      "SEO is no longer enabled for this model. Reload the entry to continue.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Choose a media item.", { selector: "#seo-image-error" }),
  ).toHaveAttribute("role", "alert");
});

test.each([
  ["editor-1", "editor"],
  ["viewer-1", "viewer"],
] as const)(
  "the defaults global names the site defaults its fields provide (%s)",
  async (id, role) => {
    renderRoute("/content/settings/settings-1", staticSessionSource({ id, role }), seoClient());
    await screen.findByRole("heading", { name: "Edit Site settings" });
    expect(screen.getByRole("textbox", { name: "Site name" })).toHaveAccessibleDescription(
      "Site name used in search and social titles.",
    );
    expect(screen.getByRole("textbox", { name: "Tagline" })).toHaveAccessibleDescription(
      "Default description for search and social previews.",
    );
    expect(screen.queryByRole("region", { name: "SEO" })).not.toBeInTheDocument();
  },
);

test("viewers cannot mutate native SEO controls while inspecting the recursive editor", async () => {
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "viewer-1", role: "viewer" }),
    seoClient(),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  const card = within(screen.getByRole("region", { name: "SEO" }));
  for (const control of card.getAllByRole("textbox")) expect(control).toBeDisabled();
  expect(card.getByRole("switch", { name: "Hide from search engines" })).toBeDisabled();
  expect(card.queryByRole("button", { name: "Choose media for SEO image" })).toBeNull();
});

test("pending saves lock native SEO controls together with composite fields", async () => {
  const user = userEvent.setup();
  let release!: (value: AdminContentEntryDto) => void;
  const response = new Promise<AdminContentEntryDto>((resolve) => {
    release = resolve;
  });
  const saveDraft = vi.fn(() => response);
  renderRoute("/content/posts/entry-1", editor, seoClient({ saveDraft }));
  await openPost(user);
  await user.type(screen.getByRole("textbox", { name: "SEO title" }), "Changed");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox", { name: "SEO title" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Hide from search engines" })).toBeDisabled();
  release({
    ...post({ title: "Changed" }),
    draft: { ...post({ title: "Changed" }).draft, revision: 2 },
  });
  await waitFor(() => expect(screen.getByRole("textbox", { name: "SEO title" })).toBeEnabled());
});
