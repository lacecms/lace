import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { FieldDefinition, ItemPreview } from "../field-types.js";
import { EmbedUrlPreview } from "./index.js";

const embedUrl: FieldDefinition = {
  embedProviders: ["youtube", "vimeo"],
  required: true,
  type: "url",
};

function Line({ preview }: { readonly preview: ItemPreview }) {
  return (
    <p data-testid="line">
      {preview.visual}
      {[preview.title ?? "(no title)", preview.detail ?? "(no detail)"].join(" | ")}
    </p>
  );
}

function mount(value: unknown) {
  render(
    <EmbedUrlPreview definition={embedUrl} group={undefined} value={value}>
      {(preview) => <Line preview={preview} />}
    </EmbedUrlPreview>,
  );
  return screen.getByTestId("line");
}

test.each([
  ["https://vimeo.com/76979871", "Vimeo video"],
  ["https://youtu.be/dQw4w9WgXcQ", "YouTube video"],
])("%s is previewed by its provider with a video icon", (url, title) => {
  const line = mount(url);
  expect(line).toHaveTextContent(`${title} | (no detail)`);
  expect(line.querySelector("svg")).not.toBeNull();
});

test("a value that is not a provider URL gives no title or visual", () => {
  const line = mount("https://example.com/clip");
  expect(line).toHaveTextContent("(no title) | (no detail)");
  expect(line.querySelector("svg")).toBeNull();
});

test("the preview applies only to URL fields restricted to embed providers", () => {
  expect(EmbedUrlPreview.appliesTo(embedUrl)).toBe(true);
  expect(EmbedUrlPreview.appliesTo({ required: false, type: "url" })).toBe(false);
  expect(EmbedUrlPreview.appliesTo({ required: false, type: "text" })).toBe(false);
});
