import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { themePreference, themeStorageKey } from "../../lib/index.js";
import { Toaster, toast } from "./index.js";

afterEach(() => {
  themePreference.setPreference("system");
  localStorage.removeItem(themeStorageKey);
});

test("announces notifications in a polite region with a named dismiss control", async () => {
  render(<Toaster />);
  act(() => {
    toast.success("Draft saved");
  });

  expect(await screen.findByText("Draft saved")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: /Notifications/u })).toHaveAttribute(
    "aria-live",
    "polite",
  );
  expect(screen.getByRole("button", { name: "Close toast" })).toBeInTheDocument();
});

test("notifications follow the resolved admin theme", async () => {
  themePreference.setPreference("dark");
  render(<Toaster />);
  act(() => {
    toast("Entry published");
  });
  await screen.findByText("Entry published");
  expect(document.querySelector("[data-sonner-toaster]")).toHaveAttribute(
    "data-sonner-theme",
    "dark",
  );
  act(() => themePreference.setPreference("light"));
  expect(document.querySelector("[data-sonner-toaster]")).toHaveAttribute(
    "data-sonner-theme",
    "light",
  );
});
