import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { EntryListToolbar } from "./index.js";

const totals = { all: 4, changed: 1, draft: 1, published: 2 };

function renderToolbar(props: Partial<Parameters<typeof EntryListToolbar>[0]> = {}) {
  const handlers = { onClear: vi.fn(), onSearchChange: vi.fn(), onStatusChange: vi.fn() };
  const view = render(
    <EntryListToolbar search="" status={undefined} totals={totals} {...handlers} {...props} />,
  );
  return { ...handlers, view };
}

test("search is reported once after typing pauses and immediately on submit", async () => {
  const user = userEvent.setup();
  const { onSearchChange } = renderToolbar();
  const box = screen.getByRole("searchbox", { name: "Search entries" });

  await user.type(box, "launch");
  expect(onSearchChange).not.toHaveBeenCalled();
  await waitFor(() => expect(onSearchChange).toHaveBeenCalledWith("launch"));
  expect(onSearchChange).toHaveBeenCalledTimes(1);

  await user.type(box, "{Enter}");
  expect(onSearchChange).toHaveBeenLastCalledWith("launch");
});

test("status buttons show totals, mark the active filter, and clear appears with filters", async () => {
  const user = userEvent.setup();
  const { onClear, onStatusChange, view } = renderToolbar();
  expect(screen.getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Published 2" }));
  expect(onStatusChange).toHaveBeenCalledWith("published");

  view.rerender(
    <EntryListToolbar
      onClear={onClear}
      onSearchChange={vi.fn()}
      onStatusChange={onStatusChange}
      search="launch"
      status="published"
      totals={undefined}
    />,
  );
  expect(screen.getByRole("searchbox", { name: "Search entries" })).toHaveValue("launch");
  expect(screen.getByRole("button", { name: "Published" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "All" }));
  expect(onStatusChange).toHaveBeenLastCalledWith(undefined);
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(onClear).toHaveBeenCalledTimes(1);
});

test("over-budget drafts stay editable without debounce requests and recover when valid", async () => {
  const user = userEvent.setup();
  const { onSearchChange } = renderToolbar({
    limits: { maxSearchLength: 48, maxLikePatternBytes: 50 },
  });
  const box = screen.getByRole("searchbox", { name: "Search entries" });
  await user.type(box, "я".repeat(25));
  await user.keyboard("{Enter}");
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(onSearchChange).not.toHaveBeenCalled();
  expect(box).toHaveValue("я".repeat(25));
  expect(screen.getByRole("alert")).toHaveTextContent("50 UTF-8 bytes");
  await user.keyboard("{Backspace}");
  await waitFor(() => expect(onSearchChange).toHaveBeenCalledWith("я".repeat(24)));
});
