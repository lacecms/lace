import { expect, test } from "vitest";
import { sessionFor } from "../../app/testing/index.js";
import { tourSteps } from "./tour.js";

const models = [
  { key: "home", kind: "page" as const },
  { key: "posts", kind: "collection" as const },
];

test("tour mirrors navigation and available actions for each role", () => {
  for (const role of ["admin", "editor", "viewer"] as const) {
    const steps = tourSteps(sessionFor({ id: "user-1", role: role }), models);
    expect(steps.map((step) => step.id)).toEqual([
      "content",
      "pages",
      "collections",
      "media",
      "builds",
      ...(role === "admin" ? ["users", "settings"] : []),
    ]);
    const text = steps.flatMap((step) => step.paragraphs).join(" ");
    expect(text.includes("Save to keep a draft")).toBe(role !== "viewer");
    expect(text.includes("Upload supported")).toBe(role !== "viewer");
    for (const instruction of [
      "Publish a saved",
      "Request a build",
      "retry a failed",
      "Create a named build token",
    ])
      expect(text.includes(instruction)).toBe(role === "admin");
    expect(text).toContain("Publication does not guarantee");
    expect(text).toContain("Reload to see published changes to existing pages.");
    expect(text).toContain("Restart dev for new or renamed URLs.");
    expect(text).toContain("Run a fresh build after publishing");
    expect(text).toContain("previous release stays served");
    expect(text).not.toMatch(/restart[^.]*after (each|every) publication/i);
    if (role === "admin") {
      expect(text).toContain("read access only");
      expect(text).toContain("shown once");
    }
  }
});
test("absent and partial model groups do not manufacture navigation", () => {
  for (const value of [undefined, []])
    expect(tourSteps(sessionFor({ id: "user-1", role: "viewer" }), value).map((s) => s.id)).toEqual(
      ["content", "media", "builds"],
    );
  expect(
    tourSteps(sessionFor({ id: "user-1", role: "editor" }), models.slice(0, 1)).map((s) => s.id),
  ).toEqual(["content", "pages", "media", "builds"]);
  expect(
    tourSteps(sessionFor({ id: "user-1", role: "editor" }), models.slice(1)).map((s) => s.id),
  ).toEqual(["content", "collections", "media", "builds"]);
});
