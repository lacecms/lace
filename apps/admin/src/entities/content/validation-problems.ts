import type { ContentBlockDto, ContentModelDto } from "@lacecms/contracts";
import { formFieldKeys } from "@lacecms/content";
import type { FieldMetadata } from "@lacecms/content";
import { locationField } from "./editor-form.js";
import type { FieldErrors } from "react-hook-form";
import { fieldLabel } from "./draft.js";
import type { DraftEditorValues } from "./editor-form.js";
import { fieldControlId } from "./field-types.js";
import { SEO_CONTROLS } from "./seo.js";

/** Where activating a validation problem moves focus. */
export type ProblemTarget =
  | { readonly id: string; readonly kind: "control" }
  | { readonly key: string; readonly kind: "block" }
  | { readonly kind: "blocks" };

/** One validation problem in the editor's reading order. */
export interface ValidationProblem {
  /**
   * False for a problem only publication reports in a block that is now
   * hidden: publication validates hidden blocks in draft mode.
   */
  readonly blocking: boolean;
  readonly id: string;
  readonly label: string;
  readonly message: string;
  /** Absent for a server issue the editor cannot place. */
  readonly target: ProblemTarget | undefined;
}

type Messages = Readonly<Record<string, { readonly message?: unknown } | undefined>>;

const blockLevelKeys = ["key", "type", "schemaVersion", "block"] as const;

/** The error type of server issues that only publication reports. */
export const PUBLICATION_ISSUE_TYPE = "publication";

function isPublicationOnly(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { readonly type?: unknown }).type === PUBLICATION_ISSUE_TYPE
  );
}

