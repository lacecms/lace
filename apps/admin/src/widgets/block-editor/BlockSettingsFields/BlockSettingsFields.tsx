import { useFormState, useWatch, type Control } from "react-hook-form";
import {
  FieldLayout,
  FieldRenderer,
  layoutHasProblems,
  type DraftEditorValues,
} from "../../../entities/content/index.js";
import type { BlockDefinitionDto } from "../block-presentation.js";

/** Metadata-driven settings composition shared by writers and viewers. */
export function BlockSettingsFields({
  control,
  definition,
  errors,
  errorFor,
  index,
}: {
  readonly control: Control<DraftEditorValues, unknown, DraftEditorValues>;
  readonly definition: BlockDefinitionDto;
  readonly errors?: unknown;
  readonly errorFor?: ((key: string) => string | undefined) | undefined;
  readonly index: number;
}) {
  const values = useWatch({ control, name: `blocks.${index}.settings` });
  const hiddenBlock = useWatch({ control, name: `blocks.${index}.hidden` }) === true;
  const { errors: formErrors } = useFormState({ control, name: `blocks.${index}.settings` });
  const settingErrors = (errors ?? formErrors.blocks?.[index]?.settings ?? {}) as Record<
    string,
    unknown
  >;
  const settings = definition.settings ?? {};
  const matches = (key: string) => {
    const rule = definition.settingsVisibility?.[key];
    if (!rule) return true;
    const value =
      values?.[rule.setting] === undefined
        ? settings[rule.setting]?.defaultValue
        : values[rule.setting];
    return typeof value === "string" && rule.values.includes(value);
  };
  const hasError = (key: string) => layoutHasProblems(settingErrors[key], hiddenBlock);
  const visibleKeys = new Set(Object.keys(settings).filter((key) => matches(key) || hasError(key)));
  return (
    <FieldLayout
      fields={settings}
      layout={definition.settingsLayout}
      errors={settingErrors}
      hiddenBlock={hiddenBlock}
      label="Block settings"
      visibleKeys={definition.settingsVisibility === undefined ? undefined : visibleKeys}
      renderField={(key) => {
        const issue = settingErrors[key] as { readonly message?: unknown } | undefined;
        return (
          <FieldRenderer
            annotation={
              !matches(key) && hasError(key)
                ? "Shown to resolve a validation problem in this stored setting."
                : undefined
            }
            control={control}
            definition={settings[key]!}
            error={
              errorFor?.(key) ??
              (hasError(key) && typeof issue?.message === "string" ? issue.message : undefined)
            }
            fieldKey={key}
            key={key}
            name={`blocks.${index}.settings.${key}`}
          />
        );
      }}
    />
  );
}
