import type { RichTextElementDescription, RichTextSource } from "@lacecms/render";

/** Props an override component receives; its rendered children arrive in the default slot. */
export interface RichTextOverrideProps {
  readonly element: RichTextElementDescription;
}

/** An Astro component (or compatible function) that renders one rich-text element. */
export type RichTextOverride = (props: RichTextOverrideProps) => unknown;

/** Override components keyed by the originating rich-text node or mark name. */
export type RichTextComponents = Readonly<Partial<Record<RichTextSource, RichTextOverride>>>;
