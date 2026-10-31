import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter } from "../../../app/testing/index.js";
import { MediaToolbar } from "./index.js";

function setup(overrides: Partial<Parameters<typeof MediaToolbar>[0]> = {}) {
  const props = {
    onClear: vi.fn(),
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
    onTagsChange: vi.fn(),
    onTypeChange: vi.fn(),
    onViewChange: vi.fn(),
    search: "",
    sort: "-createdAt" as const,
    tags: [] as readonly string[],
    type: undefined,
    view: "grid" as const,
    ...overrides,
  };
  renderInRouter(<MediaToolbar {...props} />);
  return props;
}

test("type, view, and sort controls expose and report their state", async () => {
  const user = userEvent.setup();
  const props = setup({ type: "image/png", view: "list" });
  expect(await screen.findByRole("button", { name: "PNG" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PNG" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "WebP" }));
  expect(props.onTypeChange).toHaveBeenCalledWith("image/webp");
  await user.click(screen.getByRole("button", { name: "Grid view" }));
  expect(props.onViewChange).toHaveBeenCalledWith("grid");
  const sort = screen.getByRole("combobox", { name: "Sort media" });
  expect(sort).toHaveTextContent("Newest first");
  sort.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("option", { name: "Largest first" }));
  expect(props.onSortChange).toHaveBeenCalledWith("-size");
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(props.onClear).toHaveBeenCalled();
});

test("search reports after a pause or on submit, and clear appears only when filtered", async () => {
  const user = userEvent.setup();
  const props = setup();
  await screen.findByRole("searchbox", { name: "Search media" });
  expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  await user.type(screen.getByRole("searchbox", { name: "Search media" }), "hero{Enter}");
  expect(props.onSearchChange).toHaveBeenLastCalledWith("hero");
});

test("the view toggle is omitted when the caller does not handle views", async () => {
  renderInRouter(
    <MediaToolbar
      onClear={vi.fn()}
      onSearchChange={vi.fn()}
      onSortChange={vi.fn()}
      onTagsChange={vi.fn()}
      onTypeChange={vi.fn()}
      search=""
      sort="-createdAt"
      tags={[]}
      type={undefined}
    />,
  );
  expect(await screen.findByRole("searchbox", { name: "Search media" })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Layout" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Grid view" })).not.toBeInTheDocument();
});

test("the tag filter reports added and removed tags and offers clearing", async () => {
  const user = userEvent.setup();
  const props = setup({ tags: ["cover"] });
  const input = await screen.findByRole("combobox", { name: "Filter by tags (all must match)" });
  expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  await user.type(input, "Travel{Enter}");
  expect(props.onTagsChange).toHaveBeenLastCalledWith(["cover", "travel"]);
  await user.click(screen.getByRole("button", { name: "Remove tag cover" }));
  expect(props.onTagsChange).toHaveBeenLastCalledWith([]);
});

test("the tag filter stops at five tags", async () => {
  setup({ tags: ["a", "b", "c", "d", "e"] });
  const input = await screen.findByRole("combobox", { name: "Filter by tags (all must match)" });
  expect(input).toHaveAttribute("readonly");
  expect(input).toHaveAccessibleDescription("At most 5 tags can be combined.");
});
