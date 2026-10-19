import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useMediaDropzone } from "./useMediaDropzone.js";

function Harness({
  disabled = false,
  onFiles,
}: {
  readonly disabled?: boolean;
  readonly onFiles: (files: readonly File[]) => void;
}) {
  const dropzone = useMediaDropzone({ disabled, onFiles });
  return (
    <div {...dropzone.getRootProps()} data-testid="root">
      <input {...dropzone.getInputProps()} />
      {dropzone.isDragActive ? <p>Dragging</p> : undefined}
    </div>
  );
}

test("the picker input accepts several supported images and passes every file on", async () => {
  const onFiles = vi.fn();
  render(<Harness onFiles={onFiles} />);
  const input = screen.getByLabelText("Upload images");
  expect(input).toHaveAttribute("multiple");
  expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/gif,image/webp,image/avif");
  expect(screen.getByTestId("root")).not.toHaveAttribute("tabindex");
  const files = [
    new File(["a"], "a.png", { type: "image/png" }),
    new File(["b"], "b.pdf", { type: "application/pdf" }),
  ];
  fireEvent.change(input, { target: { files } });
  await vi.waitFor(() => expect(onFiles).toHaveBeenCalledWith(files));
});

test("dragging files over the root reports an active drop target", async () => {
  render(<Harness onFiles={vi.fn()} />);
  const file = new File(["a"], "a.png", { type: "image/png" });
  fireEvent.dragEnter(screen.getByTestId("root"), {
    dataTransfer: {
      files: [file],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      types: ["Files"],
    },
  });
  expect(await screen.findByText("Dragging")).toBeInTheDocument();
});
