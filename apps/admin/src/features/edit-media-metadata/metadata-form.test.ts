import { expect, test } from "vitest";
import { mediaItem } from "../../app/testing/index.js";
import { AdminClientError } from "../../shared/api/index.js";
import { isMediaUpdateConflict, metadataIssue } from "./errors.js";
import {
  focalPointText,
  isMetadataChanged,
  metadataPatch,
  metadataValues,
  pointerFocalPoint,
  stepFocalPoint,
} from "./metadata-form.js";

const described = metadataValues({
  ...mediaItem,
  alt: "Red bicycle",
  caption: "A bike",
  focalPoint: { x: 0.25, y: 0.75 },
});

test("reads unset metadata as empty form values", () => {
  expect(metadataValues(mediaItem)).toEqual({ alt: "", caption: "", focalPoint: null });
});

test("patches only changed values and clears emptied ones", () => {
  expect(metadataPatch(described, described)).toEqual({});
  expect(isMetadataChanged(described, described)).toBe(false);
  expect(metadataPatch(described, { ...described, caption: "A red bike" })).toEqual({
    caption: "A red bike",
  });
  expect(metadataPatch(described, { ...described, alt: "" })).toEqual({ alt: null });
  expect(metadataPatch(described, { ...described, focalPoint: { x: 0.25, y: 0.75 } })).toEqual({});
  expect(metadataPatch(described, { ...described, focalPoint: null })).toEqual({
    focalPoint: null,
  });
  expect(
    metadataPatch(metadataValues(mediaItem), {
      alt: "New",
      caption: "",
      focalPoint: { x: 0.1, y: 0.2 },
    }),
  ).toEqual({ alt: "New", focalPoint: { x: 0.1, y: 0.2 } });
  expect(isMetadataChanged(described, { ...described, alt: "Other" })).toBe(true);
});

test("steps the focal point from the centre in exact percentage points", () => {
  let point = stepFocalPoint(null, "ArrowRight", false);
  expect(point).toEqual({ x: 0.51, y: 0.5 });
  point = stepFocalPoint(point, "ArrowRight", false);
  point = stepFocalPoint(point, "ArrowUp", true);
  expect(point).toEqual({ x: 0.52, y: 0.4 });
  expect(stepFocalPoint({ x: 0.07, y: 0.29 }, "ArrowDown", false)).toEqual({ x: 0.07, y: 0.3 });
  expect(stepFocalPoint({ x: 0.95, y: 0.03 }, "ArrowRight", true)).toEqual({ x: 1, y: 0.03 });
  expect(stepFocalPoint({ x: 0.05, y: 0.03 }, "ArrowLeft", true)).toEqual({ x: 0, y: 0.03 });
  expect(stepFocalPoint({ x: 0.5, y: 0 }, "ArrowUp", false)).toEqual({ x: 0.5, y: 0 });
  expect(stepFocalPoint({ x: 0.333, y: 0.5 }, "ArrowLeft", false)).toEqual({ x: 0.32, y: 0.5 });
});

test("maps a pointer to clamped image fractions rounded to 0.1 %", () => {
  const box = { height: 200, left: 10, top: 20, width: 400 };
  expect(pointerFocalPoint(box, 310, 70)).toEqual({ x: 0.75, y: 0.25 });
  expect(pointerFocalPoint(box, 1000, -50)).toEqual({ x: 1, y: 0 });
  expect(pointerFocalPoint(box, 11, 20)).toEqual({ x: 0.003, y: 0 });
  expect(pointerFocalPoint({ height: 0, left: 0, top: 0, width: 0 }, 5, 5)).toEqual({
    x: 0.5,
    y: 0.5,
  });
});

test("states the focal point as percentages", () => {
  expect(focalPointText(null)).toBe("Not set, image centred");
  expect(focalPointText({ x: 0.52, y: 0.4 })).toBe("52% from left, 40% from top");
  expect(focalPointText({ x: 0.0034, y: 1 })).toBe("0% from left, 100% from top");
});

test("classifies conflicts and finds input issues", () => {
  const conflict = new AdminClientError({
    code: "MEDIA_UPDATE_CONFLICT",
    message: "Changed.",
    status: 409,
  });
  expect(isMediaUpdateConflict(conflict)).toBe(true);
  expect(isMediaUpdateConflict(new Error("Offline."))).toBe(false);
  const invalid = new AdminClientError({
    code: "VALIDATION_FAILED",
    issues: [{ code: "invalid", message: "Alt text is single-line.", path: "/alt" }],
    message: "Invalid.",
  });
  expect(metadataIssue(invalid, "alt")).toBe("Alt text is single-line.");
  expect(metadataIssue(invalid, "caption")).toBeUndefined();
  expect(metadataIssue(new Error("x"), "alt")).toBeUndefined();
});
