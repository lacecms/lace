import { field } from "../fields/builders.js";
import { deepFreeze } from "../shared/objects.js";
import { defineBlock } from "./definition.js";
import { VIDEO_EMBED_PROVIDERS } from "../fields/video-embeds.js";
import {
  listLayoutSettings,
  lightboxSetting,
  listLayoutSettingsVisibility,
} from "./list-layout.js";

// The optional link of an `image` block and of each `gallery` item.
const imageLinkField = field.url({
  description: "Selecting the image opens this link instead of the full-screen view.",
  label: "Link",
});

// The aspect ratio of a `videoEmbed` block and of each `gallery` video item.
const videoAspectRatioField = field.select({
  options: ["16:9", "4:3", "1:1", "4:5", "9:16"],
  required: true,
  defaultValue: "16:9",
  label: "Aspect ratio",
  description: "Reserves the video area before the player loads.",
  presentation: {
    control: "cards",
    choices: [
      {
        value: "16:9",
        label: "16:9",
        description: "Wide landscape.",
        diagram: { cells: [{ x: 0, y: 2, width: 12, height: 7 }] },
      },
      {
        value: "4:3",
        label: "4:3",
        description: "Classic landscape.",
        diagram: { cells: [{ x: 0, y: 1, width: 12, height: 9 }] },
      },
      {
        value: "1:1",
        label: "1:1",
        description: "Square.",
        diagram: { cells: [{ x: 1, y: 1, width: 9, height: 9 }] },
      },
      {
        value: "4:5",
        label: "4:5",
        description: "Portrait.",
        diagram: { cells: [{ x: 2, y: 1, width: 8, height: 10 }] },
      },
      {
        value: "9:16",
        label: "9:16",
        description: "Tall portrait.",
        diagram: { cells: [{ x: 3, y: 0, width: 6, height: 11 }] },
      },
    ],
  },
});

// The playback mode of a `videoEmbed` block and of each `gallery` video item.
const videoPlaybackField = field.select({
  options: ["player", "ambient"],
  required: true,
  defaultValue: "player",
  label: "Playback",
  description: "Ambient videos play muted and loop without controls.",
  presentation: {
    control: "cards",
    choices: [
      { value: "player", label: "Player", description: "Visitors start the video." },
      {
        value: "ambient",
        label: "Ambient",
        description: "Muted, looping, no controls; respects reduced motion.",
      },
    ],
  },
});

