import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import {
  createThemePreference,
  themeStorageKey,
  useThemePreference,
  type ThemeEnvironment,
} from "./theme-preference.js";

const started: Array<{ stop(): void }> = [];
afterEach(() => {
  for (const store of started.splice(0)) store.stop();
});

function fixture({ dark = false, stored }: { dark?: boolean; stored?: string } = {}) {
  const values = new Map<string, string>();
  if (stored !== undefined) values.set(themeStorageKey, stored);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const mediaListeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  } as unknown as MediaQueryList;
  const events = new EventTarget() as unknown as Window;
  const root = document.createElement("html");
  const environment: ThemeEnvironment = {
    storage: () => storage,
    colorScheme: () => query,
    root: () => root,
    events: () => events,
  };
  return {
    environment,
    events,
    root,
    values,
    setSystemDark(value: boolean) {
      (query as { matches: boolean }).matches = value;
      for (const listener of mediaListeners) listener();
    },
    create(overrides: Partial<ThemeEnvironment> = {}) {
      const store = createThemePreference({ ...environment, ...overrides });
      started.push(store);
      return store;
    },
  };
}

test("an unset preference is System and follows a light or dark OS preference", () => {
  for (const dark of [false, true]) {
    const { create, root } = fixture({ dark });
    const store = create();
    store.start();
    expect(store.preference()).toBe("system");
    expect(store.resolvedTheme()).toBe(dark ? "dark" : "light");
    expect(root.dataset.theme).toBe(dark ? "dark" : "light");
  }
});

test("System follows the OS preference while the document is open", () => {
  const { create, root, setSystemDark } = fixture();
  const store = create();
  store.start();
  let notified = 0;
  store.subscribe(() => notified++);
  setSystemDark(true);
  expect(root.dataset.theme).toBe("dark");
  expect(notified).toBe(1);
  store.setPreference("light");
  setSystemDark(false);
  setSystemDark(true);
  expect(root.dataset.theme).toBe("light");
});

test("an explicit choice is stored, applied, and read by a new document", () => {
  const { create, root, values } = fixture({ dark: true });
  const store = create();
  store.start();
  store.setPreference("light");
  expect(values.get(themeStorageKey)).toBe("light");
  expect(root.dataset.theme).toBe("light");
  const reloaded = create();
  reloaded.start();
  expect(reloaded.preference()).toBe("light");
  expect(reloaded.resolvedTheme()).toBe("light");
  store.setPreference("system");
  expect(values.get(themeStorageKey)).toBe("system");
});

test("unrecognized stored values read as System", () => {
  for (const stored of ["", "auto", "DARK", '"dark"', "null"]) {
    const { create } = fixture({ stored, dark: true });
    const store = create();
    expect(store.preference()).toBe("system");
    expect(store.resolvedTheme()).toBe("dark");
  }
});

test("denied or failing storage and media keep the open document's choice", () => {
  const failing = () => {
    throw new Error("denied");
  };
  for (const storage of [
    () => undefined,
    failing,
    () => ({ getItem: failing, setItem: failing }),
  ] satisfies ThemeEnvironment["storage"][]) {
    const { create, root } = fixture();
    const store = create({ storage, colorScheme: failing, events: failing });
    expect(() => store.start()).not.toThrow();
    expect(store.preference()).toBe("system");
    expect(root.dataset.theme).toBe("light");
    store.setPreference("dark");
    expect(store.preference()).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
  }
});

test("a change made in another tab is applied", () => {
  const { create, events, root } = fixture();
  const store = create();
  store.start();
  let notified = 0;
  store.subscribe(() => notified++);
  events.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: "dark" }));
  expect(notified).toBe(0);
  events.dispatchEvent(new StorageEvent("storage", { key: themeStorageKey, newValue: "dark" }));
  expect(store.preference()).toBe("dark");
  expect(root.dataset.theme).toBe("dark");
  events.dispatchEvent(new StorageEvent("storage", { key: null }));
  expect(store.preference()).toBe("system");
  expect(root.dataset.theme).toBe("light");
  store.stop();
  events.dispatchEvent(new StorageEvent("storage", { key: themeStorageKey, newValue: "dark" }));
  expect(store.preference()).toBe("system");
});

test("start is idempotent and does not double-notify", () => {
  const { create, setSystemDark } = fixture();
  const store = create();
  store.start();
  store.start();
  let notified = 0;
  store.subscribe(() => notified++);
  setSystemDark(true);
  expect(notified).toBe(1);
});

test("the hook reports the preference and resolved theme and updates on change", () => {
  const { create } = fixture({ dark: true });
  const store = create();
  const { result } = renderHook(() => useThemePreference(store));
  expect(result.current.preference).toBe("system");
  expect(result.current.resolvedTheme).toBe("dark");
  act(() => result.current.setPreference("light"));
  expect(result.current.preference).toBe("light");
  expect(result.current.resolvedTheme).toBe("light");
});
