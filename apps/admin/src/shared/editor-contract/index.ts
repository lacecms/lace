import type { ContentBlockDto, ContentModelDto } from "@lacecms/contracts";
import type { ComponentType, ReactNode } from "react";

export type FieldDefinition = ContentModelDto["fields"][string];

/** Paths for dynamic editor controls, including arbitrarily nested composites. */
export type DraftFieldPath =
  | `fields.${string}`
  | `blocks.${number}.${"data" | "settings"}.${string}`;

/** Validated server error locations include synthetic block summary nodes. */
export type DraftIssuePath =
  | DraftFieldPath
  | "blocks.root"
  | "slug"
  | "title"
  | `blocks.${number}.${"anchor" | "block" | "className" | "key" | "schemaVersion" | "type"}`
  | `seo.${keyof SeoFormValues}`;

/** The SEO group as the editor form holds it: text inputs need strings. */
export interface SeoFormValues {
  canonical: string;
  description: string;
  image: string | null;
  noindex: boolean;
  title: string;
}

export interface DraftEditorValues {
  /** Form-only identity-to-path bookkeeping for temporarily cleared list items. */
  __transient?: Record<string, DraftFieldPath>;
  blocks: ContentBlockDto[];
  fields: Record<string, unknown>;
  /** Present for entries of models with SEO enabled. */
  seo?: SeoFormValues;
  slug?: string;
  title: string;
}

/** What a leaf contributes to the collapsed row of the list item that contains it. */
export interface ItemPreview {
  /** Leading visual, such as a thumbnail; the item's position is shown without one. */
  readonly visual?: ReactNode;
  /** Names the value, such as a filename; used when the item has no text summary. */
  readonly title?: string | undefined;
  /** Describes the value, such as type and dimensions; shown under a preview title. */
  readonly detail?: string | undefined;
  /** Advisory notes that never block saving, such as missing alt text. */
  readonly indicators?: readonly string[];
}

/** A leaf preview hands its parts to the row through `children`, so it may use hooks. */
export interface FieldPreviewProps {
  readonly definition: FieldDefinition;
  readonly value: unknown;
  /** The group item containing the leaf, for previews that consider sibling values. */
  readonly group:
    | {
        readonly definition: Extract<FieldDefinition, { type: "group" }>;
        readonly value: unknown;
      }
    | undefined;
  readonly children: (preview: ItemPreview) => ReactNode;
}

/**
 * A collapsed-row preview. `appliesTo` narrows it to some fields of its type;
 * without it the preview applies to every field of the type.
 */
export type FieldPreview = ComponentType<FieldPreviewProps> & {
  readonly appliesTo?: (definition: FieldDefinition) => boolean;
};

/**
 * Maps field types to the previews of collapsed list items. Like renderers,
 * higher layers provide previews that need their own data (media thumbnails).
 */
export type FieldPreviewRegistry = Partial<Record<FieldDefinition["type"], FieldPreview>>;

/** Content operations supplied by the composition layer to the field editor. */
export interface FieldEditorServices {
  readonly fieldProblem: (definition: FieldDefinition, value: unknown) => string | undefined;
  readonly recursiveFieldErrors: (
    definition: FieldDefinition,
    value: unknown,
  ) => Record<string, unknown>;
  readonly fieldGuidance: (definition: FieldDefinition) => string | undefined;
  readonly fieldGuidanceParts: (definition: FieldDefinition) => {
    readonly quiet?: string | undefined;
    readonly visible?: string | undefined;
  };
  readonly fieldLabel: (key: string, label: string | undefined) => string;
  readonly fieldControlId: (
    name:
      | `fields.${string}`
      | `blocks.${number}.${"anchor" | "className"}`
      | `blocks.${number}.${"data" | "settings"}.${string}`,
  ) => string;
  readonly fieldTypeSupport: Readonly<
    Record<
      FieldDefinition["type"],
      { readonly characterCount: boolean; readonly groupedControl: boolean }
    >
  >;
  readonly itemSummary: (
    definition: FieldDefinition,
    value: unknown,
    label?: string,
  ) => {
    readonly primary?: string | undefined;
    readonly secondary?: string | undefined;
    readonly media: boolean;
  };
  readonly previewLeaf: (
    definition: FieldDefinition,
    value: unknown,
    previews: FieldPreviewRegistry | undefined,
  ) =>
    | { readonly key: string; readonly definition: FieldDefinition; readonly value: unknown }
    | undefined;
  readonly rowLines: (
    summary: {
      readonly primary?: string | undefined;
      readonly secondary?: string | undefined;
      readonly media: boolean;
    },
    preview: ItemPreview | undefined,
  ) => { readonly primary: string; readonly secondary?: string | undefined };
  readonly applicableErrors: (
    fields: Readonly<Record<string, FieldDefinition>>,
    visibility: import("@lacecms/content").FieldVisibility | undefined,
    values: unknown,
    errors: unknown,
  ) => unknown;
  readonly applicableValueErrors: (
    definition: FieldDefinition,
    value: unknown,
    errors: unknown,
  ) => unknown;
  readonly hiddenFieldNote: (
    fields: Readonly<Record<string, FieldDefinition>>,
    visibility: import("@lacecms/content").FieldVisibility | undefined,
    key: string,
  ) => string | undefined;
  readonly renderedFieldKeys: (
    fields: Readonly<Record<string, FieldDefinition>>,
    visibility: import("@lacecms/content").FieldVisibility | undefined,
    values: unknown,
    errors: unknown,
  ) => ReadonlySet<string> | undefined;
  readonly shownFieldKeys: (
    fields: Readonly<Record<string, FieldDefinition>>,
    visibility: import("@lacecms/content").FieldVisibility | undefined,
    values: unknown,
  ) => Set<string>;
  readonly mediaListTarget: (item: FieldDefinition) => { readonly key?: string } | undefined;
  readonly mediaListChoices: (
    item: FieldDefinition,
    target: { readonly key?: string },
  ) => { readonly label: string; readonly value: string; readonly item: Record<string, unknown> }[];
  readonly mediaListItems: (
    item: FieldDefinition,
    target: { readonly key?: string },
    ids: readonly string[],
  ) => unknown[];
  readonly mediaIdsInList: (
    target: { readonly key?: string },
    list: readonly unknown[],
  ) => Set<string>;
  readonly mediaListCapacity: (input: {
    readonly fits: (next: readonly unknown[]) => boolean;
    readonly item: FieldDefinition;
    readonly list: readonly unknown[];
    readonly maximum: number;
    readonly target: { readonly key?: string };
  }) => { readonly capacity: number; readonly cause: "budget" | "list" };
  readonly cleanValue: (value: unknown, definition?: FieldDefinition) => unknown;
  readonly draftItemValue: (definition: FieldDefinition) => unknown;
  readonly duplicateItem: <T>(items: readonly T[], index: number) => T[];
  readonly fieldStartingValue: (definition: FieldDefinition, value: unknown) => unknown;
  readonly moveItem: <T>(items: readonly T[], from: number, to: number) => T[];
  readonly newItemIdentity: () => string;
  readonly record: (value: unknown) => value is Record<string, unknown>;
  readonly replacePath: (
    value: unknown,
    path: readonly (string | number)[],
    next: unknown,
  ) => unknown;
  readonly snapshotBudget: (
    model: ContentModelDto,
    values: DraftEditorValues,
  ) => { readonly count: number; readonly problem: string | undefined };
}
