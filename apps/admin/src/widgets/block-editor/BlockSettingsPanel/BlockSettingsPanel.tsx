import { LinkIcon } from "lucide-react";
import { Controller, useWatch, type Control } from "react-hook-form";
import {
  anchorProblem,
  classNameProblem,
  fieldControlId,
  FieldRenderer,
  FieldLayout,
  type DraftEditorValues,
} from "../../../entities/content/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { Switch } from "../../../shared/ui/Switch/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";
import type { BlockDefinitionDto } from "../block-presentation.js";

type EditorControl = Control<DraftEditorValues, unknown, DraftEditorValues>;
/** The envelope values the panel edits; a narrow form type keeps Controller types shallow. */
interface EnvelopeForm {
  blocks: { anchor: string; className: string; hidden: boolean }[];
}

/** The validation errors of one block, as React Hook Form stores them. */
export type BlockErrors = Readonly<Record<string, unknown>> | undefined;

function messageAt(error: BlockErrors, key: string): string | undefined {
  return (error?.[key] as { readonly message?: string } | undefined)?.message;
}

function describedBy(...ids: readonly (string | false | undefined)[]): string | undefined {
  return ids.filter((id): id is string => typeof id === "string").join(" ") || undefined;
}

function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}) {
  return message === undefined ? undefined : (
    <p className={`${fieldErrorClass} text-xs`} id={id} role="alert">
      {message}
    </p>
  );
}

/** The anchors of the entry's other blocks, re-read only when an anchor changes. */
function useOtherAnchors(control: Control<EnvelopeForm>, index: number): string[] {
  const anchors = useWatch({
    compute: (values: EnvelopeForm) =>
      JSON.stringify(values.blocks.map((block) => block.anchor ?? "")),
    control,
  });
  return (JSON.parse(anchors) as string[]).filter((_, other) => other !== index);
}

/** The link that reaches an anchor: under the entry's site URL when known. */
export function anchorLink(linkBase: string | undefined, anchor: string): string {
  return `${linkBase ?? ""}#${anchor}`;
}

/**
 * The Settings tab of a block card: the anchor with live validation and a
 * copy-link action, the hidden switch, the settings the block declares, and
 * the CSS classes. Anchor and class problems are shown as the writer types.
 */
