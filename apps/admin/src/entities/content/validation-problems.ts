import type { ContentBlockDto, ContentModelDto } from "@lacecms/contracts";
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
  readonly id: string;
  readonly label: string;
  readonly message: string;
  /** Absent for a server issue the editor cannot place. */
  readonly target: ProblemTarget | undefined;
}

type Messages = Readonly<Record<string, { readonly message?: unknown } | undefined>>;

const blockLevelKeys = ["key", "type", "schemaVersion", "block"] as const;

function messageOf(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const { message } = value as { readonly message?: unknown };
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

/**
 * The messages of one block's errors that belong to no single visible field:
 * key, type, version, whole-block issues, and data for undefined fields.
 */
export function blockLevelProblems(
  error: Readonly<Record<string, unknown>> | undefined,
  fields: Readonly<Record<string, unknown>>,
): string[] {
  if (error === undefined) return [];
  const messages = blockLevelKeys
    .map((key) => messageOf(error[key]))
    .filter((message): message is string => message !== undefined);
  const data = (error.data ?? {}) as Messages;
  for (const [key, value] of Object.entries(data)) {
    const message = messageOf(value);
    if (message !== undefined && !Object.hasOwn(fields, key)) messages.push(message);
  }
  return messages;
}

/**
 * Lists every current validation problem in reading order: title, the block
 * list, each block in order, slug, model fields, SEO values in card order,
 * then issues the editor could not place.
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
      id: "title",
      label: "Title",
      message: title,
      target: { id: "system-title", kind: "control" },
    });

  const blockErrors = (errors.blocks ?? {}) as Readonly<Record<string, unknown>>;
  const listMessage = messageOf(blockErrors.root);
  if (listMessage !== undefined)
    problems.push({
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
    const blockName = `${fieldLabel(block.type, definition?.label)} block ${index + 1}`;
    for (const [position, message] of blockLevelProblems(error, fields).entries())
      problems.push({
        id: `block-${block.key}-${position}`,
        label: blockName,
        message,
        target: { key: block.key, kind: "block" },
      });
    const data = (error.data ?? {}) as Messages;
    for (const [key, field] of Object.entries(fields)) {
      const message = messageOf(data[key]);
      if (message === undefined) continue;
      problems.push({
        id: `block-${block.key}-${key}`,
        label: `${fieldLabel(key, field.label)} in ${blockName}`,
        message,
        target: { id: fieldControlId(`blocks.${index}.data.${key}`), kind: "control" },
      });
    }
  }

  const slug = messageOf(errors.slug);
  if (slug !== undefined)
    problems.push({
      id: "slug",
      label: "Slug",
      message: slug,
      target: { id: "system-slug", kind: "control" },
    });
  const fieldErrors = (errors.fields ?? {}) as Messages;
  for (const [key, field] of Object.entries(model.fields)) {
    const message = messageOf(fieldErrors[key]);
    if (message === undefined) continue;
    problems.push({
      id: `field-${key}`,
      label: fieldLabel(key, field.label),
      message,
      target: { id: fieldControlId(`fields.${key}`), kind: "control" },
    });
  }
  const seoErrors = (errors.seo ?? {}) as Messages;
  for (const control of SEO_CONTROLS) {
    const message = messageOf(seoErrors[control.key]);
    if (message === undefined) continue;
    problems.push({
      id: control.id,
      label: control.label,
      message,
      target: { id: control.id, kind: "control" },
    });
  }
  for (const [index, message] of unmapped.entries())
    problems.push({ id: `unmapped-${index}`, label: "Draft", message, target: undefined });
  return problems;
}
