import type { ContentModelDto, PreviewReadinessDto, PreviewStatusDto } from "@lacecms/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  draftEntry,
  renderRoute,
  staticSessionSource,
  stubClient,
} from "../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../shared/api/index.js";

const origin = "https://preview.lace.test";
const route = "/content/posts/entry-1";
const entry = { ...draftEntry, draft: { ...draftEntry.draft, slug: "first-post" } };
const config = async (): Promise<PreviewReadinessDto> => ({
  ready: true,
  origin,
  viewMode: "new-tab",
});
const ready = {
  id: "preview-1",
  revision: 1,
  state: "ready",
  createdAt: "2026-09-20T00:00:00.000Z",
} as const;
const session = (role: "editor" | "viewer" | "admin") => staticSessionSource({ id: role, role });

function editor(overrides: Partial<AdminClient> = {}) {
  return renderRoute(
    route,
    session("editor"),
    stubClient({ loadEntry: async () => entry, loadPreviewConfig: config, ...overrides }),
  );
}

test.each(["editor", "admin"] as const)(
  "%s creates preview from the saved revision without saving or publishing",
  async (role) => {
    const user = userEvent.setup();
    let status: PreviewStatusDto = null;
    const createPreview = vi.fn<AdminClient["createPreview"]>(async (_id, input) => {
      status = { ...ready, state: "dispatched", revision: input.expectedRevision };
      return { id: ready.id, revision: input.expectedRevision };
    });
    const saveDraft = vi.fn<AdminClient["saveDraft"]>();
    const publishEntry = vi.fn<AdminClient["publishEntry"]>();
    renderRoute(
      route,
      session(role),
      stubClient({
        loadEntry: async () => entry,
        loadPreviewConfig: config,
        loadPreviewStatus: async () => status,
        createPreview,
        saveDraft,
        publishEntry,
      }),
    );
    const action = await screen.findByRole("button", { name: "Create preview" });
    await waitFor(() => expect(action).toBeEnabled());
    expect(screen.getByText("No preview yet.")).toBeInTheDocument();
    await user.click(action);
    await screen.findByText("Waiting for the preview builder…");
    expect(createPreview).toHaveBeenCalledExactlyOnceWith("entry-1", {
      expectedRevision: 2,
      idempotencyKey: expect.any(String),
    });
    expect(saveDraft).not.toHaveBeenCalled();
    expect(publishEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Open preview" })).not.toBeInTheDocument();
  },
);

test("dirty changes disable recreation while a ready preview stays openable", async () => {
  const user = userEvent.setup();
  const createPreview = vi.fn<AdminClient["createPreview"]>();
  editor({ loadPreviewStatus: async () => ready, createPreview });
  const recreate = await screen.findByRole("button", { name: "Recreate preview" });
  const input = screen.getByRole("textbox", { name: "Title" });
  await user.type(input, " unsaved");
  expect(recreate).toBeDisabled();
  expect(
    screen.getByText("Save or discard your changes before creating a preview."),
  ).toBeInTheDocument();
  const open = screen.getByRole("button", { name: "Open preview" });
  await user.click(open);
  const preview = await screen.findByRole("dialog", { name: "Preview of First post" });
  await user.click(within(preview).getByRole("button", { name: "Back to editor" }));
  expect(input).toHaveValue("First post unsaved");
  expect(createPreview).not.toHaveBeenCalled();
});

test("a viewer can open a ready preview and sees no mutation controls", async () => {
  const user = userEvent.setup();
  renderRoute(
    route,
    session("viewer"),
    stubClient({
      loadEntry: async () => entry,
      loadPreviewConfig: config,
      loadPreviewStatus: async () => ready,
    }),
  );
  const panel = await screen.findByRole("region", { name: "Draft preview" });
  await user.click(await within(panel).findByRole("button", { name: "Open preview" }));
  expect(within(panel).queryByRole("button", { name: "Recreate preview" })).not.toBeInTheDocument();
  expect(await screen.findByRole("dialog", { name: "Preview of First post" })).toBeInTheDocument();
});

test("missing config hides preview actions and skips the status read", async () => {
  const loadPreviewConfig = vi
    .fn<AdminClient["loadPreviewConfig"]>()
    .mockResolvedValue({ ready: false });
  const loadPreviewStatus = vi.fn<AdminClient["loadPreviewStatus"]>().mockResolvedValue(null);
  editor({ loadPreviewConfig, loadPreviewStatus });
  await waitFor(() => expect(loadPreviewConfig).toHaveBeenCalled());
  expect(loadPreviewStatus).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Draft preview" })).not.toBeInTheDocument();
});

test("route-less entries do not load preview configuration", async () => {
  const loadPreviewConfig = vi.fn(config);
  const routeLess: ContentModelDto = {
    kind: "collection",
    key: "notes",
    blocks: [],
    fields: {},
    version: 1,
  };
  renderRoute(
    "/content/notes/entry-1",
    session("editor"),
    stubClient({
      listModels: async () => ({
        items: [routeLess],
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
      }),
      loadEntry: async () => ({ ...draftEntry, model: { key: "notes", kind: "collection" } }),
      loadPreviewConfig,
    }),
  );
  await screen.findByRole("heading", { name: "Edit notes" });
  expect(loadPreviewConfig).not.toHaveBeenCalled();
});

test("retry is manual and uses the current saved revision after a failed preview", async () => {
  const user = userEvent.setup();
  const status = {
    ...ready,
    revision: 2,
    state: "failed",
    reason: "PREVIEW_RENDER_FAILED",
  } as const;
  const createPreview = vi.fn<AdminClient["createPreview"]>().mockRejectedValueOnce(
    new AdminClientError({
      code: "PREVIEW_REVISION_CONFLICT",
      status: 409,
      message: "Raw request diagnostic",
      requestId: "race-1",
    }),
  );
  const saveDraft = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => ({
    ...entry,
    draft: { ...entry.draft, revision: 3, title: input.title },
  }));
  editor({
    loadPreviewStatus: async () => status,
    createPreview,
    saveDraft,
  });
  const retry = await screen.findByRole("button", { name: "Retry preview" });
  await user.type(screen.getByRole("textbox", { name: "Title" }), " revised");
  expect(retry).toBeDisabled();
  expect(saveDraft).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(retry).toBeEnabled());
  expect(screen.getByText("The saved draft is revision 3.")).toBeInTheDocument();
  expect(createPreview).not.toHaveBeenCalled();
  await user.click(retry);
  expect(await screen.findByRole("alert")).toHaveTextContent("The saved draft changed.");
  expect(screen.getByRole("alert")).toHaveTextContent("Request ID race-1");
  expect(screen.queryByText("Raw request diagnostic")).not.toBeInTheDocument();
  expect(createPreview).toHaveBeenCalledExactlyOnceWith("entry-1", {
    expectedRevision: 3,
    idempotencyKey: expect.any(String),
  });
});

