import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const themePreferences: readonly ThemePreference[] = ["system", "light", "dark"];
export const themeStorageKey = "lace:admin-theme";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
type ColorSchemeQuery = Pick<
  MediaQueryList,
  "matches" | "addEventListener" | "removeEventListener"
>;

/** Browser surfaces the preference touches; each accessor may be missing or throw. */
export interface ThemeEnvironment {
  readonly storage: () => PreferenceStorage | undefined;
  readonly colorScheme: () => ColorSchemeQuery | undefined;
  readonly root: () => HTMLElement | undefined;
  readonly events: () => Pick<Window, "addEventListener" | "removeEventListener"> | undefined;
}

const browserEnvironment: ThemeEnvironment = {
  storage: () => window.localStorage,
  colorScheme: () =>
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : undefined,
  root: () => document.documentElement,
  events: () => window,
};

function parsePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    // Privacy-restricted browsers can deny storage or media queries; the theme
    // then falls back to System and the open document's choice.
    return undefined;
  }
}

export type ThemePreferenceStore = ReturnType<typeof createThemePreference>;

/**
 * The admin's System/Light/Dark preference: kept in local storage, resolved
 * against the operating system's color-scheme, and written to the document
 * root as `data-theme` so token and `dark:` styles follow it.
 */
export function createThemePreference(environment: ThemeEnvironment = browserEnvironment) {
  const listeners = new Set<() => void>();
  let current: ThemePreference | undefined;
  let detach: (() => void) | undefined;

  function preference(): ThemePreference {
    current ??= parsePreference(attempt(() => environment.storage()?.getItem(themeStorageKey)));
    return current;
  }

  function resolvedTheme(): ResolvedTheme {
    const value = preference();
    if (value !== "system") return value;
    return attempt(() => environment.colorScheme()?.matches) === true ? "dark" : "light";
  }

  function apply() {
    const root = attempt(environment.root);
    if (root !== undefined) root.dataset.theme = resolvedTheme();
  }

  function changed() {
    apply();
    for (const listener of listeners) listener();
  }

  return {
    preference,
    resolvedTheme,
    setPreference(value: ThemePreference) {
      current = value;
      attempt(() => environment.storage()?.setItem(themeStorageKey, value));
      changed();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Applies the theme and follows the OS preference and other tabs; idempotent. */
    start() {
      apply();
      if (detach !== undefined) return;
      const query = attempt(environment.colorScheme);
      const events = attempt(environment.events);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== themeStorageKey) return;
        current = parsePreference(event.key === null ? null : event.newValue);
        changed();
      };
      query?.addEventListener("change", changed);
      events?.addEventListener("storage", onStorage);
      detach = () => {
        query?.removeEventListener("change", changed);
        events?.removeEventListener("storage", onStorage);
        detach = undefined;
      };
    },
    stop() {
      detach?.();
    },
  };
}

/** The document's theme preference, started by the admin entry module. */
export const themePreference = createThemePreference();

export function useThemePreference(store: ThemePreferenceStore = themePreference) {
  const preference = useSyncExternalStore(store.subscribe, store.preference);
  const resolvedTheme = useSyncExternalStore(store.subscribe, store.resolvedTheme);
  return { preference, resolvedTheme, setPreference: store.setPreference };
}
