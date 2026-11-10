import { builtInBlocks } from "../index.js";
import type { BlockDataValues, BlockSettingsValues } from "../index.js";
import type { Equal, Expect } from "../test-support/type-assertions.js";

type GalleryData = BlockDataValues<typeof builtInBlocks.gallery.fields>;
const galleryData: GalleryData = {
  images: [
    { kind: "image", media: "media-1", placement: "auto" },
    { alt: "Override", caption: "Studio", kind: "image", media: "media-2", placement: "auto" },
    {
      kind: "video",
      placement: "auto",
      videoTitle: "Tour",
      videoUrl: "https://vimeo.com/1",
      playback: "ambient",
    },
  ],
  title: "Studio",
};
// Published items carry a kind and a placement; conditional targets such as
// media and size are optional.
const galleryWithoutMedia: GalleryData = {
  images: [{ caption: "Video", kind: "video", placement: "auto" }],
};
// @ts-expect-error published gallery items carry their kind.
const galleryWithoutKind: GalleryData = { images: [{ media: "media-1", placement: "auto" }] };
// @ts-expect-error published gallery items carry their placement.
const galleryWithoutPlacement: GalleryData = { images: [{ kind: "image", media: "media-1" }] };
const galleryBadPlayback: GalleryData = {
  // @ts-expect-error playback is one of the declared modes.
  images: [{ kind: "video", placement: "auto", playback: "loop" }],
};
const galleryPlaced: GalleryData = {
  images: [
    { kind: "image", media: "media-1", placement: "end", size: "natural" },
    { kind: "video", placement: "full" },
  ],
};
// @ts-expect-error placement is one of the declared values.
const galleryBadPlacement: GalleryData = { images: [{ kind: "image", placement: "center" }] };
const galleryBadSize: GalleryData = {
  // @ts-expect-error size is one of the declared values.
  images: [{ kind: "image", placement: "auto", size: "cover" }],
};
type NavigationData = BlockDataValues<typeof builtInBlocks.navigation.fields>;
const navigationData: NavigationData = {
  links: [
    { label: "Home", url: "/" },
    { children: [{ label: "Guide", url: "/guide" }], label: "Docs" },
  ],
  name: "Main",
};
const childWithoutUrl: NavigationData = {
  // @ts-expect-error submenu links require a URL.
  links: [{ children: [{ label: "Guide" }], label: "Docs" }],
};
void [
  galleryData,
  galleryWithoutMedia,
  galleryWithoutKind,
  galleryWithoutPlacement,
  galleryBadPlayback,
  galleryPlaced,
  galleryBadPlacement,
  galleryBadSize,
  navigationData,
  childWithoutUrl,
];

export type LinkData = Expect<
  Equal<
    BlockDataValues<typeof builtInBlocks.link.fields>,
    { readonly label: string; readonly url: string }
  >
>;
export type LinkAppearance = Expect<
  Equal<
    BlockSettingsValues<NonNullable<typeof builtInBlocks.link.settings>>["appearance"],
    "button" | "text"
  >
>;
