import type { ContentModelDto } from "@lacecms/contracts";
import { TriangleAlert } from "lucide-react";
import { Controller, useWatch, type Control } from "react-hook-form";
import {
  SEO_DESCRIPTION_RECOMMENDED,
  SEO_TITLE_RECOMMENDED,
  seoInheritance,
  seoTextLength,
  type DraftEditorValues,
  type SeoFormValues,
  type SeoKey,
  type SeoSiteDefaults,
} from "../../../entities/content/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { Switch } from "../../../shared/ui/Switch/index.js";
import { Textarea } from "../../../shared/ui/Textarea/index.js";
import { MediaPicker } from "../../../widgets/media-library/index.js";

type SeoErrors = Partial<Record<SeoKey, { readonly message?: string } | undefined>>;
type EditorControl = Control<DraftEditorValues, unknown, DraftEditorValues>;

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

/**
 * A single-line SEO text with its character count against the recommended
 * length, a soft warning above it, the inherited value as placeholder, and
 * its error. Nothing here is a live region, so typing is not announced.
 */
function SeoTextControl({
  error,
  field,
  id,
  kind,
  label,
  placeholder,
}: {
  readonly error: string | undefined;
  readonly field: {
    readonly name: string;
    readonly onBlur: () => void;
    readonly onChange: (value: string) => void;
    readonly ref: (element: HTMLElement | null) => void;
    readonly value: string | undefined;
  };
  readonly id: string;
  readonly kind: "description" | "title";
  readonly label: string;
  readonly placeholder: string | undefined;
}) {
  const recommended = kind === "title" ? SEO_TITLE_RECOMMENDED : SEO_DESCRIPTION_RECOMMENDED;
  const value = field.value ?? "";
  const count = seoTextLength(value);
  const long = count > recommended;
  const inherited = value.trim() === "" ? placeholder : undefined;
  const ids = {
    count: `${id}-count`,
    error: `${id}-error`,
    placeholder: `${id}-placeholder`,
    warning: `${id}-warning`,
  };
  const controlProps = {
    "aria-describedby": describedBy(
      inherited !== undefined && ids.placeholder,
      ids.count,
      long && ids.warning,
      error !== undefined && ids.error,
    ),
    "aria-invalid": error === undefined ? undefined : true,
    id,
    name: field.name,
    onBlur: field.onBlur,
    onChange: (event: { readonly currentTarget: { readonly value: string } }) =>
      field.onChange(event.currentTarget.value),
    placeholder: inherited,
    ref: field.ref,
    value,
  };
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {kind === "title" ? <Input {...controlProps} /> : <Textarea rows={3} {...controlProps} />}
      {inherited === undefined ? undefined : (
        <span className="sr-only" id={ids.placeholder}>
          {inherited}
        </span>
      )}
      <p className="m-0 text-xs text-muted-foreground" id={ids.count}>
        {`${count} / ${recommended} characters`}
      </p>
      {long ? (
        <p
          className="m-0 flex items-start gap-1.5 rounded-md bg-warning px-2.5 py-1.5 text-xs text-warning-foreground"
          id={ids.warning}
        >
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            {`Search results may shorten ${kind === "title" ? "titles" : "descriptions"} longer than ${recommended} characters.`}
          </span>
        </p>
      ) : undefined}
      <FieldError id={ids.error} message={error} />
    </div>
  );
}

/**
 * The SEO card of an SEO-enabled entry: the stored SEO values, what each empty
 * value inherits, and a preview of the resulting search result.
 */
