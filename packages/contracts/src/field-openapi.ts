import { BLOCK_SETTING_FIELD_TYPES, fieldTypeCapabilities, fieldTypesWith } from "@lacecms/content";
import type { FieldType } from "@lacecms/content";

/** Recursive metadata documentation; runtime checks remain in the shared descriptors. */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const common = {
  required: { type: "boolean" },
  label: { type: "string" },
  description: { type: "string" },
} as const;
const scalarTypes = (Object.keys(fieldTypeCapabilities) as FieldType[]).filter(
  (type) => type !== "group" && type !== "list",
);
const extras: Partial<Record<FieldType, Record<string, unknown>>> = {
  text: { minLength: { type: "integer", minimum: 0 }, maxLength: { type: "integer", minimum: 0 } },
  textarea: {
    minLength: { type: "integer", minimum: 0 },
    maxLength: { type: "integer", minimum: 0 },
  },
  number: { min: { type: "number" }, max: { type: "number" } },
  select: {
    options: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } },
    presentation: ref("SelectPresentation"),
  },
  url: {
    embedProviders: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["youtube", "vimeo"] },
    },
  },
};
const scalar = (type: FieldType) => ({
  type: "object",
  additionalProperties: false,
  required: ["type", "required", ...(type === "select" ? ["options"] : [])],
  properties: {
    ...common,
    type: { const: type },
    ...(fieldTypeCapabilities[type].placeholder ? { placeholder: { type: "string" } } : {}),
    defaultValue: { type: fieldTypeCapabilities[type].valueKind },
    ...extras[type],
  },
});
const fieldMap = {
  type: "object",
  propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9]*$" },
  additionalProperties: ref("FieldDefinition"),
};
export const contentMetadataOpenApi = {
  FormLayout: {
    type: "object",
    additionalProperties: false,
    required: ["mode", "groups"],
    description:
      "Groups place distinct immediate sibling fields. Keys are unique; references and composite depth are checked by shared runtime validation.",
    properties: {
      mode: { enum: ["sections", "tabs"] },
      groups: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "label", "fields"],
          properties: {
            key: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]*$" },
            label: { type: "string", minLength: 1 },
            description: { type: "string" },
            fields: { type: "array", minItems: 1, items: { type: "string" } },
          },
        },
      },
    },
  },
  SelectPresentation: {
    type: "object",
    additionalProperties: false,
    required: ["control", "choices"],
    description:
      "Exactly one choice per declared option. Labels/descriptions are nonempty plain text; cells must not overlap.",
    properties: {
      control: { const: "cards" },
      choices: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["value", "label"],
          properties: {
            value: { type: "string" },
            label: { type: "string", minLength: 1 },
            description: { type: "string", minLength: 1 },
            diagram: {
              type: "object",
              additionalProperties: false,
              required: ["cells"],
              properties: {
                cells: {
                  type: "array",
                  minItems: 1,
                  maxItems: 16,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y", "width", "height"],
                    description: "Integer rectangle contained in a 12 by 12 canvas; no overlaps.",
                    properties: {
                      x: { type: "integer", minimum: 0, maximum: 11 },
                      y: { type: "integer", minimum: 0, maximum: 11 },
                      width: { type: "integer", minimum: 1, maximum: 12 },
                      height: { type: "integer", minimum: 1, maximum: 12 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  FieldDefinition: {
    description:
      "Finite descriptors: at most six group/list containers, two consecutive groups, and no direct list of lists. Content has at most 100 items/list and 500 list elements/snapshot. Shared runtime validation also enforces ordered length/range bounds, defaults conforming to their descriptors, select presentation matching unique options, and layout references to distinct immediate siblings.",
    oneOf: [...scalarTypes.map(scalar), ref("GroupFieldDefinition"), ref("ListFieldDefinition")],
  },
  FieldVisibility: {
    type: "object",
    description:
      "Conditional fields. Keys name immediate sibling fields; each rule names a sibling select or boolean controller that is not itself a target, and a nonempty unique subset of its options or booleans. A hidden field is not required, keeps draft validation and is retained in drafts; its value is omitted from published snapshots, public reads and build exports.",
    additionalProperties: {
      type: "object",
      additionalProperties: false,
      required: ["field", "values"],
      properties: {
        field: { type: "string" },
        values: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: ["string", "boolean"] },
        },
      },
    },
  },
  GroupFieldDefinition: {
    type: "object",
    additionalProperties: false,
    required: ["type", "required", "fields"],
    properties: {
      ...common,
      type: { const: "group" },
      fields: fieldMap,
      defaultValue: { type: "object" },
      visibility: ref("FieldVisibility"),
      layout: ref("FormLayout"),
    },
  },
  ListFieldDefinition: {
    type: "object",
    additionalProperties: false,
    required: ["type", "required", "item"],
    properties: {
      ...common,
      type: { const: "list" },
      item: { oneOf: [...scalarTypes.map(scalar), ref("GroupFieldDefinition")] },
      minItems: { type: "integer", minimum: 0, maximum: 100 },
      maxItems: { type: "integer", minimum: 0, maximum: 100 },
      itemLabel: {
        type: "string",
        description: `Immediate ${fieldTypesWith("itemLabel").join(", ")} child of a group item; presentation only.`,
      },
      defaultValue: { type: "array", maxItems: 100 },
    },
  },
  FieldMetadataMap: fieldMap,
  BlockMetadata: {
    type: "object",
    additionalProperties: false,
    required: ["type", "version", "fields"],
    properties: {
      type: { type: "string" },
      version: { type: "integer", minimum: 1 },
      label: { type: "string" },
      description: { type: "string" },
      fields: fieldMap,
      defaultValue: { type: "object" },
      visibility: ref("FieldVisibility"),
      layout: ref("FormLayout"),
      settingsLayout: ref("FormLayout"),
      settingsVisibility: {
        type: "object",
        description:
          "Keys name scalar block settings. Each rule uses an unconditional required sibling select with a valid default. Values are a nonempty unique subset of its options. No self references, chains or cycles; validation is unconditional.",
        additionalProperties: {
          type: "object",
          additionalProperties: false,
          required: ["setting", "values"],
          properties: {
            setting: { type: "string" },
            values: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } },
          },
        },
      },
      settings: {
        type: "object",
        additionalProperties: {
          oneOf: scalarTypes
            .filter((type) => (BLOCK_SETTING_FIELD_TYPES as readonly string[]).includes(type))
            .map((type) => ({
              ...scalar(type),
              required: [
                "type",
                "required",
                "defaultValue",
                ...(type === "select" ? ["options"] : []),
              ],
            })),
        },
      },
    },
  },
};
