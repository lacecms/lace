import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { MediaDetailDto } from "@lacecms/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import { FieldRendererProvider, type DraftEditorValues } from "../../../entities/content/index.js";
import type { BlockDefinitionDto } from "../block-presentation.js";
import { BlockCard } from "./index.js";

const hero: BlockDefinitionDto = {
  fields: {
    eyebrow: { required: false, type: "text" },
    heading: { required: true, type: "text" },
  },
  label: "Hero",
  type: "hero",
  version: 1,
};

const defaultValues: DraftEditorValues = {
  blocks: [
    {
      data: { eyebrow: "News", heading: "Welcome home" },
      key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      position: 100,
      hidden: false,
      schemaVersion: 1,
      settings: {},
      type: "hero",
    },
  ],
  fields: {},
  title: "Home",
};

type CardProps = Omit<ComponentProps<typeof BlockCard>, "blockKey" | "control" | "definition">;

function Harness({ values = defaultValues, ...props }: CardProps & { values?: DraftEditorValues }) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  // Loading values through reset, as the entry page does, keeps react-hook-form's
  // DeepPartial default-value type off the recursive JSON block data.
  useState(() => form.reset(values));
  return (
    <DndContext>
      <SortableContext items={["01ARZ3NDEKTSV4RRFFQ69G5FAV"]}>
        <BlockCard
          {...props}
          blockKey="01ARZ3NDEKTSV4RRFFQ69G5FAV"
          control={form.control}
          definition={hero}
        />
      </SortableContext>
    </DndContext>
  );
}

function mount(overrides: Partial<CardProps> = {}) {
  const props: CardProps = {
    active: false,
    collapsed: false,
    error: undefined,
    index: 0,
    onActivate: vi.fn(),
    onDuplicate: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
    onToggleCollapsed: vi.fn(),
    total: 1,
    ...overrides,
  };
  const view = render(<Harness {...props} />);
  return {
    props,
    rerender: (next: Partial<CardProps>) => view.rerender(<Harness {...props} {...next} />),
  };
}

