import { defineBlock, field } from "./index.js";
import type {
  BlockDataValues,
  BlockMigration,
  JsonObject,
  FieldDefinition,
  FieldDefinitionVisitor,
  FieldIsRequired,
  FieldValue,
  SafeRichTextDocument,
} from "./index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

const text = field.text({ required: true });
const textarea = field.textarea({ defaultValue: "Draft" });
const richText = field.richText({ defaultValue: { content: [], type: "doc" } });
const number = field.number({ defaultValue: 1 });
const boolean = field.boolean({ defaultValue: false });
const date = field.date({ defaultValue: "2026-09-07" });
const datetime = field.datetime({ defaultValue: "2026-09-07T00:00:00.000Z" });
const select = field.select({ options: ["design", "engineering"] as const });
const selectWithDefault = field.select({
  defaultValue: "design",
  options: ["design", "engineering"] as const,
});
const url = field.url({ defaultValue: "https://lacecms.dev" });
const media = field.media({ defaultValue: "01K4M0D3LQYH8ND26GG2DDC8N2" });
const hero = defineBlock({
  fields: {
    eyebrow: field.text(),
    heading: field.text({ required: true }),
  },
  type: "hero",
  version: 1,
});

const versionedHero = defineBlock({
  fields: { heading: field.text({ required: true }) },
  migrations: {
    2: ({ title, ...rest }) => ({ ...rest, heading: title ?? "" }),
  },
  type: "hero",
  version: 2,
});
type _migration = Expect<
  Equal<NonNullable<typeof versionedHero.migrations>[number], BlockMigration>
>;
type _migrationInput = Expect<Equal<Parameters<BlockMigration>[0], JsonObject>>;

// @ts-expect-error migrations must return JSON object data synchronously.
defineBlock({ fields: {}, migrations: { 2: async () => ({}) }, type: "async", version: 2 });

type _text = Expect<Equal<FieldValue<typeof text>, string>>;
type _textarea = Expect<Equal<FieldValue<typeof textarea>, string>>;
type _richText = Expect<Equal<FieldValue<typeof richText>, SafeRichTextDocument>>;
type _number = Expect<Equal<FieldValue<typeof number>, number>>;
type _boolean = Expect<Equal<FieldValue<typeof boolean>, boolean>>;
type _date = Expect<Equal<FieldValue<typeof date>, string>>;
type _datetime = Expect<Equal<FieldValue<typeof datetime>, string>>;
type _select = Expect<Equal<FieldValue<typeof select>, "design" | "engineering">>;
type _url = Expect<Equal<FieldValue<typeof url>, string>>;
type _media = Expect<Equal<FieldValue<typeof media>, string>>;
type _required = Expect<Equal<FieldIsRequired<typeof text>, true>>;
type _defaultIsRequired = Expect<Equal<FieldIsRequired<typeof textarea>, true>>;
type _selectDefaultIsRequired = Expect<Equal<FieldIsRequired<typeof selectWithDefault>, true>>;
type _blockValues = Expect<
  Equal<BlockDataValues<typeof hero.fields>, Readonly<{ eyebrow?: string; heading: string }>>
>;

declare const anyField: FieldDefinition;
const _optionalCommonMetadata = anyField.label;
const _optionalDefault = anyField.defaultValue;

// @ts-expect-error Select defaults must be one of the literal choices.
field.select({ defaultValue: "other", options: ["design", "engineering"] as const });

// @ts-expect-error Number defaults must be numeric.
field.number({ defaultValue: "one" });

// @ts-expect-error A block version is mandatory.
defineBlock({ fields: {}, type: "missing-version" });

const exhaustiveVisitor: FieldDefinitionVisitor<string> = {
  boolean: () => "boolean",
  date: () => "date",
  datetime: () => "datetime",
  media: () => "media",
  number: () => "number",
  richText: () => "richText",
  select: () => "select",
  text: () => "text",
  textarea: () => "textarea",
  url: () => "url",
};
void exhaustiveVisitor;

// @ts-expect-error A visitor must handle every field discriminant.
const incompleteVisitor: FieldDefinitionVisitor<string> = { boolean: () => "boolean" };
void incompleteVisitor;

const renamedText = field.text({ renamedFrom: "headline", required: true });
const renamedValue: FieldValue<typeof renamedText> = "value";
void renamedValue;