export function BlockSettingsPanel({
  control,
  definition,
  error,
  index,
  linkBase,
  settingsError,
}: {
  readonly control: EditorControl;
  readonly definition: BlockDefinitionDto;
  readonly error: BlockErrors;
  readonly index: number;
  /** The entry's absolute site URL, when the site URL and the entry path are known. */
  readonly linkBase: string | undefined;
  /** The message shown on a declared setting's control, from the block's errors. */
  readonly settingsError: (key: string) => string | undefined;
}) {
  const envelope = control as unknown as Control<EnvelopeForm>;
  const otherAnchors = useOtherAnchors(envelope, index);
  const anchorId = fieldControlId(`blocks.${index}.anchor`);
  const classNameId = fieldControlId(`blocks.${index}.className`);
  const hiddenId = `field-blocks-${index}-hidden`;
  const settings = Object.entries(definition.settings ?? {});
  return (
    <div className="grid gap-4">
      <Controller
        control={envelope}
        name={`blocks.${index}.anchor`}
        render={({ field }) => {
          const value = field.value ?? "";
          const live = anchorProblem(value, otherAnchors);
          const message = live ?? messageAt(error, "anchor");
          const linkable = value !== "" && message === undefined;
          return (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor={anchorId}>
                Anchor
              </label>
              <small className="text-xs text-muted-foreground" id={`${anchorId}-description`}>
                Links to this block use #anchor. Unique within this entry.
              </small>
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-sm text-muted-foreground">
                  {"#"}
                </span>
                <Input
                  aria-describedby={describedBy(
                    `${anchorId}-description`,
                    message !== undefined && `${anchorId}-error`,
                  )}
                  aria-invalid={message === undefined ? undefined : true}
                  autoCapitalize="none"
                  autoComplete="off"
                  className="flex-1"
                  id={anchorId}
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(event.currentTarget.value)}
                  ref={field.ref}
                  spellCheck={false}
                  type="text"
                  value={value}
                />
                <Button
                  disabled={!linkable}
                  onClick={() => {
                    const link = anchorLink(linkBase, value);
                    void navigator.clipboard.writeText(link).then(
                      () => toast.success("Link copied."),
                      () => toast.error("Could not copy the link."),
                    );
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <LinkIcon aria-hidden />
                  Copy link
                </Button>
              </div>
              <FieldError id={`${anchorId}-error`} message={message} />
            </div>
          );
        }}
      />
      <Controller
        control={envelope}
        name={`blocks.${index}.hidden`}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor={hiddenId}>
                Hide on site
              </label>
              <Switch
                aria-describedby={`${hiddenId}-description`}
                checked={field.value === true}
                id={hiddenId}
                onBlur={field.onBlur}
                onCheckedChange={field.onChange}
                ref={field.ref}
              />
            </div>
            <small className="text-xs text-muted-foreground" id={`${hiddenId}-description`}>
              Hidden blocks stay in the draft and the publication but are not shown on the site.
            </small>
          </div>
        )}
      />
      {settings.length === 0 ? undefined : (
        <section aria-labelledby={`${hiddenId}-settings`} className="grid gap-3">
          <h4 className="m-0 text-sm font-semibold" id={`${hiddenId}-settings`}>
            Block settings
          </h4>
          <FieldLayout
            fields={definition.settings ?? {}}
            layout={definition.settingsLayout}
            label="Block settings"
            errors={error?.settings}
            renderField={(key) => {
              const setting = definition.settings![key]!;
              return (
                <FieldRenderer
                  control={control}
                  definition={setting}
                  error={settingsError(key)}
                  fieldKey={key}
                  key={key}
                  name={`blocks.${index}.settings.${key}`}
                />
              );
            }}
          />
        </section>
      )}
      <Controller
        control={envelope}
        name={`blocks.${index}.className`}
        render={({ field }) => {
          const value = field.value ?? "";
          const message = classNameProblem(value) ?? messageAt(error, "className");
          return (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor={classNameId}>
                CSS classes
              </label>
              <small className="text-xs text-muted-foreground" id={`${classNameId}-description`}>
                Added to the block's root element on the site, separated by spaces.
              </small>
              <Input
                aria-describedby={describedBy(
                  `${classNameId}-description`,
                  message !== undefined && `${classNameId}-error`,
                )}
                aria-invalid={message === undefined ? undefined : true}
                autoCapitalize="none"
                autoComplete="off"
                id={classNameId}
                name={field.name}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(event.currentTarget.value)}
                ref={field.ref}
                spellCheck={false}
                type="text"
                value={value}
              />
              <FieldError id={`${classNameId}-error`} message={message} />
            </div>
          );
        }}
      />
    </div>
  );
}

/**
 * The block's envelope for viewers: anchor, visibility, declared settings and
 * CSS classes, read only and without tabs.
 */
export function BlockSettingsSummary({
  anchor,
  className,
  control,
  definition,
  hidden,
  index,
}: {
  readonly anchor: string | undefined;
  readonly className: string | undefined;
  readonly control: EditorControl;
  readonly definition: BlockDefinitionDto;
  readonly hidden: boolean;
  readonly index: number;
}) {
  const titleId = `field-blocks-${index}-settings-title`;
  const settings = Object.entries(definition.settings ?? {});
  return (
    <section aria-labelledby={titleId} className="grid gap-3 border-t border-border pt-3">
      <h4 className="m-0 text-sm font-semibold" id={titleId}>
        Settings
      </h4>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Anchor</dt>
        <dd className="m-0 break-all">
          {anchor === undefined || anchor === "" ? "None" : `#${anchor}`}
        </dd>
        <dt className="font-medium">Visibility</dt>
        <dd className="m-0">{hidden ? "Hidden on site" : "Shown on site"}</dd>
        <dt className="font-medium">CSS classes</dt>
        <dd className="m-0 break-all">
          {className === undefined || className.trim() === "" ? "None" : className}
        </dd>
      </dl>
      <FieldLayout
        fields={definition.settings ?? {}}
        layout={definition.settingsLayout}
        label="Block settings"
        renderField={(key) => {
          const setting = definition.settings![key]!;
          return (
            <FieldRenderer
              control={control}
              definition={setting}
              error={undefined}
              fieldKey={key}
              key={key}
              name={`blocks.${index}.settings.${key}`}
            />
          );
        }}
      />
    </section>
  );
}
