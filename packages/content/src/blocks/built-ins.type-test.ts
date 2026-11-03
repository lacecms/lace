import { builtInBlocks } from "../index.js";
import type { BlockDataValues, BlockSettingsValues } from "../index.js";
import type { Equal, Expect } from "../test-support/type-assertions.js";

type GalleryData = BlockDataValues<typeof builtInBlocks.gallery.fields>;
const galleryData: GalleryData = {
  images: [
    { kind: "image", media: "media-1" },
    { alt: "Override", caption: "Studio", kind: "image", media: "media-2" },
    { kind: "video", videoTitle: "Tour", videoUrl: "https://vimeo.com/1", playback: "ambient" },
  ],
  title: "Studio",
};
// Published items carry a kind; conditional targets such as media are optional.
const galleryWithoutMedia: GalleryData = { images: [{ caption: "Video", kind: "video" }] };
// @ts-expect-error published gallery items carry their kind.
const galleryWithoutKind: GalleryData = { images: [{ media: "media-1" }] };
// @ts-expect-error playback is one of the declared modes.
const galleryBadPlayback: GalleryData = { images: [{ kind: "video", playback: "loop" }] };
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
  galleryBadPlayback,
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
