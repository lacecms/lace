import { useState } from "react";
import { defineBlock, field, toBlockMetadata } from "@lacecms/content";
import { render, screen, within, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import { FieldRendererProvider, type DraftEditorValues } from "../../../entities/content/index.js";
import { BlockSettingsFields } from "./index.js";

const definition = (tabs = false) =>
  toBlockMetadata(
    defineBlock({
      type: "unrelated",
      version: 1,
      fields: {},
      settings: {
        style: field.select({
          required: true,
          defaultValue: "tiles",
          label: "Arrangement",
          options: ["flow", "stack", "tiles"],
          presentation: {
            control: "cards",
            choices: [
              { value: "flow", label: "Flow" },
              { value: "stack", label: "Stack" },
              { value: "tiles", label: "Tiles" },
            ],
          },
        }),
        wrap: field.boolean({ defaultValue: true, label: "Allow wrap" }),
        density: field.select({
          required: true,
          defaultValue: "dense",
          label: "Density",
          options: ["dense", "loose"],
          presentation: {
            control: "cards",
            choices: [
              { value: "dense", label: "Dense" },
              { value: "loose", label: "Loose" },
            ],
          },
        }),
      },
      settingsVisibility: {
        wrap: { setting: "style", values: ["flow", "stack"] },
        density: { setting: "style", values: ["tiles"] },
      },
      settingsLayout: {
        mode: tabs ? "tabs" : "sections",
        groups: [
          { key: "mode", label: "Mode section", fields: ["style"] },
          { key: "wrap", label: "Wrap section", fields: ["wrap"] },
          { key: "density", label: "Density section", fields: ["density"] },
        ],
      },
    }),
  );
function Harness({
  tabs = false,
  readOnly = false,
  hidden = false,
  missingMode = false,
  busy = false,
}: {
  readonly tabs?: boolean;
  readonly readOnly?: boolean;
  readonly hidden?: boolean;
  readonly missingMode?: boolean;
  readonly busy?: boolean;
}) {
  const values: DraftEditorValues = {
    title: "",
    fields: {},
    blocks: [0, 1].map((index) => ({
      key: `b-${index}`,
      type: "unrelated",
      schemaVersion: 1,
      position: index,
      hidden,
      data: {},
      settings: {
        ...(!missingMode ? { style: index === 0 ? "tiles" : "flow" } : {}),
        wrap: true,
        density: "dense",
      },
    })),
  };
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { title: "", fields: {}, blocks: [] },
  });
  useState(() => form.reset(values));
  const watched = form.watch();
  return (
    <FieldRendererProvider busy={busy} form={form} readOnly={readOnly} renderers={{}}>
      {[0, 1].map((index) => (
        <section aria-label={`Block ${index}`} key={index}>
          <BlockSettingsFields control={form.control} definition={definition(tabs)} index={index} />
        </section>
      ))}
      <button
        onClick={() =>
          form.setError("blocks.0.settings.wrap", {
            type: "server",
            message: "Invalid stored wrap",
          })
        }
      >
        Wrap error
      </button>
      <button
        onClick={() =>
          form.setError("blocks.0.settings.wrap", {
            type: "publication",
            message: "Publication only",
          })
        }
      >
        Publication error
      </button>
      <button
        onClick={() =>
          form.setError("blocks.0.settings.density", {
            type: "server",
            message: "Invalid stored density",
          })
        }
      >
        Density error
      </button>
      <button onClick={() => form.clearErrors()}>Clear problems</button>
      <button onClick={() => form.setValue("blocks.0.settings.style", "flow")}>
        Set flow externally
      </button>
      <output>{JSON.stringify(watched.blocks.map((block) => block.settings))}</output>
    </FieldRendererProvider>
  );
}
test("generic visibility reacts in each block and retains hidden values and DOM identity", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness />);
  const first = within(screen.getByRole("region", { name: "Block 0" }));
  const second = within(screen.getByRole("region", { name: "Block 1" }));
  const wrap = container.querySelector("#field-blocks-0-settings-wrap");
  expect(first.queryByRole("switch", { name: "Allow wrap" })).not.toBeInTheDocument();
  expect(first.getByRole("radio", { name: "Dense" })).toBeChecked();
  expect(second.getByRole("switch", { name: "Allow wrap" })).toBeChecked();
  await user.click(first.getByRole("radio", { name: "Loose" }));
  for (const mode of ["Flow", "Stack"]) {
    await user.click(first.getByRole("radio", { name: mode }));
    expect(first.queryByRole("radio", { name: "Loose" })).not.toBeInTheDocument();
    expect(first.getByRole("switch", { name: "Allow wrap" })).toBe(wrap);
  }
  await user.click(first.getByRole("switch", { name: "Allow wrap" }));
  await user.click(first.getByRole("radio", { name: "Tiles" }));
  expect(first.getByRole("radio", { name: "Loose" })).toBeChecked();
  expect(screen.getByRole("status")).toHaveTextContent('"wrap":false,"density":"loose"');
  expect(second.getByRole("switch", { name: "Allow wrap" })).toBeChecked();
});
test("absent controller uses the descriptor default without creating values", () => {
  render(<Harness missingMode />);
  const first = within(screen.getByRole("region", { name: "Block 0" }));
  expect(first.getByRole("radio", { name: "Dense" })).toBeVisible();
  expect(first.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).not.toHaveTextContent('"style"');
});
test("empty tabs disappear while controls remain mounted and tab selection falls back", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness tabs />);
  const first = within(screen.getByRole("region", { name: "Block 0" }));
  expect(first.queryByRole("tab", { name: "Wrap section" })).not.toBeInTheDocument();
  await user.click(first.getByRole("tab", { name: "Density section" }));
  const density = container.querySelector("#field-blocks-0-settings-density");
  await user.click(screen.getByRole("button", { name: "Set flow externally" }));
  expect(first.getByRole("tab", { name: "Mode section" })).toHaveAttribute("aria-selected", "true");
  expect(first.queryByRole("tab", { name: "Density section" })).not.toBeInTheDocument();
  expect(density?.isConnected).toBe(true);
  expect(screen.getByRole("button", { name: "Set flow externally" })).toHaveFocus();
});
test("hidden switch/card errors reveal controls and correction restores visibility", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const first = within(screen.getByRole("region", { name: "Block 0" }));
  await user.click(screen.getByRole("button", { name: "Wrap error" }));
  expect(first.getByRole("switch", { name: "Allow wrap" })).toHaveAccessibleDescription(
    /Shown to resolve/,
  );
  await user.click(first.getByRole("switch", { name: "Allow wrap" }));
  await waitFor(() =>
    expect(first.queryByRole("switch", { name: "Allow wrap" })).not.toBeInTheDocument(),
  );
  await user.click(first.getByRole("radio", { name: "Flow" }));
  await user.click(screen.getByRole("button", { name: "Density error" }));
  expect(first.getByRole("radio", { name: "Dense" })).toBeVisible();
  expect(first.getByText("Invalid stored density")).toBeVisible();
  await user.click(first.getByRole("radio", { name: "Loose" }));
  await waitFor(() =>
    expect(first.queryByRole("radio", { name: "Loose" })).not.toBeInTheDocument(),
  );
});
test("hidden-on-site publication-only errors do not reveal inactive settings", async () => {
  const user = userEvent.setup();
  render(<Harness hidden />);
  await user.click(screen.getByRole("button", { name: "Publication error" }));
  expect(
    within(screen.getByRole("region", { name: "Block 0" })).queryByRole("switch"),
  ).not.toBeInTheDocument();
});
test.each([{ readOnly: true }, { busy: true }])(
  "visibility retains viewer/request editing locks %o",
  (props) => {
    render(<Harness {...props} />);
    const first = within(screen.getByRole("region", { name: "Block 0" }));
    expect(first.queryByRole("radio")).not.toBeInTheDocument();
    expect(first.getByText("Dense")).toBeVisible();
    expect(first.getByText("Allow wrap")).not.toBeVisible();
  },
);
