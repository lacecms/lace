import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import type { DraftEditorValues } from "../../../entities/content/index.js";
import type { BlockDefinitionDto } from "../block-presentation.js";
import { anchorLink, BlockSettingsPanel } from "./index.js";

const hero: BlockDefinitionDto = {
  fields: { heading: { required: false, type: "text" } },
  label: "Hero",
  type: "hero",
  version: 1,
};

const values: DraftEditorValues = {
  blocks: ["01ARZ3NDEKTSV4RRFFQ69G5FAV", "01ARZ3NDEKTSV4RRFFQ69G5FAW"].map((key, index) => ({
    anchor: index === 1 ? "faq" : "",
    className: "",
    data: {},
    hidden: false,
    key,
    position: index,
    schemaVersion: 1,
    settings: {},
    type: "hero",
  })),
  fields: {},
  title: "Home",
};

function Harness() {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  useState(() => form.reset(values));
  return (
    <BlockSettingsPanel
      control={form.control}
      definition={hero}
      error={undefined}
      index={0}
      linkBase={undefined}
      settingsError={() => undefined}
    />
  );
}

test("validates the anchor and class names as typed and offers Copy link only when valid", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const anchor = screen.getByRole("textbox", { name: "Anchor" });
  const copy = screen.getByRole("button", { name: "Copy link" });
  expect(copy).toBeDisabled();
  await user.type(anchor, "faq");
  expect(anchor).toHaveAccessibleDescription(
    expect.stringContaining("Another block in this entry already uses this anchor."),
  );
  expect(copy).toBeDisabled();
  await user.clear(anchor);
  await user.type(anchor, "pricing");
  expect(screen.queryByRole("alert")).toBe(null);
  expect(copy).toBeEnabled();
  await user.click(copy);
  // Without an entry URL the copied link is the fragment alone.
  expect(await navigator.clipboard.readText()).toBe("#pricing");

  await user.type(screen.getByRole("textbox", { name: "CSS classes" }), "1bad");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter 1 to 16 class names");
  expect(screen.getByRole("switch", { name: "Hide on site" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("an anchor link is absolute under a known entry URL and a fragment otherwise", () => {
  expect(anchorLink("https://example.com/posts/first", "pricing")).toBe(
    "https://example.com/posts/first#pricing",
  );
  expect(anchorLink(undefined, "pricing")).toBe("#pricing");
});