async function advanceTime(milliseconds: number) {
  await act(() => vi.advanceTimersByTimeAsync(milliseconds));
}

test("polling follows preparation, provider waiting and building through readiness without opening or mutating", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
  try {
    const loadPreviewStatus = vi
      .fn<AdminClient["loadPreviewStatus"]>()
      .mockResolvedValueOnce({ ...ready, state: "preparing" })
      .mockResolvedValueOnce({ ...ready, state: "dispatched" })
      .mockResolvedValueOnce({ ...ready, state: "running" })
      .mockResolvedValue(ready);
    const createPreview = vi.fn<AdminClient["createPreview"]>();
    const saveDraft = vi.fn<AdminClient["saveDraft"]>();
    editor({ loadPreviewStatus, createPreview, saveDraft });
    const panel = within(await screen.findByRole("region", { name: "Draft preview" }));
    await panel.findByText("Preparing preview…");
    expect(panel.getByText("Preview revision 1")).toBeInTheDocument();
    expect(panel.getByText("The saved draft is revision 2.")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Create preview" })).toBeDisabled();
    await advanceTime(5_000);
    await panel.findByText("Waiting for the preview builder…");
    expect(panel.queryByRole("button", { name: "Open preview" })).not.toBeInTheDocument();
    await advanceTime(5_000);
    await panel.findByText("Building preview…");
    expect(panel.queryByRole("button", { name: "Open preview" })).not.toBeInTheDocument();
    await advanceTime(5_000);
    await panel.findByText("Preview ready.");
    expect(panel.getByRole("button", { name: "Open preview" })).toBeInTheDocument();
    await advanceTime(15_000);
    expect(loadPreviewStatus).toHaveBeenCalledTimes(4);
    expect(openWindow).not.toHaveBeenCalled();
    expect(createPreview).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
  } finally {
    openWindow.mockRestore();
    vi.useRealTimers();
  }
});