export function EntrySeoCard({
  control,
  defaults,
  errors,
  model,
  readOnly,
  siteUrl,
}: {
  readonly control: EditorControl;
  readonly defaults: SeoSiteDefaults | undefined;
  readonly errors: SeoErrors | undefined;
  readonly model: ContentModelDto;
  readonly readOnly: boolean;
  readonly siteUrl: string | undefined;
}) {
  const title = useWatch<DraftEditorValues, "title">({ control, name: "title" });
  const slug = useWatch<DraftEditorValues, "slug">({ control, name: "slug" });
  const fields = useWatch<DraftEditorValues, "fields">({ control, name: "fields" });
  const seo = useWatch<DraftEditorValues, "seo">({ control, name: "seo" });
  const inheritance = seoInheritance({
    defaults,
    model,
    siteUrl,
    values: { fields: fields ?? {}, seo, slug, title: title ?? "" },
  });
  const { preview } = inheritance;
  // The same form, typed by its SEO group only: path types over the full draft
  // (blocks with JSON data) are too deep for React Hook Form's Controller.
  const seoControl = control as unknown as Control<{ seo: SeoFormValues }>;
  const canonicalError = errors?.canonical?.message;
  const imageError = errors?.image?.message;
  const noindexError = errors?.noindex?.message;
  return (
    <section
      aria-labelledby="entry-seo-title"
      className="grid gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs"
    >
      <h2 className="m-0 text-sm font-semibold" id="entry-seo-title">
        SEO
      </h2>
      <Controller
        control={seoControl}
        name="seo.title"
        render={({ field }) => (
          <SeoTextControl
            error={errors?.title?.message}
            field={field}
            id="seo-title"
            kind="title"
            label="SEO title"
            placeholder={inheritance.titlePlaceholder}
          />
        )}
      />
      <Controller
        control={seoControl}
        name="seo.description"
        render={({ field }) => (
          <SeoTextControl
            error={errors?.description?.message}
            field={field}
            id="seo-description"
            kind="description"
            label="SEO description"
            placeholder={inheritance.descriptionPlaceholder}
          />
        )}
      />
      <Controller
        control={seoControl}
        name="seo.image"
        render={({ field }) => (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium" id="seo-image-label">
              SEO image
            </span>
            <MediaPicker
              fieldKey="seoImage"
              id="seo-image"
              label="SEO image"
              onChange={(next) => field.onChange(typeof next === "string" ? next : null)}
              readOnly={readOnly}
              value={field.value ?? undefined}
            />
            {field.value === null || field.value === undefined ? (
              <p className="m-0 text-xs text-muted-foreground" id="seo-image-inheritance">
                {inheritance.imageInheritance}
              </p>
            ) : undefined}
            <FieldError id="seo-image-error" message={imageError} />
          </div>
        )}
      />
      <Controller
        control={seoControl}
        name="seo.canonical"
        render={({ field }) => {
          const value = field.value ?? "";
          const inherited = value.trim() === "" ? inheritance.canonicalPlaceholder : undefined;
          return (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="seo-canonical">
                Canonical URL
              </label>
              <Input
                aria-describedby={describedBy(
                  inherited !== undefined && "seo-canonical-placeholder",
                  canonicalError !== undefined && "seo-canonical-error",
                )}
                aria-invalid={canonicalError === undefined ? undefined : true}
                id="seo-canonical"
                inputMode="url"
                name={field.name}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(event.currentTarget.value)}
                placeholder={inherited}
                ref={field.ref}
                type="text"
                value={value}
              />
              {inherited === undefined ? undefined : (
                <span className="sr-only" id="seo-canonical-placeholder">
                  {inherited}
                </span>
              )}
              <FieldError id="seo-canonical-error" message={canonicalError} />
            </div>
          );
        }}
      />
      <Controller
        control={seoControl}
        name="seo.noindex"
        render={({ field }) => (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor="seo-noindex">
                Hide from search engines
              </label>
              <Switch
                aria-describedby={describedBy(
                  "seo-noindex-description",
                  noindexError !== undefined && "seo-noindex-error",
                )}
                aria-invalid={noindexError === undefined ? undefined : true}
                checked={field.value === true}
                id="seo-noindex"
                onBlur={field.onBlur}
                onCheckedChange={field.onChange}
                ref={field.ref}
              />
            </div>
            <small className="text-xs text-muted-foreground" id="seo-noindex-description">
              Adds noindex and leaves the page out of the sitemap.
            </small>
            <FieldError id="seo-noindex-error" message={noindexError} />
          </div>
        )}
      />
      <section
        aria-labelledby="seo-preview-title"
        className="grid gap-1 rounded-md border border-border bg-background p-3"
      >
        <h3 className="m-0 text-xs font-medium text-muted-foreground" id="seo-preview-title">
          Search result preview
        </h3>
        <p className="m-0 text-base font-medium break-words text-primary">{preview.title}</p>
        {preview.url === undefined ? undefined : (
          <p className="m-0 text-xs break-all text-muted-foreground">{preview.url}</p>
        )}
        <p className="m-0 line-clamp-3 text-sm break-words">
          {preview.description ?? (
            <span className="text-muted-foreground">
              No description. Search engines choose a snippet from the page.
            </span>
          )}
        </p>
        {preview.hidden ? (
          <p className="m-0 text-xs font-medium">Hidden from search results.</p>
        ) : undefined}
      </section>
    </section>
  );
}
