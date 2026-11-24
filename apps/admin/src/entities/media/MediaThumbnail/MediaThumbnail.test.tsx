import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MediaThumbnail } from "./index.js";

test("thumbnails load lazily through the separate authenticated thumbnail path", () => {
  const { container } = render(<MediaThumbnail mediaId="private/id" />);
  const image = container.querySelector("img");
  expect(image).toHaveAttribute("loading", "lazy");
  expect(image).toHaveAttribute("src", "/api/v1/admin/media/private%2Fid/thumbnail");
  expect(image).toHaveAttribute("alt", "");
});

test("a failed thumbnail needs only the fallback icon and a new media ID loads independently", () => {
  const { container, rerender } = render(<MediaThumbnail mediaId="missing" />);
  fireEvent.error(container.querySelector("img") as HTMLImageElement);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByTestId("thumbnail-fallback")).toBeInTheDocument();
  rerender(<MediaThumbnail mediaId="another" />);
  expect(container.querySelector("img")).toHaveAttribute(
    "src",
    "/api/v1/admin/media/another/thumbnail",
  );
});
