import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  draftEntry,
  renderRoute,
  staticSessionSource,
  stubClient,
} from "../../app/testing/index.js";
import type { AdminClient } from "../../shared/api/index.js";

const origin = "https://preview.example.co.uk";
const id = "preview-1";

function renderPreview(viewMode: "iframe" | "new-tab", expiresAt?: string) {
  const saveDraft = vi.fn<AdminClient["saveDraft"]>();
  const createPreview = vi.fn<AdminClient["createPreview"]>();
  const router = renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor", role: "editor" }),
    stubClient({
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, slug: "first-post" },
      }),
      loadPreviewConfig: async () => ({ ready: true, origin, viewMode }),
      loadPreviewStatus: async () => ({
        id,
        revision: 1,
        state: "ready",
        createdAt: new Date(Date.now() - 10_000).toISOString(),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      }),
      saveDraft,
      createPreview,
    }),
  );
  return { router, saveDraft, createPreview };
}

function frameMessage(
  source: MessageEventSource | null,
  status: string,
  options: { origin?: string; generationId?: string; extra?: string } = {},
) {
  fireEvent(
    window,
    new MessageEvent("message", {
      source,
      origin: options.origin ?? origin,
      data: {
        type: "lace-preview-frame",
        generationId: options.generationId ?? id,
        status,
        ...(options.extra === undefined ? {} : { extra: options.extra }),
      },
    }),
  );
}

test("the separate screen opens by keyboard and returns focus without saving dirty content", async () => {
  const user = userEvent.setup();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const { router, saveDraft, createPreview } = renderPreview("new-tab", expiresAt);
  const open = await screen.findByRole("button", { name: "Open preview" });
  const input = screen.getByRole("textbox", { name: "Title" });
  await user.type(input, " unsaved");
  const location = router.state.location.href;
  open.focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: "Preview of First post" });
  const view = within(dialog);
  const heading = view.getByRole("heading", { name: "Preview of First post" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(dialog).toHaveTextContent("Captured revision 1");
  expect(dialog).toHaveTextContent("The saved draft is revision 2.");
  expect(dialog.querySelector("time")).toHaveAttribute("datetime", expiresAt);
  expect(view.queryByTitle("Draft site page")).not.toBeInTheDocument();
  const fallback = view.getByRole("link", { name: "Open in new tab" });
  expect(fallback).toHaveAttribute("href", `${origin}/access/start?return=%2Fview%2F${id}`);
  expect(fallback).toHaveAttribute("target", "_blank");
  expect(fallback).toHaveAttribute("rel", "noopener noreferrer");
  await user.tab();
  expect(view.getByRole("button", { name: "Back to editor" })).toHaveFocus();
  await user.keyboard("{Control>}s{/Control}");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(open).toHaveFocus());
  expect(router.state.location.href).toBe(location);
  expect(input).toHaveValue("First post unsaved");
  expect(saveDraft).not.toHaveBeenCalled();
  expect(createPreview).not.toHaveBeenCalled();
});

test("the frame checks the sender and generation, and recovery restarts the handoff", async () => {
  const user = userEvent.setup();
  renderPreview("iframe");
  await user.click(await screen.findByRole("button", { name: "Open preview" }));
  const view = within(await screen.findByRole("dialog"));
  const iframe = view.getByTitle<HTMLIFrameElement>("Draft site page");
  const source = iframe.contentWindow;
  expect(source).not.toBeNull();
  expect(iframe).toHaveAttribute("src", `${origin}/access/start?return=%2Fp%2F${id}%2F`);
  expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(iframe.getAttribute("sandbox")).not.toContain("allow-top-navigation");
  frameMessage(source, "sign-in", { origin: "https://other.example.co.uk" });
  frameMessage(window, "sign-in");
  frameMessage(source, "sign-in", { generationId: "another-preview" });
  frameMessage(source, "sign-in", { extra: "unexpected" });
  expect(view.getByText("Opening preview…")).toBeInTheDocument();
  frameMessage(source, "sign-in");
  expect(view.getByRole("status")).toHaveTextContent("Open in a new tab to sign in");
  expect(view.queryByTitle("Draft site page")).not.toBeInTheDocument();

  const reload = view.getByRole("button", { name: "Reload preview" });
  await user.click(reload);
  const replacement = view.getByTitle<HTMLIFrameElement>("Draft site page");
  expect(replacement.contentWindow).not.toBe(source);
  expect(replacement).toHaveAttribute("src", `${origin}/access/start?return=%2Fp%2F${id}%2F`);
  frameMessage(replacement.contentWindow, "ready");
  const narrow = view.getByRole("button", { name: "Narrow" });
  await user.click(narrow);
  expect(narrow).toHaveAttribute("aria-pressed", "true");
  expect(replacement).toHaveClass("max-w-[390px]");
  expect(view.getByTitle("Draft site page")).toBe(replacement);
  frameMessage(replacement.contentWindow, "unavailable");
  expect(view.getByRole("status")).toHaveTextContent("The preview could not be opened here");
  expect(view.getByRole("link", { name: "Open in new tab" })).toBeInTheDocument();
});

test("expiry removes the frame and closing returns focus to the preview card", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPreview("iframe", new Date(Date.now() + 30_000).toISOString());
    await user.click(await screen.findByRole("button", { name: "Open preview" }));
    const view = within(await screen.findByRole("dialog"));
    const iframe = view.getByTitle<HTMLIFrameElement>("Draft site page");
    frameMessage(iframe.contentWindow, "ready");
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(view.queryByTitle("Draft site page")).not.toBeInTheDocument();
    expect(view.getByRole("status")).toHaveTextContent("This preview has expired.");
    expect(view.getByRole("link", { name: "Open in new tab" })).toBeInTheDocument();
    await user.click(view.getByRole("button", { name: "Back to editor" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Draft preview" })).toHaveFocus(),
    );
  } finally {
    vi.useRealTimers();
  }
});
