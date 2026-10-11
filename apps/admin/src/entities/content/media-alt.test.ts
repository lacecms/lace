import { expect, test } from "vitest";
import type { FieldDefinition } from "./field-types.js";
import { mediaAltPair } from "./media-alt.js";

const text = { required: false, type: "text" } as FieldDefinition;
const media = { required: true, type: "media" } as FieldDefinition;

test("pairs the alt field with the only media field of a block", () => {
  expect(mediaAltPair({ alt: text, caption: text, media })).toBe("media");
  expect(mediaAltPair({ alt: text, picture: media, title: text })).toBe("picture");
});

test("other block shapes have no inherited alt text", () => {
  expect(mediaAltPair({ eyebrow: text, heading: text, image: media })).toBeUndefined();
  expect(mediaAltPair({ alt: text, after: media, before: media })).toBeUndefined();
  expect(
    mediaAltPair({ alt: { required: false, type: "textarea" } as FieldDefinition, media }),
  ).toBeUndefined();
  expect(mediaAltPair({ alt: text })).toBeUndefined();
});
