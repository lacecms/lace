import { ContentValidationError, effectiveAltText, validateBlockData } from "@lacecms/content";
import type { BlockDataValues, BlockDefinition, ModelFieldDefinitions } from "@lacecms/content";
import { LaceRenderError } from "./errors.js";
import type { BlockContext } from "./errors.js";

/** The structural block shape the render core reads; the public block DTO satisfies it. */
export interface RenderableBlock {
  readonly data: unknown;
  readonly key: string;
  readonly position: number;
  readonly schemaVersion: number;
  readonly type: string;
}

/** The structural shape of one resolved media item; the SDK's published media satisfies it. */
export interface RenderableMedia {
  readonly alt: string | null;
  readonly caption: string | null;
  readonly focalPoint: { readonly x: number; readonly y: number } | null;
  readonly height: number | null;
  readonly url: string;
  readonly width: number | null;
}

/** The structural entry shape whose blocks the render core prepares. */
export interface RenderableEntry {
  readonly blocks: readonly RenderableBlock[];
  readonly id: string;
  /** Resolves the entry's media; the published-site entries provide it. */
  readonly media?: (mediaId: string) => RenderableMedia | undefined;
  readonly modelKey: string;
}

/** What a block component needs to render one image without layout shift. */
export interface ImageDescription {
  /** The effective alt text: usage alt, then media alt, then `""`. */
  readonly alt: string;
  readonly caption?: string;
  readonly height?: number;
  /** A CSS `object-position` derived from the focal point, such as `25% 40%`. */
  readonly objectPosition?: string;
  readonly src: string;
  readonly width?: number;
}

/** Describes one media usage; the optional usage alt overrides the media alt. */
export type ImageDescriber = (mediaId: string, usageAlt?: string | null) => ImageDescription;

// oxlint-disable-next-line typescript/no-explicit-any -- definitions vary by field record.
type AnyBlockDefinition = BlockDefinition<any>;

/** The parsed data type of a block definition. */
export type BlockDataOf<Definition extends AnyBlockDefinition> =
  Definition extends BlockDefinition<infer Fields extends ModelFieldDefinitions>
    ? BlockDataValues<Fields>
    : never;

/** Builds a public media URL for a media identifier. */
export type MediaUrlBuilder = (mediaId: string) => string;

/** The props every framework adapter passes to a block component. */
export interface BlockProps<Definition extends AnyBlockDefinition = BlockDefinition> {
  readonly block: RenderableBlock;
  readonly context: BlockContext;
  readonly data: BlockDataOf<Definition>;
  readonly image: ImageDescriber;
  readonly mediaUrl: MediaUrlBuilder;
}

/** Pairs a block definition with the adapter-specific component that renders it. */
export interface BlockMapEntry<
  Definition extends AnyBlockDefinition = AnyBlockDefinition,
  Component = unknown,
> {
  readonly component: Component;
  readonly definition: Definition;
}

/** Block map entries keyed by block type. */
export type BlockMap<Component = unknown> = Readonly<
  Record<string, BlockMapEntry<AnyBlockDefinition, Component>>
>;

/** One block ready for an adapter to render. */
export interface PreparedBlock<Component = unknown> {
  readonly component: Component;
  readonly props: BlockProps<AnyBlockDefinition>;
}

/**
 * Validates a block's data against its definition in publish mode, applying the
 * definition's defaults. The render core never migrates block data.
 */
export function parseBlock<Definition extends AnyBlockDefinition>(
  definition: Definition,
  block: RenderableBlock,
  context: BlockContext,
): BlockDataOf<Definition> {
  if (block.type !== definition.type) {
    throw new LaceRenderError(
      "unknown_block_type",
      `block type ${block.type} does not match the ${definition.type} definition.`,
      { context },
    );
  }
  if (block.schemaVersion !== definition.version) {
    throw new LaceRenderError(
      "block_version_mismatch",
      `${block.type} block data has schema version ${block.schemaVersion}, but the site's definition is version ${definition.version}.`,
      { context },
    );
  }
  try {
    return validateBlockData(definition, block.data, "publish") as BlockDataOf<Definition>;
  } catch (error) {
    if (error instanceof ContentValidationError) {
      const issue = error.issues[0];
      throw new LaceRenderError(
        "invalid_block_data",
        issue === undefined ? error.message : issue.message,
        { cause: error, context, fieldPath: issue?.path ?? [] },
      );
    }
    throw error;
  }
}

