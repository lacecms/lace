import { expect, test } from "vitest";
import { DomainError } from "./errors.js";

test("carries the stable media-in-use code for referenced-media refusals", () => {
  const error = new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ code: "MEDIA_IN_USE", name: "DomainError" });
});
