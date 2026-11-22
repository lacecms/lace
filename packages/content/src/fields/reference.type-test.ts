import { field } from "./builders.js";
import type { BlockDataValues, FieldValue } from "./definitions.js";
import type { Equal, Expect } from "../test-support/type-assertions.js";

const author = field.reference({ models: ["people", "contributors"], required: true });
const endorsements = field.list({
  item: field.group({
    fields: { reviewers: field.list({ item: author, required: true }) },
  }),
  required: true,
});
type _Models = Expect<Equal<(typeof author.models)[number], "people" | "contributors">>;
type _Author = Expect<Equal<FieldValue<typeof author>, string>>;
type _Nested = Expect<
  Equal<
    BlockDataValues<{ endorsements: typeof endorsements }>,
    Readonly<{ endorsements: readonly Readonly<{ reviewers: readonly string[] }>[] }>
  >
>;

// @ts-expect-error The descriptor requires a model allowlist.
field.reference({});
// @ts-expect-error Defaults are raw entry ID strings.
field.reference({ models: ["people"], defaultValue: { id: "ada" } });
// @ts-expect-error Multiple selections are composed with field.list.
field.reference({ models: ["people"], multiple: true });
// @ts-expect-error The scalar has no placeholder option.
field.reference({ models: ["people"], placeholder: "Author" });
