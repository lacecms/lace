import { createContext, type ReactNode, useContext, useMemo } from "react";
import { Controller, type Control } from "react-hook-form";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import type { DraftEditorValues } from "../editor-form.js";
import { fieldLabel } from "../draft.js";
import {
  fieldControlId,
  type FieldDefinition,
  type FieldRendererRegistry,
} from "../field-types.js";
import { builtInRenderers, groupedFieldTypes } from "../FieldControls/index.js";

export type { FieldDefinition, FieldRendererProps, FieldRendererRegistry } from "../field-types.js";

interface FieldRendererContextValue {
  readonly readOnly: boolean;
  readonly renderers: FieldRendererRegistry;
}

const FieldRendererContext = createContext<FieldRendererContextValue>({
  readOnly: false,
  renderers: {},
});

/** Supplies renderer overrides and the editor's view-only state to every field below. */
export function FieldRendererProvider({
  children,
  readOnly = false,
  renderers,
}: {
  readonly children: ReactNode;
  readonly readOnly?: boolean;
  readonly renderers: FieldRendererRegistry;
}) {
  const value = useMemo(() => ({ readOnly, renderers }), [readOnly, renderers]);
  return <FieldRendererContext.Provider value={value}>{children}</FieldRendererContext.Provider>;
}

/**
 * Renders one model or block field with its label, description, control, and
 * error. A `placeholder` is also part of the control's accessible description,
 * and a `notice` (guidance for writers) is shown below it unless view only.
 */
export function FieldRenderer({
  control,
  definition,
  error,
  fieldKey,
  name,
  notice,
  placeholder,
}: {
  readonly control: Control<DraftEditorValues, unknown, DraftEditorValues>;
  readonly definition: FieldDefinition;
  readonly error: string | undefined;
  readonly fieldKey: string;
  readonly name: `blocks.${number}.data.${string}` | `fields.${string}`;
  readonly notice?: ReactNode;
  readonly placeholder?: string | undefined;
}) {
  const { readOnly, renderers } = useContext(FieldRendererContext);
  const Renderer = renderers[definition.type] ?? builtInRenderers[definition.type];
  const id = fieldControlId(name);
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const placeholderId = `${id}-placeholder`;
  const noticeId = `${id}-notice`;
  const shownNotice = readOnly || notice === undefined || notice === null ? undefined : notice;
  const describedBy =
    [
      definition.description === undefined ? undefined : descriptionId,
      placeholder === undefined ? undefined : placeholderId,
      shownNotice === undefined ? undefined : noticeId,
      error === undefined ? undefined : errorId,
    ]
      .filter((value): value is string => value !== undefined)
      .join(" ") || undefined;
  const label = fieldLabel(fieldKey, definition.label);
  return (
    <Controller
      control={control}
      name={name as never}
      render={({ field }) => (
        <div className="grid gap-1.5">
          {groupedFieldTypes.has(definition.type) ? (
            <span className="text-sm font-medium">{label}</span>
          ) : (
            <label className="text-sm font-medium" htmlFor={id}>
              {label}
            </label>
          )}
          {definition.description === undefined ? undefined : (
            <small className="text-xs text-muted-foreground" id={descriptionId}>
              {definition.description}
            </small>
          )}
          <Renderer
            definition={definition}
            describedBy={describedBy}
            fieldKey={fieldKey}
            id={id}
            invalid={error !== undefined}
            label={label}
            onBlur={field.onBlur}
            // React Hook Form shows the loaded default again for `undefined`, so a
            // cleared value is held as `null` and removed before saving.
            onChange={(next) => field.onChange(next === undefined ? null : next)}
            placeholder={placeholder}
            readOnly={readOnly}
            value={field.value === null ? undefined : field.value}
          />
          {placeholder === undefined ? undefined : (
            <span className="sr-only" id={placeholderId}>
              {placeholder}
            </span>
          )}
          {shownNotice === undefined ? undefined : <div id={noticeId}>{shownNotice}</div>}
          {error === undefined ? undefined : (
            <p className={`${fieldErrorClass} text-xs`} id={errorId} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    />
  );
}
