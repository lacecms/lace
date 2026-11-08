import { field, encodeEntryLink, decodeEntryLink } from "../index.js";
import type {
  FieldDefinition,
  FieldDefinitionVisitor,
  FieldIsRequired,
  FieldValue,
  SafeRichTextDocument,
} from "../index.js";
import type { Equal, Expect } from "../test-support/type-assertions.js";

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
const internalUrl: FieldValue<typeof url> = encodeEntryLink("opaque/target");
const internalTarget: string | undefined = decodeEntryLink(internalUrl);
void internalTarget;
const media = field.media({ defaultValue: "01K4M0D3LQYH8ND26GG2DDC8N2" });

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

declare const anyField: FieldDefinition;
const _optionalCommonMetadata = anyField.label;
const _optionalDefault = anyField.defaultValue;

// @ts-expect-error Select defaults must be one of the literal choices.
field.select({ defaultValue: "other", options: ["design", "engineering"] as const });

// @ts-expect-error Number defaults must be numeric.
field.number({ defaultValue: "one" });

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

const promptedText = field.text({ required: true, placeholder: "Title" });
const promptedChoice = field.select({ options: ["a", "b"] as const, placeholder: "Choose" });
const promptLiteral: "Title" = promptedText.placeholder;
const promptValue: FieldValue<typeof promptedChoice> = "a";
void promptLiteral;
void promptValue;
// @ts-expect-error A placeholder does not widen select values.
const invalidPromptValue: FieldValue<typeof promptedChoice> = "c";
void invalidPromptValue;

field.group({
  fields: { title: field.text() },
  layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["title"] }] },
});
field.group({
  fields: { title: field.text() },
  // @ts-expect-error Layout references immediate siblings only.
  layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["unknown"] }] },
});

const cardSelect = field.select({
  options: ["a", "b"],
  required: true,
  presentation: {
    control: "cards",
    choices: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  },
});
export type CardSelectValue = Expect<Equal<FieldValue<typeof cardSelect>, "a" | "b">>;

const embedUrl = field.url({ embedProviders: ["youtube", "vimeo"], required: true });
type _EmbedUrlValue = Expect<Equal<FieldValue<typeof embedUrl>, string>>;
const embedProviders: readonly ("youtube" | "vimeo")[] = embedUrl.embedProviders;
void embedProviders;
// @ts-expect-error unsupported provider
field.url({ embedProviders: ["other"] });
const plainGroup = field.group({ fields: { title: field.text({ required: true }) } });
export type UnconditionalGroupUnchanged = Expect<
  Equal<FieldValue<typeof plainGroup>, Readonly<{ title: string } & {}>>
>;