test("shows the icon, label, and a summary from data, and hides only fields when collapsed", async () => {
  const user = userEvent.setup();
  const { props, rerender } = mount();
  const card = screen.getByRole("article", { name: "Hero" });
  expect(card).toHaveTextContent("Welcome home");
  expect(screen.getByRole("textbox", { name: "Heading" })).toBeVisible();
  const toggle = screen.getByRole("button", { name: "Collapse Hero block" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await user.click(toggle);
  expect(props.onToggleCollapsed).toHaveBeenCalledOnce();

  rerender({ collapsed: true });
  expect(screen.getByRole("button", { name: "Expand Hero block" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getByRole("heading", { name: "Hero" })).toBeVisible();
  expect(screen.getByText("Welcome home")).toBeVisible();
  expect(screen.getByLabelText("Heading")).not.toBeVisible();
});

test("keeps a block with an error expanded and shows the error", () => {
  mount({ collapsed: true, error: { data: { heading: { message: "Heading is required." } } } });
  expect(screen.getByLabelText("Heading")).toBeVisible();
  expect(screen.getByText("Heading is required.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Expand Hero block/u })).not.toBeInTheDocument();
});

test("shows block-level problems and a text marker", () => {
  mount({
    error: {
      data: { extra: { message: "This block has data for the undefined field “extra”." } },
      schemaVersion: { message: "This block version is not current." },
    },
  });
  const card = screen.getByRole("article", { name: "Hero" });
  expect(card).toHaveAttribute("data-invalid", "true");
  expect(card).toHaveTextContent("Has problems");
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("This block version is not current.");
  expect(alert).toHaveTextContent("This block has data for the undefined field “extra”.");
  expect(card).toHaveAccessibleDescription(
    "This block version is not current. This block has data for the undefined field “extra”.",
  );
});

test("marks the active block and reports activation on focus", async () => {
  const user = userEvent.setup();
  const { props, rerender } = mount();
  const card = screen.getByRole("article", { name: "Hero" });
  expect(card).not.toHaveAttribute("data-active");
  await user.click(screen.getByLabelText("Heading"));
  expect(props.onActivate).toHaveBeenCalled();
  rerender({ active: true });
  expect(card).toHaveAttribute("data-active", "true");
});

test("offers move, duplicate, and remove actions with moves disabled at the ends", async () => {
  const user = userEvent.setup();
  const { props } = mount({ index: 0, total: 2 });
  // Radix menus open from the keyboard in jsdom; pointer opening needs real pointer events.
  const openMenu = async () => {
    screen.getByRole("button", { name: "Actions for Hero block" }).focus();
    await user.keyboard("{Enter}");
  };
  await openMenu();
  expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.click(screen.getByRole("menuitem", { name: "Move down" }));
  expect(props.onMove).toHaveBeenCalledWith(1);
  await openMenu();
  await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
  expect(props.onDuplicate).toHaveBeenCalledOnce();
  await openMenu();
  await user.click(screen.getByRole("menuitem", { name: "Remove" }));
  expect(props.onRemove).toHaveBeenCalledOnce();
});

test("exposes a keyboard reorder handle", () => {
  mount();
  const handle = screen.getByRole("button", { name: "Reorder Hero block" });
  expect(handle).toHaveAttribute("aria-roledescription", "sortable");
});

const image: BlockDefinitionDto = {
  fields: {
    alt: { required: false, type: "text" },
    caption: { required: false, type: "text" },
    media: { required: true, type: "media" },
  },
  label: "Image",
  type: "image",
  version: 2,
};

function ImageHarness({
  data,
  definition = image,
  readOnly = false,
}: {
  readonly data: Record<string, unknown>;
  readonly definition?: BlockDefinitionDto;
  readonly readOnly?: boolean;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  useState(() =>
    form.reset({
      blocks: [
        {
          data: data as never,
          key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          position: 100,
          schemaVersion: 2,
          type: definition.type,
        },
      ],
      fields: {},
      title: "Post",
    }),
  );
  return (
    <FieldRendererProvider readOnly={readOnly} renderers={{}}>
      <DndContext>
        <SortableContext items={["01ARZ3NDEKTSV4RRFFQ69G5FAV"]}>
          <BlockCard
            active={false}
            blockKey="01ARZ3NDEKTSV4RRFFQ69G5FAV"
            collapsed={false}
            control={form.control}
            definition={definition}
            error={undefined}
            index={0}
            onActivate={vi.fn()}
            onDuplicate={vi.fn()}
            onMove={vi.fn()}
            onRemove={vi.fn()}
            onToggleCollapsed={vi.fn()}
            total={1}
          />
        </SortableContext>
      </DndContext>
    </FieldRendererProvider>
  );
}

function mountImage(
  media: Partial<MediaDetailDto> | (() => Promise<MediaDetailDto>),
  props: Omit<ComponentProps<typeof ImageHarness>, "data"> & {
    readonly data?: Record<string, unknown>;
  } = {},
) {
  const getMedia =
    typeof media === "function" ? media : async () => ({ ...mediaItem, usage: [], ...media });
  return renderInRouter(<ImageHarness data={{ media: mediaItem.id }} {...props} />, {
    client: stubClient({ getMedia }),
  });
}

test("an image block's empty alt field shows the inherited media alt", async () => {
  mountImage({ alt: "Red bicycle" });
  const alt = await screen.findByRole("textbox", { name: "Alt" });
  await waitFor(() => expect(alt).toHaveAttribute("placeholder", "Uses media alt: Red bicycle"));
  expect(alt).toHaveAccessibleDescription("0 characters Uses media alt: Red bicycle");
  expect(screen.queryByText(/has no alt text/)).toBeNull();
});

test("a missing alt is warned about until alt text is typed", async () => {
  const user = userEvent.setup();
  mountImage({});
  const alt = await screen.findByRole("textbox", { name: "Alt" });
  expect(await screen.findByText(/This image has no alt text/)).toBeInTheDocument();
  expect(alt).toHaveAccessibleDescription(/presented as decorative/);
  await user.type(alt, "A red bike");
  expect(screen.queryByText(/This image has no alt text/)).toBeNull();
});

test("media alt saved elsewhere replaces the warning with the placeholder", async () => {
  const { queryClient } = mountImage({});
  expect(await screen.findByText(/This image has no alt text/)).toBeInTheDocument();
  queryClient.setQueryData(["admin", "media", "detail", mediaItem.id], {
    ...mediaItem,
    alt: "Saved later",
    usage: [],
  });
  expect(await screen.findByRole("textbox", { name: "Alt" })).toHaveAttribute(
    "placeholder",
    "Uses media alt: Saved later",
  );
  expect(screen.queryByText(/This image has no alt text/)).toBeNull();
});

test("no placeholder or warning while the media is loading or not selected", async () => {
  mountImage(() => new Promise(() => {}));
  const alt = await screen.findByRole("textbox", { name: "Alt" });
  expect(alt).not.toHaveAttribute("placeholder");
  expect(screen.queryByText(/has no alt text/)).toBeNull();
});

test("view-only editors show no missing-alt warning", async () => {
  const getMedia = vi.fn(async () => ({ ...mediaItem, usage: [] }));
  mountImage(getMedia, { readOnly: true });
  await screen.findByRole("textbox", { name: "Alt" });
  await waitFor(() => expect(getMedia).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.queryByText(/has no alt text/)).toBeNull();
});

test("a hero block with media never warns about alt text", async () => {
  const heroWithImage: BlockDefinitionDto = {
    fields: {
      heading: { required: true, type: "text" },
      image: { required: false, type: "media" },
    },
    label: "Hero",
    type: "hero",
    version: 1,
  };
  const getMedia = vi.fn(async () => ({ ...mediaItem, usage: [] }));
  renderInRouter(
    <ImageHarness data={{ heading: "Hi", image: mediaItem.id }} definition={heroWithImage} />,
    { client: stubClient({ getMedia }) },
  );
  await screen.findByRole("textbox", { name: "Heading" });
  expect(screen.queryByText(/has no alt text/)).toBeNull();
  expect(getMedia).not.toHaveBeenCalled();
});

test("a collapsed hidden card keeps its Hidden badge and valid anchor in the header", () => {
  const [loaded] = defaultValues.blocks;
  const props: CardProps = {
    active: false,
    collapsed: true,
    error: undefined,
    index: 0,
    onActivate: vi.fn(),
    onDuplicate: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
    onToggleCollapsed: vi.fn(),
    total: 1,
  };
  render(
    <Harness
      {...props}
      values={{ ...defaultValues, blocks: [{ ...loaded!, anchor: "pricing", hidden: true }] }}
    />,
  );
  const card = screen.getByRole("article", { name: "Hero Hidden" });
  expect(card).toHaveTextContent("#pricing");
  // Collapsing hides the tabs with the fields.
  expect(screen.queryByRole("tab")).toBe(null);
});
