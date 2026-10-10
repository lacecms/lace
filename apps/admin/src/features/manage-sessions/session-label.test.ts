import { expect, test } from "vitest";
import { sessionLabel } from "./session-label.js";

test("names the browser and operating system in words", () => {
  expect(sessionLabel({ browser: "Firefox", os: "Linux" })).toBe("Firefox on Linux");
  expect(sessionLabel({ browser: "Unknown", os: "Unknown" })).toBe(
    "Unknown browser on an unknown system",
  );
});