/** Defines an immutable block map; each key must equal its definition's type. */
export function defineBlockMap<const Entries extends BlockMap>(
  entries: Entries,
): Readonly<Entries> {
  if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
    throw new TypeError("A block map must be an object keyed by block type.");
  }
  const map: Record<string, BlockMapEntry> = {};
  for (const [type, entry] of Object.entries(entries)) {
    if (entry === null || typeof entry !== "object" || typeof entry.definition !== "object") {
      throw new TypeError(`Block map entry ${type} must have a definition and a component.`);
    }
    if (entry.definition.type !== type) {
      throw new TypeError(
        `Block map key ${type} must equal its definition type ${entry.definition.type}.`,
      );
    }
    map[type] = Object.freeze({ component: entry.component, definition: entry.definition });
  }
  return Object.freeze(map) as Readonly<Entries>;
}

/** Returns the block map entry for a block, failing when the site cannot render its type. */
export function resolveBlock<Component>(
  map: BlockMap<Component>,
  block: RenderableBlock,
  context: BlockContext,
): BlockMapEntry<AnyBlockDefinition, Component> {
  const entry = Object.hasOwn(map, block.type) ? map[block.type] : undefined;
  if (entry === undefined) {
    throw new LaceRenderError(
      "unknown_block_type",
      `the site has no component for block type ${block.type}.`,
      { context },
    );
  }
  return entry;
}

function percentage(value: number): string {
  return `${Math.round(value * 10_000) / 100}%`;
}

/**
 * Creates the image describer of one block. With resolved media it uses their
 * URL, dimensions, caption, and focal point; without them it falls back to the
 * media URL builder and the usage alt text.
 */
export function createImageDescriber(
  entry: RenderableEntry,
  mediaUrl: MediaUrlBuilder,
  context: BlockContext,
): ImageDescriber {
  return (mediaId, usageAlt) => {
    if (entry.media === undefined)
      return Object.freeze({ alt: effectiveAltText(usageAlt, undefined), src: mediaUrl(mediaId) });
    const media = entry.media(mediaId);
    if (media === undefined) {
      throw new LaceRenderError(
        "missing_media",
        `media ${mediaId} is not among the entry's resolved media.`,
        { context },
      );
    }
    return Object.freeze({
      alt: effectiveAltText(usageAlt, media.alt),
      ...(media.caption === null ? {} : { caption: media.caption }),
      ...(media.height === null ? {} : { height: media.height }),
      ...(media.focalPoint === null
        ? {}
        : {
            objectPosition: `${percentage(media.focalPoint.x)} ${percentage(media.focalPoint.y)}`,
          }),
      src: media.url,
      ...(media.width === null ? {} : { width: media.width }),
    });
  };
}

/** Resolves and parses an entry's blocks in order, producing each component and its props. */
export function prepareBlocks<Component>(
  map: BlockMap<Component>,
  entry: RenderableEntry,
  mediaUrl: MediaUrlBuilder,
): readonly PreparedBlock<Component>[] {
  return Object.freeze(
    entry.blocks.map((block) => {
      const context: BlockContext = Object.freeze({
        blockKey: block.key,
        entryId: entry.id,
        modelKey: entry.modelKey,
      });
      const { component, definition } = resolveBlock(map, block, context);
      const data = parseBlock(definition, block, context);
      const image = createImageDescriber(entry, mediaUrl, context);
      return Object.freeze({
        component,
        props: Object.freeze({ block, context, data, image, mediaUrl }),
      });
    }),
  );
}
