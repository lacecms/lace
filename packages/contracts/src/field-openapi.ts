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
      ? { options: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } } }
      : {}),
  },
});
const fieldMap = {
  type: "object",
  propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9]*$" },
  additionalProperties: ref("FieldDefinition"),
};
export const contentMetadataOpenApi = {
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
