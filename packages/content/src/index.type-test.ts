import { defineBlock, field } from "./index.js";
import type {
  BlockDataValues,
  BlockMigration,
  BlockMigrationInput,
  BlockSettingsValues,
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
    2: ({ data: { title, ...rest }, settings }) => ({
      data: { ...rest, heading: title ?? "" },
      settings,
    }),
  },
  type: "hero",
  version: 2,
});
type _migration = Expect<
  Equal<NonNullable<typeof versionedHero.migrations>[number], BlockMigration>
>;
type _migrationInput = Expect<Equal<Parameters<BlockMigration>[0], BlockMigrationInput>>;

defineBlock({
  fields: {},
  // @ts-expect-error migrations must return JSON object data synchronously.
  migrations: { 2: async () => ({ data: {} }) },
  type: "async",
  version: 2,
});
// @ts-expect-error migrations return `{data, settings?}`, not bare data.
defineBlock({ fields: {}, migrations: { 2: () => 1 }, type: "bare", version: 2 });

const panel = defineBlock({
  fields: {},
  settings: {
    align: field.select({ defaultValue: "left", options: ["left", "center"] as const }),
    boxed: field.boolean({ defaultValue: false }),
  },
  type: "panel",
  version: 1,
});
type _settings = Expect<
  Equal<
    BlockSettingsValues<NonNullable<typeof panel.settings>>,
    Readonly<{ align: "center" | "left"; boxed: boolean }>
  >
>;
type _noSettings = Expect<
  Equal<typeof hero.settings, undefined | Readonly<Record<never, FieldDefinition>>>
>;

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
  group: () => "group",
  list: () => "list",
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

const composite = field.list({
  item: field.group({
    fields: {
      kind: field.select({ options: ["image", "video"] as const, required: true }),
      caption: field.text(),
    },
  }),
  required: true,
});
const compositeValues: FieldValue<typeof composite> = [{ kind: "image" }];
// @ts-expect-error nested literal select remains narrow.
const wrongComposite: FieldValue<typeof composite> = [{ kind: "audio" }];
// @ts-expect-error list items cannot be lists.
field.list({ item: field.list({ item: field.text() }) });
// @ts-expect-error group defaults preserve child scalar types.
field.group({ fields: { count: field.number() }, defaultValue: { count: "bad" } });
const partialDefault = field.group({
  fields: { heading: field.text({ required: true }) },
  defaultValue: {},
});
const depthSix = field.list({
  item: field.group({
    fields: {
      children: field.list({
        item: field.group({
          fields: {
            children: field.list({
              item: field.group({ fields: { name: field.text({ required: true }) } }),
            }),
          },
        }),
      }),
    },
  }),
});
const deepValue: FieldValue<typeof depthSix> = [{ children: [{ children: [{ name: "leaf" }] }] }];
void [compositeValues, wrongComposite, partialDefault, deepValue];

const labelledItems = field.list({ itemLabel: "kind", item: composite.item });
const labelledValues: FieldValue<typeof labelledItems> = [{ kind: "image" }];
const labelOption: string = labelledItems.itemLabel;
// @ts-expect-error presentation metadata does not widen the item content type
const badLabelledValue: FieldValue<typeof labelledItems> = [{ kind: "other" }];
void [labelledValues, labelOption, badLabelledValue];
