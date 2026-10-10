import { act, render, screen, waitFor, within } from "@testing-library/react";
import { sessionFor } from "../../../app/testing/index.js";
import { userEvent } from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { tourSteps } from "../tour.js";
import { createTourRecords } from "../tour-storage.js";
import { IntroductoryTour, type TourHandle } from "./index.js";

afterEach(() => {
  document.getElementById("fallback")?.remove();
});

const scope = { origin: "https://tour.test", basepath: "/admin", userId: "component" };
function fixture(role: "admin" | "editor" | "viewer" = "admin") {
  const ref = createRef<TourHandle>();
  const records = { read: vi.fn(() => undefined), write: vi.fn() };
  const account = document.createElement("button");
  account.textContent = "Account";
  account.id = "fallback";
  document.body.append(account);
  const fallbackFocus = () => account;
  const props = {
    steps: tourSteps(sessionFor({ id: "user-1", role: role })),
    scope,
    ref,
    records,
    fallbackFocus,
  };
  const result = render(<IntroductoryTour {...props} />);
  return { ...result, props, records, ref };
}

test("offer does not steal focus and controls follow bounds, completion and replay", async () => {
  const user = userEvent.setup();
  const { records, ref } = fixture("viewer");
  expect(screen.getByRole("region", { name: "Welcome to Lace" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start tour" })).not.toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Start tour" }));
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: /Media, Step 2/ })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("dialog", { name: /Content/ })).toBeInTheDocument();
  for (let i = 0; i < 2; i++) await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Finish" }));
  expect(records.write).toHaveBeenCalledWith("completed");
  expect(screen.queryByRole("region", { name: "Welcome to Lace" })).not.toBeInTheDocument();
  act(() => ref.current?.start(null));
  expect(await screen.findByRole("dialog", { name: /Content/ })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(records.write).toHaveBeenLastCalledWith("dismissed");
  await waitFor(() => expect(screen.getByRole("button", { name: "Account" })).toHaveFocus());
});

test("Skip and dialog close record dismissal without navigation or form submission", async () => {
  const user = userEvent.setup();
  const { records, ref } = fixture();
  const location = window.location.href;
  await user.click(screen.getByRole("button", { name: "Skip" }));
  expect(records.write).toHaveBeenCalledWith("dismissed");
  act(() => ref.current?.start(null));
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(records.write).toHaveBeenCalledTimes(2);
  expect(window.location.href).toBe(location);
});

test("returning user and document fallback survive remounts", async () => {
  const memory = new Map();
  const records = createTourRecords(scope, () => undefined, memory);
  records.write("dismissed");
  const ref = createRef<TourHandle>();
  render(
    <IntroductoryTour
      steps={tourSteps(sessionFor({ id: "user-1", role: "viewer" }))}
      scope={scope}
      ref={ref}
      records={createTourRecords(scope, () => undefined, memory)}
      fallbackFocus={() => null}
    />,
  );
  expect(screen.queryByRole("button", { name: "Start tour" })).not.toBeInTheDocument();
  act(() => ref.current?.start(null));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});

test("delayed models preserve Media; role downgrade removes privileged active content", async () => {
  const user = userEvent.setup();
  const { props, rerender } = fixture();
  await user.click(screen.getByRole("button", { name: "Start tour" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  const models = [
    { key: "home", kind: "page" as const },
    { key: "posts", kind: "collection" as const },
  ];
  rerender(
    <IntroductoryTour
      {...props}
      steps={tourSteps(sessionFor({ id: "user-1", role: "admin" }), models)}
    />,
  );
  expect(screen.getByRole("heading", { name: /Media, Step 4 of 7/ })).toBeInTheDocument();
  for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("dialog", { name: /Settings/ })).toHaveTextContent(
    "Create a named build token",
  );
  rerender(
    <IntroductoryTour
      {...props}
      steps={tourSteps(sessionFor({ id: "user-1", role: "viewer" }), models)}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: /Content/ });
  expect(dialog).not.toHaveTextContent(/Create a named|Save to keep|Publish a saved/);
  await user.click(within(dialog).getByRole("button", { name: "Next" }));
  rerender(
    <IntroductoryTour {...props} steps={tourSteps(sessionFor({ id: "user-1", role: "viewer" }))} />,
  );
  expect(screen.getByRole("dialog", { name: /Content/ })).toBeInTheDocument();
});

test("identity remount drops open progress without recording completion for the new user", async () => {
  const user = userEvent.setup();
  const { props, records, rerender } = fixture();
  await user.click(screen.getByRole("button", { name: "Start tour" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  rerender(<IntroductoryTour key="new-user" {...props} scope={{ ...scope, userId: "other" }} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start tour" })).toBeInTheDocument();
  expect(records.write).not.toHaveBeenCalled();
});
