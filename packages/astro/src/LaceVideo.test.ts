import { describeVideoEmbed } from "@lacecms/render";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test, vi } from "vitest";
import LaceVideo from "./LaceVideo.astro";

const sources = [
  ["YouTube", "https://youtu.be/dQw4w9WgXcQ"],
  ["Vimeo", "https://vimeo.com/76979871/abc123def"],
] as const;

test.each(sources)("%s renders both modes with and without a poster", async (provider, url) => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch"));
  try {
    const container = await AstroContainer.create();
    const video = describeVideoEmbed(url);
    for (const playback of ["player", "ambient"]) {
      for (const hasPoster of [false, true]) {
        const html = await container.renderToString(LaceVideo, {
          props: {
            video,
            url,
            title: "Studio & guests",
            aspectRatio: "4:5",
            playback,
            "data-lace-video": true,
            class: "custom-player",
            id: "screening",
            ...(hasPoster
              ? { poster: { alt: "Decorative poster", src: "/poster.jpg" }, caption: "<Film>" }
              : {}),
          },
        });
        const liveMarkup = html.replace(/<(template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gu, "");
        const player = html.match(/<iframe\b[^>]*allowfullscreen[^>]*>/u)?.[0];
        expect(html).toContain('class="custom-player"');
        expect(html).toContain('id="screening"');
        expect(html).toContain("data-lace-video-instance");
        expect(html).toMatch(/\sdata-lace-video(?:[\s=>])/u);
        expect(html).toContain('data-lace-aspect-ratio="4:5"');
        expect(html).toContain(`data-lace-playback="${playback}"`);
        expect(html).toContain(`href="${url}">Watch on ${provider}</a>`);
        expect(player).toContain(`src="${video.src.replaceAll("&", "&amp;")}"`);
        expect(player).toContain('title="Studio &amp; guests"');
        expect(player).toContain('allow="fullscreen; picture-in-picture; encrypted-media"');
        expect(player).toContain('referrerpolicy="strict-origin-when-cross-origin"');
        expect(liveMarkup.includes("<iframe")).toBe(!hasPoster && playback === "player");
        expect(html.includes("<template data-lace-video-template")).toBe(
          hasPoster || playback === "ambient",
        );
        expect(html.includes("<noscript>")).toBe(!hasPoster && playback === "ambient");
        expect(player?.includes('loading="lazy"')).toBe(!hasPoster);
        if (hasPoster) {
          expect(html).toContain('aria-label="Load video: Studio &amp; guests"');
          expect(html).toMatch(/<img[^>]*\salt(?:="")?\s[^>]*src="\/poster\.jpg"/u);
          expect(html).toContain('data-lace-part="caption">&lt;Film&gt;</figcaption>');
        } else {
          expect(html).not.toContain('data-lace-part="preview"');
          expect(html).not.toContain('data-lace-part="caption"');
        }
        if (playback === "ambient") {
          const frame = html.match(
            /<template data-lace-ambient-template[^>]*>\s*(<iframe[^>]*>)/u,
          )?.[1];
          expect(frame).toContain(`src="${video.ambientSrc.replaceAll("&", "&amp;")}"`);
          expect(frame).toContain('tabindex="-1"');
          expect(frame).toContain('allow="autoplay; encrypted-media"');
          expect(frame).toContain('loading="lazy"');
          expect(frame).not.toContain("allowfullscreen");
          expect(liveMarkup).not.toContain(video.ambientSrc);
        } else {
          expect(html).not.toContain("data-lace-ambient-template");
        }
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
