import type { MediaTagCatalogDto } from "@lacecms/contracts";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { invalidTagMessage, isOpenTagCombobox, MediaTagInput } from "./MediaTagInput.js";

const catalog: MediaTagCatalogDto = {
  items: [
    { count: 5, tag: "portrait" },
    { count: 3, tag: "project-2026" },
  ],
};

function Harness({
  initial = [],
  limit = 20,
  onChange,
  variant,
}: {
  readonly initial?: readonly string[];
  readonly limit?: number;
  readonly onChange?: (tags: readonly string[]) => void;
  readonly variant?: "field" | "inline";
}) {
  const [tags, setTags] = useState(initial);
  return (
    <MediaTagInput
      {...(variant === "inline"
        ? { describedBy: "rule", placeholder: "Filter by tag", variant: "inline" as const }
        : {})}
      label="Tags"
      limit={limit}
      limitMessage={`An item can have at most ${limit} tags.`}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
      tags={tags}
    />
  );
}

function setup(
  element = <Harness />,
  listMediaTags: (query?: { q?: string }) => Promise<MediaTagCatalogDto> = async (query) => ({
    items: catalog.items.filter((item) => item.tag.startsWith(query?.q ?? "")),
  }),
) {
  const spy = vi.fn(listMediaTags);
  renderInRouter(element, { client: stubClient({ listMediaTags: spy }) });
  return { listMediaTags: spy, user: userEvent.setup() };
}

const chips = () =>
  screen.queryByRole("list", { name: "Tags: chosen tags" })
    ? screen
        .getAllByRole("button", { name: /^Remove tag / })
        .map((button) => button.getAttribute("aria-label")!.replace("Remove tag ", ""))
    : [];

test("a keyboard user adds a suggested tag with its count", async () => {
  const { listMediaTags, user } = setup();
  const input = await screen.findByRole("combobox", { name: "Tags" });
  await user.type(input, "pro");
  await waitFor(() => expect(listMediaTags).toHaveBeenCalledWith({ limit: 10, q: "pro" }));
  const option = await screen.findByRole("option", { name: "project-2026, 3 items" });
  expect(screen.queryByRole("option", { name: /portrait/ })).toBeNull();
  await user.keyboard("{ArrowDown}");
  expect(input).toHaveAttribute("aria-activedescendant", option.id);
  await user.keyboard("{Enter}");
  expect(chips()).toEqual(["project-2026"]);
  expect(input).toHaveValue("");
  expect(screen.getByText("Added tag project-2026.")).toBeInTheDocument();
});

test("typed text is normalized, deduplicated, and sorted", async () => {
  const onChange = vi.fn();
  const { user } = setup(<Harness initial={["travel"]} onChange={onChange} />);
  const input = await screen.findByRole("combobox", { name: "Tags" });
  await user.type(input, " Cover-Shot {Enter}");
  expect(onChange).toHaveBeenLastCalledWith(["cover-shot", "travel"]);
  await user.type(input, "TRAVEL{Enter}");
  expect(chips()).toEqual(["cover-shot", "travel"]);
  expect(input).toHaveValue("");
  expect(screen.getByText("Tag travel is already added.")).toBeInTheDocument();
});

test("invalid text is explained and kept without a request", async () => {
  const { listMediaTags, user } = setup();
  const input = await screen.findByRole("combobox", { name: "Tags" });
  await user.type(input, "summer trip{Enter}");
  expect(chips()).toEqual([]);
  expect(input).toHaveValue("summer trip");
  expect(screen.getByRole("alert")).toHaveTextContent(invalidTagMessage);
  expect(input).toHaveAttribute("aria-invalid", "true");
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(listMediaTags).not.toHaveBeenCalledWith(expect.objectContaining({ q: "summer trip" }));
});

test("a comma adds the tag before it", async () => {
  const { user } = setup();
  const input = await screen.findByRole("combobox", { name: "Tags" });
  await user.type(input, "travel,");
  expect(chips()).toEqual(["travel"]);
  expect(input).toHaveValue("");
});

test("Backspace in an empty input removes the last chip", async () => {
  const { user } = setup(<Harness initial={["cover", "travel"]} />);
  const input = await screen.findByRole("combobox", { name: "Tags" });
  await user.click(input);
  await user.keyboard("{Backspace}");
  expect(chips()).toEqual(["cover"]);
  expect(screen.getByText("Removed tag travel.")).toBeInTheDocument();
});

