import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ReferenceOccurrenceNotice } from "./ReferenceOccurrenceNotice.js";

test("readers can dismiss a hidden-use notice without getting a publication action", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  render(
    <ReferenceOccurrenceNotice
      occurrence={{ hidden: true, stale: false, pendingPublication: true }}
      banner={createRef<HTMLDivElement>()}
      onDismiss={onDismiss}
      onPublish={undefined}
      busy={false}
    />,
  );
  expect(screen.getByText(/The reference is hidden/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review publication" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Dismiss reference notice" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
