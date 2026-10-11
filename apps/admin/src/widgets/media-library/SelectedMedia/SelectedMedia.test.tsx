import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
import { SelectedMedia } from "./index.js";

function mount(client: Partial<AdminClient>, placeholder?: typeof mediaItem) {
  const onRemove = vi.fn();
  const onReplace = vi.fn();
  const view = renderInRouter(
    <SelectedMedia
      label="Hero"
      mediaId="media-1"
      onRemove={onRemove}
      onReplace={onReplace}
      placeholder={placeholder}
    />,
    { client: stubClient(client) },
  );
  return { ...view, onRemove, onReplace };
}

test("an active selection shows its thumbnail, filename, and facts with Replace and Remove", async () => {
  const user = userEvent.setup();
  const { onRemove, onReplace } = mount({
    getMedia: async () => ({ ...mediaItem, height: 600, usage: [], width: 800 }),
  });
  expect(await screen.findByText("cover.png")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("PNG · 800 × 600 px");
  expect(document.querySelector("img")).toHaveAttribute(
    "src",
    "/api/v1/admin/media/media-1/preview",
  );
  await user.click(screen.getByRole("button", { name: "Replace media for Hero" }));
  await user.click(screen.getByRole("button", { name: "Remove media from Hero" }));
  expect(onReplace).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledTimes(1);
  expect(document.body).not.toHaveTextContent("media-1");
});

test("a pending read is labelled", async () => {
  mount({ getMedia: () => new Promise(() => {}) });
  expect(await screen.findByRole("status")).toHaveTextContent("Loading selected media…");
});

test("a just-chosen item is shown while its read is pending", async () => {
  mount({ getMedia: () => new Promise(() => {}) }, mediaItem);
  expect(await screen.findByText("cover.png")).toBeInTheDocument();
  expect(screen.queryByText("Loading selected media…")).not.toBeInTheDocument();
});

test.each([
  ["deleting", "Deletion pending", "This media is being deleted and cannot be published."],
  [
    "delete_failed",
    "Deletion failed",
    "This media is marked for deletion and cannot be published.",
  ],
] as const)("a %s selection is marked unavailable", async (status, badge, text) => {
  mount({ getMedia: async () => ({ ...mediaItem, status, usage: [] }) });
  expect(await screen.findByText(badge)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(text);
  expect(screen.getByRole("button", { name: "Replace media for Hero" })).toBeInTheDocument();
});

test("a missing selection says it no longer exists without showing its identifier", async () => {
  mount({
    getMedia: async () => {
      throw new AdminClientError({ code: "NOT_FOUND", message: "Not found", status: 404 });
    },
  });
  expect(await screen.findByText("Selected media no longer exists.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove media from Hero" })).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("media-1");
});

test("an unreadable selection offers retry", async () => {
  const user = userEvent.setup();
  let calls = 0;
  mount({
    getMedia: async () => {
      calls += 1;
      if (calls === 1) throw new AdminClientError({ message: "Media read failed", status: 500 });
      return { ...mediaItem, usage: [] };
    },
  });
  expect(await screen.findByText("Selected media could not be loaded.")).toBeInTheDocument();
  expect(screen.getByText("Media read failed")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("cover.png")).toBeInTheDocument();
});

test("an active selection shows its alt text or says it has none", async () => {
  const { queryClient } = mount({
    getMedia: async () => ({ ...mediaItem, alt: "Red bicycle", usage: [] }),
  });
  const alt = await screen.findByText("Alt text: Red bicycle");
  expect(alt).toHaveAttribute("title", "Red bicycle");
  queryClient.setQueryData(["admin", "media", "detail", "media-1"], { ...mediaItem, usage: [] });
  expect(await screen.findByText("No alt text")).toBeInTheDocument();
});

test("a selection pending deletion shows no alt text line", async () => {
  mount({
    getMedia: async () => ({ ...mediaItem, alt: "Red bicycle", status: "deleting", usage: [] }),
  });
  expect(await screen.findByText(/being deleted/)).toBeInTheDocument();
  expect(screen.queryByText(/Alt text/)).toBeNull();
});