test("remove buttons are named after their tags and return focus to the input", async () => {
  const { user } = setup(<Harness initial={["cover", "travel"]} />);
  await user.click(await screen.findByRole("button", { name: "Remove tag cover" }));
  expect(chips()).toEqual(["travel"]);
  expect(screen.getByRole("combobox", { name: "Tags" })).toHaveFocus();
});

test("Escape closes open suggestions and marks only an open combobox", async () => {
  const { user } = setup();
  const input = await screen.findByRole("combobox", { name: "Tags" });
  await user.click(input);
  await screen.findByRole("option", { name: "portrait, 5 items" });
  expect(input).toHaveAttribute("aria-expanded", "true");
  expect(isOpenTagCombobox(input)).toBe(true);
  await user.keyboard("{Escape}");
  expect(input).toHaveAttribute("aria-expanded", "false");
  expect(isOpenTagCombobox(input)).toBe(false);
  expect(isOpenTagCombobox(document.body)).toBe(false);
});

test("at the limit the input accepts no text and states the limit", async () => {
  const { user } = setup(<Harness initial={["a", "b"]} limit={2} />);
  const input = await screen.findByRole("combobox", { name: "Tags" });
  expect(input).toHaveAttribute("readonly");
  expect(input).toHaveAccessibleDescription("An item can have at most 2 tags.");
  await user.click(input);
  await user.keyboard("{Backspace}");
  expect(chips()).toEqual(["a"]);
  expect(input).not.toHaveAttribute("readonly");
});

test("failed suggestions never block adding a tag", async () => {
  const { user } = setup(<Harness />, async () => {
    throw new Error("offline");
  });
  const input = await screen.findByRole("combobox", { name: "Tags" });
  await user.click(input);
  await screen.findByText("Suggestions are unavailable. You can still type a tag.");
  await user.type(input, "cover{Enter}");
  expect(chips()).toEqual(["cover"]);
  await waitFor(() =>
    expect(input).toHaveAccessibleDescription(
      "Suggestions are unavailable. You can still type a tag.",
    ),
  );
});

test("suggestions exclude chosen tags and a click adds one", async () => {
  const { user } = setup(<Harness initial={["portrait"]} />);
  await user.click(await screen.findByRole("combobox", { name: "Tags" }));
  await user.click(await screen.findByRole("option", { name: "project-2026, 3 items" }));
  expect(screen.queryByRole("option", { name: /portrait/ })).toBeNull();
  expect(chips()).toEqual(["portrait", "project-2026"]);
});

test("the inline variant keeps chips inside one field with a hidden label", async () => {
  const { user } = setup(
    <>
      <Harness initial={["cover", "travel"]} variant="inline" />
      <span id="rule">Items must have all tags</span>
    </>,
  );
  const input = await screen.findByRole("combobox", { name: "Tags" });
  expect(screen.getByText("Tags")).toHaveClass("sr-only");
  expect(input).toHaveAttribute("placeholder", "Filter by tag");
  expect(input).toHaveAccessibleDescription("Items must have all tags");
  const chips = screen.getByRole("list", { name: "Tags: chosen tags" });
  expect(chips.parentElement).toBe(input.parentElement);
  await user.click(input);
  await user.keyboard("{Backspace}");
  expect(screen.queryByText("travel")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove tag cover" }));
  expect(input).toHaveFocus();
  await user.type(input, "pro");
  await screen.findByRole("option", { name: "project-2026, 3 items" });
  await user.keyboard("{ArrowDown}{Enter}");
  expect(await screen.findByRole("button", { name: "Remove tag project-2026" })).toBeVisible();
});

test("the field variant keeps its visible label and chips above the input", async () => {
  setup(<Harness initial={["cover"]} />);
  const input = await screen.findByRole("combobox", { name: "Tags" });
  expect(screen.getByText("Tags")).not.toHaveClass("sr-only");
  expect(input).toHaveAttribute("placeholder", "Add a tag");
  expect(screen.getByRole("list", { name: "Tags: chosen tags" }).parentElement).not.toBe(
    input.parentElement,
  );
});
