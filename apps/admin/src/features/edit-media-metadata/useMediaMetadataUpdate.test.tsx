import type { MediaDetailDto } from "@lacecms/contracts";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../app/testing/index.js";
import { adminQueryKeys } from "../../shared/api/index.js";
import { useMediaMetadataUpdate } from "./useMediaMetadataUpdate.js";

const usage: MediaDetailDto["usage"] = [
  {
    entryId: "entry-1",
    locations: [{ field: "cover", source: "field", states: ["published"] }],
    modelKey: "posts",
    status: "published",
    title: "Launch",
  },
];

function Probe({ onSaved }: { readonly onSaved: (alt: string | undefined) => void }) {
  const update = useMediaMetadataUpdate((result) => onSaved(result.media.alt));
  return (
    <button
      onClick={() =>
        update.mutate({
          expectedUpdatedAt: mediaItem.updatedAt,
          mediaId: mediaItem.id,
          patch: { alt: "Red bicycle" },
        })
      }
      type="button"
    >
      Save
    </button>
  );
}

test("writes the saved item into the cached detail, keeps usage, and refreshes lists", async () => {
  const saved = { ...mediaItem, alt: "Red bicycle", updatedAt: "2026-09-20T00:00:01.000Z" };
  const updateMediaMetadata = vi.fn(async () => ({
    build: { status: "not-dispatched" as const },
    media: saved,
  }));
  const onSaved = vi.fn();
  const { queryClient } = renderInRouter(<Probe onSaved={onSaved} />, {
    client: stubClient({ updateMediaMetadata }),
  });
  queryClient.setQueryData(adminQueryKeys.mediaDetail(mediaItem.id), { ...mediaItem, usage });
  queryClient.setQueryData(adminQueryKeys.mediaList({}), { pages: [], pageParams: [] });

  await userEvent.setup().click(await screen.findByRole("button", { name: "Save" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Red bicycle"));
  expect(updateMediaMetadata).toHaveBeenCalledWith(
    mediaItem.id,
    { alt: "Red bicycle" },
    mediaItem.updatedAt,
  );
  expect(queryClient.getQueryData(adminQueryKeys.mediaDetail(mediaItem.id))).toEqual({
    ...saved,
    usage,
  });
  expect(queryClient.getQueryState(adminQueryKeys.mediaList({}))?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(adminQueryKeys.mediaDetail(mediaItem.id))?.isInvalidated).toBe(
    false,
  );
});
