import { expect, test } from "vitest";
import { inSentence } from "./create-label.js";

test("labels read naturally inside a sentence", () => {
  expect(inSentence("Links")).toBe("links");
  expect(inSentence("SEO links")).toBe("SEO links");
  expect(inSentence("Details")).toBe("details");
  expect(inSentence("X")).toBe("X");
  expect(inSentence("3D model")).toBe("3D model");
});
