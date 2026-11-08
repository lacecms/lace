import type {
  ModelFieldDefinitions,
  CommonFieldOptions,
  DraftFieldValue,
  FormLayout,
  FieldVisibilityInput,
  CommonDefinition,
  PropertyFrom,
  ListItemDefinition,
} from "./definitions.js";
import { normalizeCompositeOptions } from "./normalization.js";
import { scalarField } from "./scalar-builders.js";

/** Builders for portable Lace field descriptors. */
export const field = {
  /** Define named child fields stored as one plain object. */
  group<const Options extends { readonly fields: ModelFieldDefinitions }>(
    options: Options &
      CommonFieldOptions<
        NoInfer<{
          readonly [Key in keyof Options["fields"]]?: DraftFieldValue<Options["fields"][Key]>;
        }>
      > & {
        readonly layout?: FormLayout<keyof Options["fields"] & string>;
        readonly visibility?: FieldVisibilityInput<Options["fields"], Options>;
      },
  ): CommonDefinition<"group", Options> &
    PropertyFrom<Options, "layout"> &
    PropertyFrom<Options, "visibility"> & { readonly fields: Options["fields"] } {
    return normalizeCompositeOptions("group", options) as unknown as CommonDefinition<
      "group",
      Options
    > &
      PropertyFrom<Options, "layout"> &
      PropertyFrom<Options, "visibility"> & { readonly fields: Options["fields"] };
  },

  /** Define an ordered array of scalar or group values. */
  list<
    const Options extends {
      readonly item: ListItemDefinition;
      readonly minItems?: number;
      readonly maxItems?: number;
      readonly itemLabel?: string;
    },
  >(
    options: Options & CommonFieldOptions<NoInfer<readonly DraftFieldValue<Options["item"]>[]>>,
  ): CommonDefinition<"list", Options> & { readonly item: Options["item"] } & PropertyFrom<
      Options,
      "minItems"
    > &
    PropertyFrom<Options, "maxItems"> &
    PropertyFrom<Options, "itemLabel"> {
    return normalizeCompositeOptions("list", options) as unknown as CommonDefinition<
      "list",
      Options
    > & { readonly item: Options["item"] } & PropertyFrom<Options, "minItems"> &
      PropertyFrom<Options, "maxItems"> &
      PropertyFrom<Options, "itemLabel">;
  },

  ...scalarField,
} as const;