test.each([
  [{ state: "failed", reason: "PREVIEW_SOURCE_UNAVAILABLE" }, /check the configured site source/u],
  [{ state: "timed_out" }, /Preview timed out/u],
  [{ state: "invalidated" }, /This preview was invalidated/u],
  [{ state: "expired" }, /This preview has expired/u],
] as const)("polling stops at $state", async (terminal, message) => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const loadPreviewStatus = vi
      .fn<AdminClient["loadPreviewStatus"]>()
      .mockResolvedValueOnce({ ...ready, state: "running" })
      .mockResolvedValue({ ...ready, ...terminal });
    const createPreview = vi.fn<AdminClient["createPreview"]>();
    editor({ loadPreviewStatus, createPreview });
    const panel = within(await screen.findByRole("region", { name: "Draft preview" }));
    await panel.findByText("Building preview…");
    await advanceTime(5_000);
    await panel.findByText(message);
    expect(panel.queryByRole("button", { name: "Open preview" })).not.toBeInTheDocument();
    await advanceTime(15_000);
    expect(loadPreviewStatus).toHaveBeenCalledTimes(2);
    expect(createPreview).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("ready metadata expires in the open editor without periodic requests", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    const readyAt = new Date(Date.parse(expiresAt) - 24 * 60 * 60_000).toISOString();
    const loadPreviewStatus = vi
      .fn<AdminClient["loadPreviewStatus"]>()
      .mockResolvedValue({ ...ready, readyAt, expiresAt });
    editor({ loadPreviewStatus });
    const panel = within(await screen.findByRole("region", { name: "Draft preview" }));
    await panel.findByRole("button", { name: "Open preview" });
    const card = screen.getByRole("region", { name: "Draft preview" });
    expect(card.querySelector(`time[datetime="${readyAt}"]`)).toBeInTheDocument();
    const expiry = card.querySelector(`time[datetime="${expiresAt}"]`);
    expect(expiry?.parentElement).toHaveTextContent(/^Expires /u);
    await advanceTime(30_000);
    expect(expiry?.parentElement).toHaveTextContent(/^Expired /u);
    expect(panel.getByRole("status")).toHaveTextContent("This preview has expired.");
    expect(panel.queryByRole("button", { name: "Open preview" })).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Create preview" })).toBeEnabled();
    expect(loadPreviewStatus).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test("a failed status read pauses polling and allows a manual refresh", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const loadPreviewStatus = vi
      .fn<AdminClient["loadPreviewStatus"]>()
      .mockResolvedValueOnce({ ...ready, state: "running" })
      .mockRejectedValueOnce(new Error("Raw transport diagnostic"))
      .mockResolvedValue(ready);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    editor({ loadPreviewStatus });
    const panel = within(await screen.findByRole("region", { name: "Draft preview" }));
    await panel.findByText("Building preview…");
    await advanceTime(5_000);
    expect(await panel.findByRole("alert")).toHaveTextContent(
      "Preview status could not be loaded.",
    );
    expect(panel.queryByText("Raw transport diagnostic")).not.toBeInTheDocument();
    await advanceTime(15_000);
    expect(loadPreviewStatus).toHaveBeenCalledTimes(2);
    await user.click(panel.getByRole("button", { name: "Refresh preview status" }));
    expect(await panel.findByRole("button", { name: "Open preview" })).toBeInTheDocument();
    expect(loadPreviewStatus).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

test("active polling has a fixed time budget", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const loadPreviewStatus = vi
      .fn<AdminClient["loadPreviewStatus"]>()
      .mockResolvedValue({ ...ready, state: "running" });
    editor({ loadPreviewStatus });
    const panel = within(await screen.findByRole("region", { name: "Draft preview" }));
    await panel.findByText("Building preview…");
    await advanceTime(15 * 60_000);
    const calls = loadPreviewStatus.mock.calls.length;
    expect(calls).toBeGreaterThan(2);
    expect(calls).toBeLessThanOrEqual(181);
    await advanceTime(30_000);
    expect(loadPreviewStatus).toHaveBeenCalledTimes(calls);
    expect(panel.getByRole("button", { name: "Refresh preview status" })).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});

test("publication-grade preview validation focuses the existing field summary", async () => {
  const user = userEvent.setup();
  const createPreview = vi.fn<AdminClient["createPreview"]>().mockRejectedValue(
    new AdminClientError({
      message: "Preview validation failed",
      status: 422,
      code: "VALIDATION_FAILED",
      issues: [{ code: "missing_required_field", path: "/title", message: "Title required" }],
    }),
  );
  editor({ createPreview });
  await user.click(await screen.findByRole("button", { name: "Create preview" }));
  const summary = await screen.findByRole("heading", { name: "There is 1 problem to fix" });
  await waitFor(() => expect(summary.closest("section")).toHaveFocus());
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("aria-invalid", "true");
});

test("a saved collection draft without a slug cannot create a preview", async () => {
  const createPreview = vi.fn<AdminClient["createPreview"]>();
  editor({ loadEntry: async () => draftEntry, createPreview });
  expect(await screen.findByRole("button", { name: "Create preview" })).toBeDisabled();
  expect(
    screen.getByText("Save a draft with a site route to create a preview."),
  ).toBeInTheDocument();
  expect(createPreview).not.toHaveBeenCalled();
});

test("an unsaved new entry only offers saving the draft", async () => {
  const user = userEvent.setup();
  const loadPreviewConfig = vi.fn(config);
  renderRoute("/content/posts", session("editor"), stubClient({ loadPreviewConfig }));
  await user.click(await screen.findByRole("button", { name: /Create entry/ }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "New draft");
  expect(within(dialog).queryByRole("button", { name: /preview/iu })).not.toBeInTheDocument();
  expect(loadPreviewConfig).not.toHaveBeenCalled();
});
