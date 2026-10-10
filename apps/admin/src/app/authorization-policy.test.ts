import { expect, test } from "vitest";

// Every admin source file except tests and the test-only harness.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], {
  eager: true,
  import: "default",
  query: "?raw",
});

/**
 * Files that may compare role values because they present roles or edit a
 * managed account's role, never to decide the signed-in user's access.
 */
const presentationAllowlist = [
  "./testing/index.ts",
  "../entities/session/roles.ts",
  "../features/update-user/ChangeRoleDialog/ChangeRoleDialog.tsx",
];

const roleLiteral = String.raw`["'\x60](?:admin|editor|viewer)["'\x60]`;
const comparison = String.raw`[!=]==?`;
const patterns = [
  // session.role === "admin", context.session.role !== 'viewer', session?.role == "editor"
  new RegExp(String.raw`\bsession\??\.role\s*${comparison}\s*${roleLiteral}`, "u"),
  new RegExp(String.raw`${roleLiteral}\s*${comparison}\s*[\w.?]*session\??\.role\b`, "u"),
  // const { role } = useSession(); ... role === "admin"
  new RegExp(String.raw`\brole\s*${comparison}\s*${roleLiteral}`, "u"),
  new RegExp(String.raw`${roleLiteral}\s*${comparison}\s*role\b`, "u"),
  // switch (session.role) { case "admin": ... }
  new RegExp(String.raw`switch\s*\(\s*[\w.?]*\brole\s*\)`, "u"),
];

/** Lines of `source` that gate behavior on a role name instead of a permission. */
function roleComparisons(source: string): readonly string[] {
  return source
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/u.test(line))
    .filter((line) => patterns.some((pattern) => pattern.test(line)))
    .map((line) => line.trim());
}

test("admin source decides access from session permissions, never role names", () => {
  const files = Object.keys(sources);
  expect(files.length).toBeGreaterThan(50);
  const violations = files
    .filter((file) => !presentationAllowlist.includes(file))
    .flatMap((file) => roleComparisons(sources[file]!).map((line) => `${file}: ${line}`));
  expect(violations).toEqual([]);
});

test("the policy check recognizes role comparisons and ignores permission checks", () => {
  for (const line of [
    'const canPublish = session.role === "admin";',
    "const readOnly = context.session.role !== 'viewer';",
    'if ("admin" === session.role) return;',
    'const writer = role !== "viewer";',
    "switch (session.role) {",
  ])
    expect(roleComparisons(line)).toEqual([line]);
  for (const line of [
    'const canPublish = can(session, "content:publish");',
    "<Badge>{roleLabel(session.role)}</Badge>",
    '// session.role === "admin" is forbidden here',
    'const roleOptions = ["admin", "editor", "viewer"];',
  ])
    expect(roleComparisons(line)).toEqual([]);
});

test("allowlisted files still exist", () => {
  for (const file of presentationAllowlist) expect(Object.keys(sources)).toContain(file);
});
