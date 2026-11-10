import { type ReactNode, useEffect, useId, useState } from "react";
import { Controller, type Control } from "react-hook-form";
import { textLength } from "@lacecms/content";
import { Button } from "../../../shared/ui/Button/index.js";
import { cn } from "../../../shared/lib/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import type { DraftEditorValues, DraftFieldPath } from "../../../shared/editor-contract/index.js";
import { FieldLayout } from "../FieldLayout/index.js";
import type { FieldDefinition } from "../field-types.js";
import { builtInRenderers } from "../FieldControls/index.js";
import { useTransientIssue } from "../transient-issues.js";
import { useCompositeEditing, useEditorContext } from "../EditorContext/index.js";
import { errorMessage, hasProblems, type Errors, type NodeProps } from "../FieldNode/index.js";
import { Disclosure } from "../FieldDisclosure/index.js";
import { ListField } from "../ListField/index.js";
export {
  EntryListBudget,
  FieldRendererProvider,
  useCompositeEditing,
} from "../EditorContext/index.js";

function ValueNode(props: NodeProps) {
  const {
    definition,
    name,
    fieldKey,
    value,
    onChange,
    onBlur,
    errors,
    onErrors,
    item = false,
    annotation,
    notice,
    placeholder,
  } = props;
  const { readOnly, busy, renderers, growthProblem, epoch, form } = useCompositeEditing();
  const services = useEditorContext().services;
  const id = services.fieldControlId(name as `fields.${string}`);
  const label = item ? fieldKey : services.fieldLabel(fieldKey, definition.label);
  const [clearedItem, setClearedItem] = useState(false);
  useEffect(() => {
    setClearedItem(false);
  }, [epoch]);
  const identity = useId();
  useTransientIssue(form, identity, name, clearedItem);
  const error = clearedItem ? "Enter a value or remove this item." : errorMessage(errors);
  const blockIndex = /^blocks\.(\d+)\./u.exec(name)?.[1];
  const hidden =
    blockIndex !== undefined && form?.getValues(`blocks.${Number(blockIndex)}.hidden`) === true;
  const message =
    error && errors?.type === "publication"
      ? hidden && !error.includes("This block is hidden")
        ? `${error} This block is hidden, so this does not block publishing.`
        : hidden
          ? error
          : `${error} Required for publication only.`
      : error;
  if (definition.type === "list")
    return annotation ? (
      <div className="grid min-w-0 gap-1">
        <small className="text-xs text-muted-foreground">{annotation}</small>
        <ListField {...props} definition={definition} renderValue={ValueNode} />
      </div>
    ) : (
      <ListField {...props} definition={definition} renderValue={ValueNode} />
    );
  if (definition.type === "group") {
    const present = services.record(value);
    // Problems this value's rules make reachable; hidden targets with draft problems stay shown.
    const shownErrors = (
      present
        ? services.applicableErrors(definition.fields, definition.visibility, value, errors)
        : errors
    ) as Errors | undefined;
    const shownKeys = present
      ? services.shownFieldKeys(definition.fields, definition.visibility, value)
      : undefined;
    const renderedKeys = present
      ? services.renderedFieldKeys(definition.fields, definition.visibility, value, shownErrors)
      : undefined;
    const candidate = services.fieldStartingValue(definition, {});
    const createProblem = growthProblem(name, candidate);
    const clearProblem = growthProblem(name, null);
    const content = (
      <>
        {!present ? (
          <>
            <p className="text-sm text-muted-foreground">
              Not set{definition.required ? " · Required for publication" : ""}
            </p>
            {!readOnly ? (
              <Button
                disabled={busy || !!createProblem}
                onClick={() => onChange(candidate)}
                size="sm"
                variant="outline"
              >
                Create {label}
              </Button>
            ) : null}
            {createProblem ? <small>{createProblem}</small> : null}
          </>
        ) : (
          <FieldLayout
            fields={definition.fields}
            layout={definition.layout}
            label={label}
            errors={shownErrors}
            hiddenBlock={hidden}
            visibleKeys={renderedKeys}
            renderField={(key) => {
              const child = definition.fields[key]!;
              return (
                <ValueNode
                  annotation={
                    shownKeys?.has(key) === false && renderedKeys?.has(key) === true
                      ? services.hiddenFieldNote(definition.fields, definition.visibility, key)
                      : undefined
                  }
                  definition={child}
                  errors={
                    shownErrors?.[key] !== null && typeof shownErrors?.[key] === "object"
                      ? (shownErrors[key] as Errors)
                      : undefined
                  }
                  fieldKey={key}
                  key={key}
                  name={`${name}.${key}`}
                  onBlur={onBlur}
                  onChange={(next) => {
                    const copy = { ...value };
                    copy[key] = next === undefined ? null : next;
                    onChange(copy);
                  }}
                  onErrors={onErrors ? (next) => onErrors({ ...errors, [key]: next }) : undefined}
                  value={value[key] === null ? undefined : value[key]}
                />
              );
            }}
          />
        )}
      </>
    );
    // A list item's group is framed and collapsed by its row, so it renders flat.
    if (item)
      return (
        <div
          aria-describedby={errorMessage(errors) ? `${id}:error` : undefined}
          aria-label={label}
          className="grid min-w-0 gap-3 outline-hidden"
          id={id}
          role="group"
          tabIndex={-1}
        >
          {errorMessage(errors) ? (
            <p className={`${fieldErrorClass} text-xs`} id={`${id}:error`} role="alert">
              {errorMessage(errors)}
            </p>
          ) : null}
          {content}
        </div>
      );
    return (
      <Disclosure
        description={definition.description}
        guidance={services.fieldGuidance(definition)}
        required={definition.required}
        error={shownErrors}
        id={id}
        label={label}
        suffix={
          !readOnly && !item && present ? (
            <Button
              disabled={busy || !!clearProblem}
              onClick={() => onChange(undefined)}
              size="sm"
              variant="ghost"
            >
              Clear {label}
            </Button>
          ) : undefined
        }
      >
        {content}
        {Object.hasOwn(definition, "defaultValue") ? (
          <small className="text-muted-foreground">
            Clearing uses the configured default on save.
          </small>
        ) : null}
        {clearProblem ? <small>{clearProblem}</small> : null}
      </Disclosure>
    );
  }
  const { quiet: guidance, visible: bounds } = services.fieldGuidanceParts(definition);
  // The publication-only note is the Required marker's tooltip unless it explains a problem.
  const quietClass = readOnly || message ? undefined : "sr-only";
  const effectivePlaceholder =
    placeholder ?? ("placeholder" in definition ? definition.placeholder : undefined);
  const counted = services.fieldTypeSupport[definition.type].characterCount;
  const marker = definition.required ? (
    <span
      aria-hidden="true"
      className="ml-1 text-xs text-muted-foreground"
      title="Required for publication only."
    >
      Required
    </span>
  ) : null;
  const Renderer =
    renderers[definition.type] ??
    builtInRenderers[definition.type as keyof typeof builtInRenderers];
  if (!Renderer) throw new Error(`No renderer registered for ${definition.type}`);
  const describedBy =
    [
      definition.description ? `${id}-description` : undefined,
      guidance ? `${id}-guidance` : undefined,
      bounds ? `${id}-bounds` : undefined,
      counted ? `${id}-count` : undefined,
      annotation ? `${id}-annotation` : undefined,
      placeholder ? `${id}-placeholder` : undefined,
      !readOnly && notice ? `${id}-notice` : undefined,
      message ? `${id}-error` : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <fieldset className="grid min-w-0 gap-1.5 border-0 p-0" disabled={readOnly || busy}>
      {services.fieldTypeSupport[definition.type].groupedControl ? (
        <span className="text-sm font-medium">
          {label}
          {marker}
        </span>
      ) : (
        <div className="flex min-w-0 items-baseline gap-1">
          <label className="text-sm font-medium" htmlFor={id}>
            {label}
          </label>
          {marker}
          {counted ? (
            // In the label row, so the count takes no line of its own.
            <span
              className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
              id={`${id}-count`}
            >
              {textLength(typeof value === "string" && !clearedItem ? value : "")} characters
            </span>
          ) : null}
        </div>
      )}
      {definition.description ? (
        <small className="text-xs text-muted-foreground" id={`${id}-description`}>
          {definition.description}
        </small>
      ) : null}
      {guidance ? (
        <small className={cn("text-xs text-muted-foreground", quietClass)} id={`${id}-guidance`}>
          {guidance}
        </small>
      ) : null}
      {bounds ? (
        <small className="text-xs text-muted-foreground" id={`${id}-bounds`}>
          {bounds}
        </small>
      ) : null}
      {annotation ? (
        <small className="text-xs text-muted-foreground" id={`${id}-annotation`}>
          {annotation}
        </small>
      ) : null}
      <Renderer
        definition={definition}
        describedBy={describedBy}
        fieldKey={fieldKey}
        id={id}
        invalid={!!message}
        label={label}
        onBlur={onBlur}
        onChange={(next) => {
          if (readOnly || busy) return;
          if (item && (next === undefined || next === null)) {
            // Empty string is a real scalar item when valid; absent slots never enter arrays.
            if (
              services.fieldTypeSupport[definition.type].characterCount &&
              !services.fieldProblem(definition, "")
            ) {
              setClearedItem(false);
              onChange("");
              return;
            }
            setClearedItem(true);
            return;
          }
          setClearedItem(false);
          if (!clearedItem) onErrors?.(undefined);
          onChange(next);
        }}
        placeholder={effectivePlaceholder}
        readOnly={readOnly || busy}
        value={clearedItem ? undefined : value}
      />
      {placeholder ? (
        <span className="sr-only" id={`${id}-placeholder`}>
          {placeholder}
        </span>
      ) : null}
      {!readOnly && notice ? <div id={`${id}-notice`}>{notice}</div> : null}
      {message ? (
        <p className={`${fieldErrorClass} text-xs`} id={`${id}-error`} role="alert">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
/** A list item row: handle, summary or inline control, toggle, and actions menu. */
/** One root controller owns a composite; nested controls compose ordinary JSON values. */
export function FieldRenderer({
  control,
  name,
  error,
  ...props
}: {
  readonly control: Control<DraftEditorValues, unknown, DraftEditorValues>;
  readonly name: DraftFieldPath;
  readonly error: string | undefined;
  readonly definition: FieldDefinition;
  readonly fieldKey: string;
  readonly annotation?: string | undefined;
  readonly notice?: ReactNode;
  readonly placeholder?: string | undefined;
}) {
  const {
    form,
    services: { recursiveFieldErrors },
  } = useEditorContext();
  const applyErrors = (next: unknown) => {
    if (!form) return;
    form.clearErrors(name);
    const visit = (value: unknown, path: typeof name) => {
      if (value === null || typeof value !== "object") return;
      const entries = value as Record<string, unknown>;
      if (typeof entries.message === "string")
        form.setError(path, {
          message: entries.message,
          type: typeof entries.type === "string" ? entries.type : "server",
        });
      Object.entries(value).forEach(([key, child]) => {
        if (key !== "ref" && child !== null && typeof child === "object")
          visit(child, `${path}.${key}`);
      });
    };
    visit(next, name);
  };
  const retainedErrors = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== "object") return {};
    const entries = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(entries).flatMap(([key, child]) => {
        if (key === "ref" || ((key === "message" || key === "type") && entries.type === "validate"))
          return [];
        return [[key, child !== null && typeof child === "object" ? retainedErrors(child) : child]];
      }),
    );
  };
  const mergeErrors = (
    local: Record<string, unknown>,
    retained: Record<string, unknown>,
  ): Record<string, unknown> => {
    const result = { ...local };
    for (const [key, value] of Object.entries(retained)) {
      if (value !== null && typeof value === "object")
        result[key] = mergeErrors(
          typeof result[key] === "object" && result[key] !== null
            ? (result[key] as Record<string, unknown>)
            : {},
          value as Record<string, unknown>,
        );
      else result[key] = value;
    }
    return result;
  };
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <ValueNode
          {...props}
          errors={
            error
              ? ({ ...fieldState.error, message: error } as Errors)
              : (fieldState.error as unknown as Errors)
          }
          name={name}
          onBlur={field.onBlur}
          onChange={(next) => {
            field.onChange(next === undefined ? null : next);
            if (form && hasProblems(fieldState.error)) {
              const retained = retainedErrors(form.getFieldState(name).error);
              applyErrors(mergeErrors(recursiveFieldErrors(props.definition, next), retained));
            }
          }}
          onErrors={form ? applyErrors : undefined}
          value={field.value === null ? undefined : field.value}
        />
      )}
    />
  );
}
