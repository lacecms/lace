import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { themePreference, themeStorageKey } from "../../../shared/lib/index.js";
import { UserMenu } from "./index.js";

afterEach(() => {
  themePreference.setPreference("system");
  localStorage.removeItem(themeStorageKey);
  delete document.documentElement.dataset.theme;
});

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: /account menu/ }).focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menu");
}

test("user menu names the user and role and runs log out from the keyboard", async () => {
  const user = userEvent.setup();
  const onSignOut = vi.fn();
  render(
    <UserMenu displayName="Ada Editor" onSignOut={onSignOut} role="editor" signingOut={false} />,
  );

  const trigger = screen.getByRole("button", { name: /Ada Editor, Editor/ });
  expect(trigger).toHaveTextContent("AE");
  trigger.focus();
  await user.keyboard("{Enter}");
  const menu = await screen.findByRole("menu");
  expect(menu).toHaveTextContent("Ada Editor");
  await user.keyboard("{ArrowDown}");
  await user.click(screen.getByRole("menuitem", { name: "Log out" }));
  expect(onSignOut).toHaveBeenCalledOnce();
});

test("user menu falls back to a neutral label and never shows an identifier", async () => {
  const user = userEvent.setup();
  render(<UserMenu onSignOut={() => undefined} role="viewer" signingOut />);
  const trigger = screen.getByRole("button", { name: /Signed-in user, Viewer/ });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("menuitem", { name: "Signing out…" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(document.body).not.toHaveTextContent(/viewer-1/);
});

test("user menu offers the theme choice with the stored preference checked", async () => {
  const user = userEvent.setup();
  render(<UserMenu onSignOut={() => undefined} role="editor" signingOut={false} />);
  await openMenu(user);
  const group = screen.getByRole("group", { name: "Theme" });
  expect(group).toBeInTheDocument();
  expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(themeStorageKey)).toBe("dark");
  await openMenu(user);
  expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("the theme choice is operable from the keyboard", async () => {
  const user = userEvent.setup();
  themePreference.setPreference("dark");
  render(<UserMenu onSignOut={() => undefined} role="editor" signingOut={false} />);
  await openMenu(user);
  const light = screen.getByRole("menuitemradio", { name: "Light" });
  for (let step = 0; step < 6 && document.activeElement !== light; step++)
    await user.keyboard("{ArrowDown}");
  expect(light).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem(themeStorageKey)).toBe("light");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
