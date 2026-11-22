import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ReferencePicker } from "./index.js";

test("switching allowed models keeps earlier staged choices in selection order", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  renderInRouter(
    <ReferencePicker
      capacity={2}
      label="Related entries"
      limitMessage="Two entries"
      models={["authors", "reviews"]}
      onCancel={() => {}}
      onCloseAutoFocus={() => {}}
      onConfirm={onConfirm}
    />,
    {
      client: stubClient({
        listReferenceTargets: async ({ modelKey }) => ({
          items: [
            {
              id: modelKey,
              modelKey,
              modelKind: "collection",
              title: modelKey === "authors" ? "Ada" : "A review",
              state: "published",
            },
          ],
        }),
      }),
    },
  );
  await user.click(await screen.findByRole("button", { name: /^Ada/ }));
  await user.click(screen.getByRole("button", { name: "reviews" }));
  await user.click(await screen.findByRole("button", { name: /^A review/ }));
  await user.click(screen.getByRole("button", { name: "Add selected entries" }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(["authors", "reviews"]);
});
