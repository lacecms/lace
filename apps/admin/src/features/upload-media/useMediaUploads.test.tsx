import { act, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../app/testing/index.js";
import { AdminClientError, type MediaUploadOptions } from "../../shared/api/index.js";
import { useMediaUploads } from "./useMediaUploads.js";

type Queue = ReturnType<typeof useMediaUploads>;

function mount(uploadMedia: (file: File, options?: MediaUploadOptions) => Promise<never>) {
  const queue: { current?: Queue } = {};
  function Harness() {
    queue.current = useMediaUploads();
    return (
      <ul>
        {queue.current.uploads.map((upload) => (
          <li key={upload.key}>
            {`${upload.file.name}:${upload.state}:${upload.progress ?? "-"}:${upload.message ?? ""}`}
          </li>
        ))}
      </ul>
    );
  }
  const rendered = renderInRouter(<Harness />, {
    client: stubClient({ uploadMedia: uploadMedia as never }),
  });
  return { ...rendered, queue: () => queue.current as Queue };
}

const png = (name: string) => new File(["png"], name, { type: "image/png" });

test("rejects invalid files locally and uploads at most two files at once", async () => {
  const pending: ((value: unknown) => void)[] = [];
  const uploadMedia = vi.fn(
    (_file: File, options?: MediaUploadOptions) =>
      new Promise<never>((resolve) => {
        options?.onProgress?.(0.5);
        pending.push(resolve as (value: unknown) => void);
      }),
  );
  const { queue, queryClient } = mount(uploadMedia);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  await screen.findByRole("list");
  act(() =>
    queue().add([
      png("a.png"),
      new File(["pdf"], "doc.pdf", { type: "application/pdf" }),
      png("b.png"),
      png("c.png"),
    ]),
  );
  expect(await screen.findByText("a.png:uploading:0.5:")).toBeInTheDocument();
  expect(screen.getByText("b.png:uploading:0.5:")).toBeInTheDocument();
  expect(screen.getByText("c.png:queued:-:")).toBeInTheDocument();
  expect(screen.getByText(/doc\.pdf:rejected:-:This file type is not supported/)).toBeVisible();
  expect(uploadMedia).toHaveBeenCalledTimes(2);
  expect(uploadMedia.mock.calls.map(([file]) => file.name)).toEqual(["a.png", "b.png"]);

  act(() => pending[0]?.({ ...mediaItem, filename: "a.png" }));
  expect(await screen.findByText("a.png:uploaded:1:")).toBeInTheDocument();
  await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(3));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "media"] });
  act(() => {
    pending[1]?.(mediaItem);
    pending[2]?.(mediaItem);
  });
  await screen.findByText("c.png:uploaded:1:");
  act(() => queue().clearFinished());
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});

test("reports per-file server errors and retries only failed uploads", async () => {
  const uploadMedia = vi
    .fn()
    .mockRejectedValueOnce(
      new AdminClientError({ code: "VALIDATION_FAILED", message: "Invalid image", status: 422 }),
    )
    .mockResolvedValueOnce(mediaItem)
    .mockResolvedValueOnce(mediaItem);
  const { queue } = mount(uploadMedia);
  await screen.findByRole("list");
  act(() => queue().add([png("bad.png"), png("good.png")]));
  expect(await screen.findByText("bad.png:failed:-:Invalid image")).toBeInTheDocument();
  expect(await screen.findByText("good.png:uploaded:1:")).toBeInTheDocument();
  const failed = queue().uploads.find((upload) => upload.file.name === "bad.png");
  const done = queue().uploads.find((upload) => upload.file.name === "good.png");
  act(() => queue().retry(done?.key ?? ""));
  act(() => queue().retry(failed?.key ?? ""));
  expect(await screen.findByText("bad.png:uploaded:1:")).toBeInTheDocument();
  expect(uploadMedia).toHaveBeenCalledTimes(3);
  act(() => queue().dismiss(failed?.key ?? ""));
  expect(screen.queryByText(/bad\.png/)).not.toBeInTheDocument();
});

test("queued tags are sent with each upload and kept for retries", async () => {
  const uploadMedia = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline."))
    .mockResolvedValueOnce(mediaItem)
    .mockResolvedValueOnce(mediaItem);
  const { queue } = mount(uploadMedia);
  await screen.findByRole("list");
  act(() => queue().add([png("travel.png")], { tags: ["travel"] }));
  expect(await screen.findByText(/travel\.png:failed/)).toBeInTheDocument();
  expect(uploadMedia).toHaveBeenLastCalledWith(
    expect.any(File),
    expect.objectContaining({ tags: ["travel"] }),
  );
  const failed = queue().uploads[0]!;
  act(() => queue().retry(failed.key));
  expect(await screen.findByText("travel.png:uploaded:1:")).toBeInTheDocument();
  expect(uploadMedia).toHaveBeenLastCalledWith(
    expect.any(File),
    expect.objectContaining({ tags: ["travel"] }),
  );
  act(() => queue().add([png("plain.png")]));
  expect(await screen.findByText("plain.png:uploaded:1:")).toBeInTheDocument();
  expect(uploadMedia.mock.lastCall?.[1]).not.toHaveProperty("tags");
});
