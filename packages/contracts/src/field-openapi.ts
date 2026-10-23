/** Recursive metadata documentation; runtime checks remain in the shared descriptors. */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const common = {
  required: { type: "boolean" },
  label: { type: "string" },
  description: { type: "string" },
} as const;
const scalarTypes = [
  "text",
  "textarea",
  "richText",
  "number",
  "boolean",
  "date",
  "datetime",
  "select",
  "url",
  "media",
] as const;
const scalar = (type: (typeof scalarTypes)[number]) => ({
  type: "object",
  additionalProperties: false,
  required: ["type", "required", ...(type === "select" ? ["options"] : [])],
  properties: {
    ...common,
    type: { const: type },
    ...(["text", "textarea", "url", "number", "select", "richText"].includes(type)
      ? { placeholder: { type: "string" } }
      : {}),
    defaultValue: {
      type:
        type === "number"
          ? "number"
          : type === "boolean"
            ? "boolean"
            : type === "richText"
              ? "object"
              : "string",
    },
    ...(["text", "textarea"].includes(type)
      ? { minLength: { type: "integer", minimum: 0 }, maxLength: { type: "integer", minimum: 0 } }
      : {}),
    ...(type === "number" ? { min: { type: "number" }, max: { type: "number" } } : {}),
    ...(type === "select"
      ? {
          options: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } },
          presentation: ref("SelectPresentation"),
        }
      : {}),
  },
});
const fieldMap = {
  type: "object",
  propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9]*$" },
  additionalProperties: ref("FieldDefinition"),
};
export const contentMetadataOpenApi = {
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
      "Finite descriptors: at most six group/list containers, two consecutive groups, and no direct list of lists. Content has at most 100 items/list and 500 list elements/snapshot.",
    oneOf: [...scalarTypes.map(scalar), ref("GroupFieldDefinition"), ref("ListFieldDefinition")],
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
        description:
          "Immediate text, textarea, select or URL child of a group item; presentation only.",
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
          oneOf: ["text", "number", "boolean", "select"].map((type) => ({
            ...scalar(type as (typeof scalarTypes)[number]),
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
