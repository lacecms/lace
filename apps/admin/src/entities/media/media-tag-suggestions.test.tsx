import type { MediaTagCatalogDto } from "@lacecms/contracts";
import { act, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../app/testing/index.js";
import { useMediaTagSuggestions } from "./media-tag-suggestions.js";

let setText: (text: string) => void = () => undefined;

function Probe({ enabled = true }: { readonly enabled?: boolean }) {
  const [text, update] = useState("");
  setText = update;
  const suggestions = useMediaTagSuggestions(text, enabled);
  return (
    <p>
      {suggestions.isError
        ? "failed"
        : (suggestions.data?.items.map((item) => item.tag).join(",") ?? "idle")}
    </p>
  );
}

function setup(
  listMediaTags = vi.fn(async (query?: { q?: string }) => ({
    items: [{ count: 1, tag: `${query?.q ?? "all"}-tag` }],
  })),
  enabled = true,
) {
  renderInRouter(<Probe enabled={enabled} />, { client: stubClient({ listMediaTags }) });
  return listMediaTags;
}

afterEach(() => vi.useRealTimers());

test("an empty prefix lists tags from the start", async () => {
  const listMediaTags = setup();
  expect(await screen.findByText("all-tag")).toBeInTheDocument();
  expect(listMediaTags).toHaveBeenCalledWith({ limit: 10 });
});

test("typing requests the normalized prefix once after a pause", async () => {
  const listMediaTags = setup();
  await screen.findByText("all-tag");
  act(() => setText("P"));
  act(() => setText("Pr"));
  act(() => setText(" Pro "));
  expect(await screen.findByText("pro-tag")).toBeInTheDocument();
  expect(listMediaTags.mock.calls.map(([query]) => query)).toEqual([
    { limit: 10 },
    { limit: 10, q: "pro" },
  ]);
});

test("text that is not a tag requests nothing", async () => {
  const listMediaTags = setup();
  await screen.findByText("all-tag");
  act(() => setText("summer trip"));
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(listMediaTags).toHaveBeenCalledTimes(1);
});

test("disabled suggestions request nothing and failures are reported", async () => {
  const disabled = setup(undefined, false);
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(disabled).not.toHaveBeenCalled();
  expect(screen.getByText("idle")).toBeInTheDocument();
});

test("a failed request is reported", async () => {
  setup(
    vi.fn(async (): Promise<MediaTagCatalogDto> => {
      throw new Error("offline");
    }),
  );
  expect(await screen.findByText("failed")).toBeInTheDocument();
});