function messageOf(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const { message } = value as { readonly message?: unknown };
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

/**
 * The messages of one block's errors that belong to no single visible
 * control: key, type, version, whole-block issues, data for undefined fields
 * and values for undeclared settings.
 */
export function blockLevelProblems(
  error: Readonly<Record<string, unknown>> | undefined,
  fields: Readonly<Record<string, unknown>>,
  settings: Readonly<Record<string, unknown>> = {},
): string[] {
  if (error === undefined) return [];
  const messages = blockLevelKeys
    .map((key) => messageOf(error[key]))
    .filter((message): message is string => message !== undefined);
  for (const [group, declared] of [
    ["data", fields],
    ["settings", settings],
  ] as const) {
    for (const [key, value] of Object.entries((error[group] ?? {}) as Messages)) {
      const message = messageOf(value);
      if (message !== undefined && !Object.hasOwn(declared, key)) messages.push(message);
    }
  }
  return messages;
}

function recursiveProblems(
  definition: FieldMetadata | undefined,
  value: unknown,
  name: string,
  label: string,
  hidden = false,
): ValidationProblem[] {
  if (value === null || typeof value !== "object") return [];
  const entries = value as Record<string, unknown>;
  const problems: ValidationProblem[] = [];
  const message = messageOf(value);
  if (message)
    problems.push({
      blocking: !(hidden && isPublicationOnly(value)),
      id: name,
      label,
      message,
      target: definition
        ? { kind: "control", id: fieldControlId(name as `fields.${string}`) }
        : undefined,
    });
  if (definition?.type === "group")
    for (const key of formFieldKeys(definition.fields, definition.layout)) {
      const child = definition.fields[key]!;
      problems.push(
        ...recursiveProblems(
          child,
          entries[key],
          `${name}.${key}`,
          `${fieldLabel(key, child.label)} in ${label}`,
          hidden,
        ),
      );
    }
  if (definition?.type === "list")
    for (const key of Object.keys(value)
      .filter((key) => /^(0|[1-9]\d*)$/u.test(key))
      .sort((a, b) => Number(a) - Number(b)))
      problems.push(
        ...recursiveProblems(
          definition.item,
          entries[key],
          `${name}.${key}`,
          `Item ${Number(key) + 1} in ${label}`,
          hidden,
        ),
      );
  if (definition?.type === "group")
    for (const key of Object.keys(value)) {
      if (!["message", "type", "ref"].includes(key) && !Object.hasOwn(definition.fields, key))
        problems.push(
          ...recursiveProblems(
            undefined,
            entries[key],
            `${name}.${key}`,
            `${fieldLabel(key, undefined)} in ${label}`,
            hidden,
          ),
        );
    }
  return problems;
}

/**
 * Lists every current validation problem in reading order: title, the block
 * list, each block in order (block-level problems, content fields, then the
 * anchor, declared settings and CSS classes of its Settings tab), slug, model
 * fields, SEO values in card order, then issues the editor could not place.
 * Problems that do not block publication come last.
 */
export function validationProblems({
  blocks,
  errors,
  model,
  unmapped = [],
}: {
  readonly blocks: readonly ContentBlockDto[];
  readonly errors: FieldErrors<DraftEditorValues>;
  readonly model: ContentModelDto;
  readonly unmapped?: readonly string[];
}): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const title = messageOf(errors.title);
  if (title !== undefined)
    problems.push({
      blocking: true,
      id: "title",
      label: "Title",
      message: title,
      target: { id: "system-title", kind: "control" },
    });

  const blockErrors = (errors.blocks ?? {}) as Readonly<Record<string, unknown>>;
  const listMessage = messageOf(blockErrors.root);
  if (listMessage !== undefined)
    problems.push({
      blocking: true,
      id: "blocks",
      label: "Blocks",
      message: listMessage,
      target: { kind: "blocks" },
    });
  for (const [index, block] of blocks.entries()) {
    const error = blockErrors[index] as Readonly<Record<string, unknown>> | undefined;
    if (error === undefined) continue;
    const definition = model.blockDefinitions?.find((item) => item.type === block.type);
    const fields = definition?.fields ?? {};
    const settings = definition?.settings ?? {};
    const blockName = `${fieldLabel(block.type, definition?.label)} block ${index + 1}${
      block.hidden ? " (hidden)" : ""
    }`;
    for (const [position, message] of blockLevelProblems(error, fields, settings).entries())
      problems.push({
        blocking: true,
        id: `block-${block.key}-${position}`,
        label: blockName,
        message,
        target: { key: block.key, kind: "block" },
      });
    const controls: readonly (readonly [
      id: string,
      label: string,
      value: unknown,
      name: Parameters<typeof fieldControlId>[0],
    ])[] = [
      ...formFieldKeys(fields, definition?.layout).map(
        (key) =>
          [
            key,
            fieldLabel(key, fields[key]!.label),
            (error.data as Messages | undefined)?.[key],
            `blocks.${index}.data.${key}`,
          ] as const,
      ),
      ["envelope-anchor", "Anchor", error.anchor, `blocks.${index}.anchor`],
      ...formFieldKeys(settings, definition?.settingsLayout).map(
        (key) =>
          [
            `settings-${key}`,
            fieldLabel(key, settings[key]!.label),
            (error.settings as Messages | undefined)?.[key],
            `blocks.${index}.settings.${key}`,
          ] as const,
      ),
      ["envelope-className", "CSS classes", error.className, `blocks.${index}.className`],
    ];
    for (const [id, label, value, name] of controls) {
      const definition = locationField(name, model, blocks);
      if (definition?.type === "group" || definition?.type === "list") {
        problems.push(
          ...recursiveProblems(definition, value, name, `${label} in ${blockName}`, block.hidden),
        );
        continue;
      }
      const message = messageOf(value);
      if (message === undefined) continue;
      problems.push({
        blocking: !(block.hidden && isPublicationOnly(value)),
        id: `block-${block.key}-${id}`,
        label: `${label} in ${blockName}`,
        message,
        target: { id: fieldControlId(name), kind: "control" },
      });
    }
  }

  const slug = messageOf(errors.slug);
  if (slug !== undefined)
    problems.push({
      blocking: true,
      id: "slug",
      label: "Slug",
      message: slug,
      target: { id: "system-slug", kind: "control" },
    });
  const fieldErrors = (errors.fields ?? {}) as Messages;
  for (const key of formFieldKeys(model.fields, model.layout)) {
    const field = model.fields[key]!;
    if (field.type === "group" || field.type === "list") {
      problems.push(
        ...recursiveProblems(
          field,
          fieldErrors[key],
          `fields.${key}`,
          fieldLabel(key, field.label),
        ),
      );
    } else {
      const message = messageOf(fieldErrors[key]);
      if (message)
        problems.push({
          blocking: true,
          id: `field-${key}`,
          label: fieldLabel(key, field.label),
          message,
          target: { id: fieldControlId(`fields.${key}`), kind: "control" },
        });
    }
  }
  const fieldRoot = messageOf(fieldErrors.root);
  if (fieldRoot)
    problems.push({
      blocking: true,
      id: "fields-root",
      label: "Fields",
      message: fieldRoot,
      target: { kind: "control", id: "entry-fields-title" },
    });

  const seoErrors = (errors.seo ?? {}) as Messages;
  for (const control of SEO_CONTROLS) {
    const message = messageOf(seoErrors[control.key]);
    if (message === undefined) continue;
    problems.push({
      blocking: true,
      id: control.id,
      label: control.label,
      message,
      target: { id: control.id, kind: "control" },
    });
  }
  for (const [index, message] of unmapped.entries())
    problems.push({
      blocking: true,
      id: `unmapped-${index}`,
      label: "Draft",
      message,
      target: undefined,
    });
  return [
    ...problems.filter((problem) => problem.blocking),
    ...problems.filter((problem) => !problem.blocking),
  ];
}