/** Starter blocks implemented exclusively through the public block and field DSL. */
export const builtInBlocks = deepFreeze({
  cta: defineBlock({
    description: "A heading and a link that prompts the reader to act.",
    fields: {
      actionLabel: field.text({ required: true }),
      actionUrl: field.url({ required: true }),
      body: field.richText(),
      heading: field.text({ required: true }),
    },
    label: "Call to action",
    type: "cta",
    version: 1,
  }),
  gallery: defineBlock({
    description: "A list of images and videos with selectable layouts and optional captions.",
    fields: {
      images: field.list({
        defaultValue: [],
        item: field.group({
          // The kind comes first, then each kind reads image (or video) before
          // its overrides: media, alt, caption, link or URL, title, caption,
          // playback, aspect ratio.
          fields: {
            kind: field.select({
              options: ["image", "video"],
              required: true,
              defaultValue: "image",
              label: "Type",
              presentation: {
                control: "cards",
                choices: [
                  {
                    value: "image",
                    label: "Image",
                    description: "A picture from the media library.",
                  },
                  { value: "video", label: "Video", description: "A YouTube or Vimeo video." },
                ],
              },
            }),
            media: field.media({ label: "Image", required: true }),
            videoUrl: field.url({
              required: true,
              embedProviders: VIDEO_EMBED_PROVIDERS,
              label: "Video URL",
              description: "Paste a YouTube or Vimeo video link, not iframe code.",
            }),
            alt: field.text({
              description: "Leave empty to use the media item's alt text.",
              label: "Alt text",
            }),
            videoTitle: field.text({
              required: true,
              minLength: 1,
              label: "Video title",
              description: "Names the video for visitors using assistive technology.",
            }),
            caption: field.text({
              description: "An empty image caption uses the media item's caption.",
              label: "Caption",
            }),
            link: imageLinkField,
            playback: videoPlaybackField,
            aspectRatio: videoAspectRatioField,
          },
          visibility: {
            media: { field: "kind", values: ["image"] },
            alt: { field: "kind", values: ["image"] },
            link: { field: "kind", values: ["image"] },
            videoUrl: { field: "kind", values: ["video"] },
            videoTitle: { field: "kind", values: ["video"] },
            playback: { field: "kind", values: ["video"] },
            aspectRatio: { field: "kind", values: ["video"] },
          },
        }),
        itemLabel: "caption",
        label: "Images and videos",
        maxItems: 50,
        minItems: 1,
      }),
      title: field.text({ label: "Title" }),
    },
    label: "Gallery",
    settings: { ...listLayoutSettings(), lightbox: lightboxSetting },
    settingsVisibility: listLayoutSettingsVisibility(),
    settingsLayout: {
      mode: "sections",
      groups: [
        { key: "layout", label: "Layout", fields: ["layoutMode", "layoutWrap", "layoutPreset"] },
        { key: "behavior", label: "Behavior", fields: ["lightbox"] },
      ],
    },
    type: "gallery",
    version: 5,
  }),
  hero: defineBlock({
    description: "Large heading with optional text, image, and action.",
    fields: {
      body: field.richText(),
      eyebrow: field.text(),
      heading: field.text({ required: true }),
      image: field.media(),
      primaryActionLabel: field.text(),
      primaryActionUrl: field.url(),
    },
    label: "Hero",
    type: "hero",
    version: 1,
  }),
  image: defineBlock({
    description:
      "A single image with an optional caption and alt text that overrides the media alt.",
    // Media comes first so editors show the image before its overrides.
    fields: {
      media: field.media({ required: true }),
      alt: field.text(),
      caption: field.text(),
      link: imageLinkField,
    },
    label: "Image",
    settings: { lightbox: lightboxSetting },
    type: "image",
    version: 4,
  }),
  link: defineBlock({
    description: "A link to a page or URL, presented as a button or text.",
    fields: {
      label: field.text({ label: "Label", minLength: 1, maxLength: 200, required: true }),
      url: field.url({ label: "Destination", required: true }),
    },
    settings: {
      appearance: field.select({
        label: "Appearance",
        options: ["button", "text"],
        defaultValue: "button",
        required: true,
      }),
      newTab: field.boolean({ label: "Open in new tab", defaultValue: false, required: true }),
    },
    label: "Link",
    type: "link",
    version: 1,
  }),
  navigation: defineBlock({
    description: "A list of links with optional one-level submenus.",
    fields: {
      links: field.list({
        defaultValue: [],
        item: field.group({
          fields: {
            children: field.list({
              item: field.group({
                fields: {
                  label: field.text({ label: "Label", required: true }),
                  url: field.url({ label: "URL", required: true }),
                },
              }),
              itemLabel: "label",
              label: "Submenu links",
              maxItems: 20,
            }),
            label: field.text({ label: "Label", required: true }),
            url: field.url({
              description: "Optional when the link has submenu links.",
              label: "URL",
            }),
          },
        }),
        itemLabel: "label",
        label: "Links",
        maxItems: 20,
        minItems: 1,
      }),
      name: field.text({
        description: "Read by screen readers, for example Main or On this page.",
        label: "Navigation name",
      }),
    },
    label: "Navigation",
    type: "navigation",
    version: 1,
  }),
  quote: defineBlock({
    description: "A quotation with optional attribution.",
    fields: {
      attribution: field.text(),
      quote: field.text({ required: true }),
    },
    label: "Quote",
    type: "quote",
    version: 1,
  }),
  richText: defineBlock({
    description: "Formatted text with headings, lists, and links.",
    fields: { content: field.richText({ required: true }) },
    label: "Rich text",
    type: "richText",
    version: 1,
  }),
  videoEmbed: defineBlock({
    type: "videoEmbed",
    version: 2,
    label: "Video embed",
    description: "A YouTube or Vimeo video with an optional image preview.",
    settings: {
      aspectRatio: videoAspectRatioField,
      playback: videoPlaybackField,
    },
    fields: {
      url: field.url({
        required: true,
        embedProviders: VIDEO_EMBED_PROVIDERS,
        label: "Video URL",
        description: "Paste a YouTube or Vimeo video link, not iframe code.",
      }),
      title: field.text({
        required: true,
        minLength: 1,
        label: "Title",
        description: "Names the video for visitors using assistive technology.",
      }),
      poster: field.media({
        label: "Preview image",
        description:
          "Optional. Defers player loading until selected in Player mode; stays underneath Ambient playback.",
      }),
      caption: field.text({ label: "Caption" }),
    },
  }),
});
