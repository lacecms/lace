import type { Equal, Expect } from "../test-support/type-assertions.js";

type _listQueryable = Expect<
  Equal<
    import("../index.js").ListQueryableFieldType,
    "text" | "textarea" | "url" | "select" | "number" | "boolean" | "date" | "datetime"
  >
>;
type _searchable = Expect<Equal<import("../index.js").SearchableFieldType, "text" | "textarea">>;
type _seoText = Expect<Equal<import("../index.js").SeoTextFieldType, "text" | "textarea">>;
type _itemLabel = Expect<
  Equal<import("../index.js").ItemLabelFieldType, "text" | "textarea" | "select" | "url">
>;
type _placeholder = Expect<
  Equal<
    import("../index.js").PlaceholderFieldType,
    "text" | "textarea" | "richText" | "number" | "select" | "url"
  >
>;
const invalidCapability: import("../index.js").FieldTypeCapability = {
  listQueryable: false,
  // @ts-expect-error Non-queryable kinds cannot declare a sort family.
  sortableAs: "string",
  searchable: false,
  seoText: false,
  itemLabel: false,
  placeholder: false,
  valueKind: "object",
};
void invalidCapability;
