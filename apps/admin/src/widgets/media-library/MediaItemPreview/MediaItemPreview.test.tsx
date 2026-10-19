import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import type { FieldDefinition, ItemPreview } from "../../../entities/content/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
import { MediaItemPreview } from "./index.js";

const item: Extract<FieldDefinition, { type: "group" }> = {
  fields: {
    media: { required: true, type: "media" },
    alt: { required: false, type: "text" },
    caption: { required: false, type: "text" },
  },
  required: false,
  type: "group",
};

function Line({ preview }: { readonly preview: ItemPreview }) {
  return (
    <p data-testid="line">
      {preview.visual}
      {[preview.title ?? "(no title)", preview.detail, ...(preview.indicators ?? [])].join(" | ")}
    </p>
  );
}

function mount(getMedia: AdminClient["getMedia"], value: Record<string, unknown>) {
  renderInRouter(
    <MediaItemPreview
      definition={item.fields.media!}
      group={{ definition: item, value }}
      value={value.media}
    >
      {(preview) => <Line preview={preview} />}
    </MediaItemPreview>,
    { client: stubClient({ getMedia }) },
  );
}

test("an image with alt text shows its thumbnail, filename and facts", async () => {
  mount(async () => ({ ...mediaItem, alt: "Cover", height: 479, usage: [], width: 640 }), {
    caption: "Blue portrait",
    media: "media-1",
  });
  expect(await screen.findByText(/cover\.png \| PNG · 640 × 479 px$/u)).toBeInTheDocument();
  expect(document.querySelector("img")).toHaveAttribute(
    "src",
    "/api/v1/admin/media/media-1/preview",
  );
});

test("missing alt on both the item and the media adds a No alt note", async () => {
  mount(async () => ({ ...mediaItem, usage: [] }), { alt: " ", media: "media-1" });
  expect(await screen.findByText(/\| No alt$/u)).toBeInTheDocument();
});

test("alt text typed on the item removes the note", async () => {
  mount(async () => ({ ...mediaItem, usage: [] }), { alt: "A red bike", media: "media-1" });
  expect(await screen.findByText(/cover\.png/u)).not.toHaveTextContent("No alt");
});

test("missing media has a placeholder, an accessible state and no title", async () => {
  mount(
    async () => {
      throw new AdminClientError({ code: "NOT_FOUND", message: "Not found", status: 404 });
    },
    { media: "media-1" },
  );
  expect(await screen.findByText("Selected media no longer exists.")).toBeInTheDocument();
  expect(screen.getByTestId("line")).toHaveTextContent("(no title)");
  expect(screen.getByTestId("line")).not.toHaveTextContent("media-1");
});
