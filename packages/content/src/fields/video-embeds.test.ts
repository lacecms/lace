// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect } from "vitest";

test("embed ambient URLs are canonical and ignore input playback parameters", async () => {
  const { parseVideoEmbed } = await import("./video-embeds.js");
  for (const url of [
    "https://youtu.be/dQw4w9WgXcQ?start=50&autoplay=0&playlist=bad",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&mute=0",
  ]) {
    const result = parseVideoEmbed(url);
    expect(result.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(result.ambientSrc).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ&controls=0&playsinline=1",
    );
    expect(Object.isFrozen(result)).toBe(true);
  }
  for (const url of [
    "https://vimeo.com/123/abc?autoplay=0",
    "https://player.vimeo.com/video/123?h=abc&background=0",
  ]) {
    expect(parseVideoEmbed(url)).toMatchObject({
      src: "https://player.vimeo.com/video/123?h=abc",
      ambientSrc: "https://player.vimeo.com/video/123?h=abc&background=1",
    });
  }
  expect(parseVideoEmbed("https://vimeo.com/123?background=0&mute=0").ambientSrc).toBe(
    "https://player.vimeo.com/video/123?background=1",
  );
});
