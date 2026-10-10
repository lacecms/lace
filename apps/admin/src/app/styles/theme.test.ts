import { expect, test } from "vitest";
import themeSource from "./theme.css?raw";

const source = themeSource.replace(/\/\*[\s\S]*?\*\//g, "");

type Theme = "light" | "dark";

const themeBlocks: Record<Theme, RegExp> = {
  light: /:root,\s*:root\[data-theme="light"\]\s*\{([^}]*)\}/,
  dark: /:root\[data-theme="dark"\]\s*\{([^}]*)\}/,
};

function themeBlock(theme: Theme): string {
  const block = themeBlocks[theme].exec(source);
  if (block === null) throw new Error(`The ${theme} theme block is missing.`);
  return block[1]!;
}

function themeTokens(theme: Theme): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of themeBlock(theme).matchAll(/--([\w-]+):\s*([^;]+);/g))
    tokens.set(match[1]!, match[2]!.trim());
  return tokens;
}

function colorTokenNames(theme: Theme): string[] {
  return [...themeTokens(theme)]
    .filter(([, value]) => value.startsWith("oklch("))
    .map(([name]) => name)
    .toSorted();
}

function luminance(value: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (match === null) throw new Error(`Unsupported color token value: ${value}`);
  const [lightness, chroma, hue] = match.slice(1).map(Number) as [number, number, number];
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

test("the theme defines every required token category", () => {
  const tokens = themeTokens("light");
  for (const name of [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "destructive-foreground",
    "success",
    "success-foreground",
    "warning",
    "warning-foreground",
    "border",
    "input",
    "ring",
    "sidebar",
    "sidebar-foreground",
    "sidebar-primary",
    "sidebar-primary-foreground",
    "sidebar-accent",
    "sidebar-accent-foreground",
    "sidebar-border",
    "sidebar-ring",
    "radius",
    "focus-ring-width",
    "duration-fast",
    "duration-normal",
  ])
    expect(tokens.has(name), name).toBe(true);
  for (const namespace of ["--spacing:", "--text-sm:", "--shadow-sm:", "--ease-standard:"])
    expect(source).toContain(namespace);
  expect(source).toContain('--font-sans: "Inter Variable"');
  expect(source).toContain("--text-sm: 0.8125rem;");
});

test("light and dark are the shipped themes with the same color tokens", () => {
  expect(source.match(/\[data-theme="[\w-]+"\]\s*\{/g)).toEqual([
    '[data-theme="light"] {',
    '[data-theme="dark"] {',
  ]);
  expect(themeBlock("light")).toContain("color-scheme: light;");
  expect(themeBlock("dark")).toContain("color-scheme: dark;");
  expect(colorTokenNames("dark")).toEqual(colorTokenNames("light"));
  // Non-color tokens are shared from the light block rather than redefined.
  expect([...themeTokens("dark").keys()].toSorted()).toEqual(colorTokenNames("dark"));
  expect(source).toContain(
    '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
  );
});

test.each(["light", "dark"] as const)("every %s foreground token meets AA contrast", (theme) => {
  const tokens = themeTokens(theme);
  const pairs: Array<[string, string]> = [
    ["foreground", "background"],
    ["card-foreground", "card"],
    ["popover-foreground", "popover"],
    ["primary-foreground", "primary"],
    ["secondary-foreground", "secondary"],
    ["muted-foreground", "muted"],
    ["muted-foreground", "background"],
    ["accent-foreground", "accent"],
    ["destructive-foreground", "destructive"],
    ["destructive", "background"],
    ["success-foreground", "success"],
    ["warning-foreground", "warning"],
    ["sidebar-foreground", "sidebar"],
    ["sidebar-primary-foreground", "sidebar-primary"],
    ["sidebar-accent-foreground", "sidebar-accent"],
    ["muted-foreground", "sidebar"],
  ];
  for (const [foreground, background] of pairs)
    expect(
      contrast(tokens.get(foreground)!, tokens.get(background)!),
      `${foreground} on ${background}`,
    ).toBeGreaterThanOrEqual(4.5);
});

test.each(["light", "dark"] as const)("%s inline links stand out from body text", (theme) => {
  const tokens = themeTokens(theme);
  // Inline text-primary links rely on color alone (axe link-in-text-block): 3:1
  // against surrounding text, and AA as text on the page background.
  expect(contrast(tokens.get("primary")!, tokens.get("foreground")!)).toBeGreaterThanOrEqual(3);
  expect(contrast(tokens.get("primary")!, tokens.get("background")!)).toBeGreaterThanOrEqual(4.5);
});

test("global styles expose the light theme focus and motion tokens", async () => {
  await import("./styles.css");
  const rootStyles = getComputedStyle(document.documentElement);
  expect(rootStyles.getPropertyValue("--ring").trim()).toMatch(/^oklch\(/);
  expect(rootStyles.getPropertyValue("--primary").trim()).toMatch(/^oklch\(/);
  expect(rootStyles.getPropertyValue("--duration-normal").trim()).toBe("220ms");
});

test("the dark theme attribute switches the resolved token values", async () => {
  await import("./styles.css");
  const root = document.documentElement;
  const light = getComputedStyle(root).getPropertyValue("--background").trim();
  root.dataset.theme = "dark";
  try {
    const dark = getComputedStyle(root);
    expect(dark.getPropertyValue("--background").trim()).toBe(
      themeTokens("dark").get("background"),
    );
    expect(dark.getPropertyValue("--background").trim()).not.toBe(light);
    expect(dark.getPropertyValue("--duration-normal").trim()).toBe("220ms");
  } finally {
    delete root.dataset.theme;
  }
});
