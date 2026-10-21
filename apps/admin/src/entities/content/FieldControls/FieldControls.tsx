import { CalendarIcon, ExternalLink, Link2, X } from "lucide-react";
import { type ComponentType, useId, useState } from "react";
import { cn, formatDate } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ChoiceCards } from "../../../shared/ui/ChoiceCards/index.js";
import { Calendar } from "../../../shared/ui/Calendar/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../../shared/ui/Popover/index.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/Select/index.js";
import { Switch } from "../../../shared/ui/Switch/index.js";
import { Textarea } from "../../../shared/ui/Textarea/index.js";
import type { FieldDefinition, FieldRendererProps } from "../field-types.js";
import { RichTextEditor } from "../RichTextEditor/index.js";

// Radix Select items cannot use an empty value, so "No selection" uses a
// sentinel that no identifier-shaped option can equal.
const noSelection = "\u0000none";

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const datetimePattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/u;

/** Reads a `YYYY-MM-DD` value as a local calendar day for the date picker. */
export function calendarDateToDate(value: string): Date | undefined {
  const match = calendarDatePattern.exec(value);
  if (match === null) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Writes a picked local calendar day as `YYYY-MM-DD`. */
export function dateToCalendarDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Splits a UTC ISO datetime into its date and `HH:MM` parts without time-zone shifts. */
export function splitUtcDatetime(value: unknown): { date?: string; time?: string } {
  if (typeof value !== "string") return {};
  const match = datetimePattern.exec(value);
  return match === null ? {} : { date: match[1]!, time: `${match[2]}:${match[3]}` };
}

/** Composes a UTC ISO datetime from a calendar date and an optional `HH:MM` time. */
export function composeUtcDatetime(date: string, time: string | undefined): string {
  return `${date}T${time === undefined || time === "" ? "00:00" : time}:00.000Z`;
}

/** An http(s) URL that may be opened from the editor, or undefined. */
export function openableUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function joinIds(...ids: readonly (string | undefined)[]): string | undefined {
  return ids.filter((id): id is string => id !== undefined).join(" ") || undefined;
}

function BooleanField({ describedBy, id, invalid, onBlur, onChange, value }: FieldRendererProps) {
  return (
    <Switch
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      checked={value === true}
      className="justify-self-start"
      id={id}
      onBlur={onBlur}
      onCheckedChange={onChange}
    />
  );
}

function SelectField({
  definition,
  describedBy,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  placeholder,
  readOnly,
  value,
}: FieldRendererProps) {
  const options = definition.type === "select" ? definition.options : [];
  if (definition.type === "select" && definition.presentation?.control === "cards") {
    const choices = options.map((option) =>
      definition.presentation!.choices.find((choice) => choice.value === option)!,
    );
    if (readOnly) {
      const selected = choices.find((choice) => choice.value === value);
      return (
        <p aria-describedby={describedBy} className="m-0 text-sm font-normal" id={id} tabIndex={-1}>
          {selected?.label ?? "No selection"}
          {selected?.description ? (
            <span className="block text-xs text-muted-foreground">{selected.description}</span>
          ) : null}
        </p>
      );
    }
    return (
      <ChoiceCards
        choices={
          definition.required
            ? choices
            : [{ value: noSelection, label: "No selection" }, ...choices]
        }
        describedBy={describedBy}
        id={id}
        invalid={invalid}
        label={label}
        onBlur={onBlur}
        onChange={(next) => onChange(next === noSelection ? undefined : next)}
        value={typeof value === "string" ? value : noSelection}
      />
    );
  }
  return (
    <Select
      disabled={readOnly}
      onOpenChange={(open) => {
        if (!open) onBlur();
      }}
      onValueChange={(next) => {
        // Inside a form, Radix mirrors the value into a hidden native select
        // that reports "" before its options mount. No item can have an
        // empty value, so "" is never a user choice and must not dirty the form.
        if (next === "") return;
        onChange(next === noSelection ? undefined : next);
      }}
      value={typeof value === "string" ? value : ""}
    >
      <SelectTrigger
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="w-full font-normal"
        id={id}
      >
        <SelectValue placeholder={placeholder ?? "Select an option"} />
      </SelectTrigger>
      <SelectContent>
        {definition.required ? undefined : (
          <SelectItem value={noSelection}>No selection</SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A calendar-in-popover trigger for a `YYYY-MM-DD` value. */
function CalendarPicker({
  describedBy,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  readOnly,
  required,
  value,
}: {
  readonly describedBy: string | undefined;
  readonly id: string;
  readonly invalid: boolean;
  readonly label: string;
  readonly onBlur: () => void;
  readonly onChange: (value: string | undefined) => void;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly value: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const valueId = useId();
  const selected = value === undefined ? undefined : calendarDateToDate(value);
  return (
    <div className="flex items-center gap-1">
      <Popover
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBlur();
        }}
        open={open}
      >
        <PopoverTrigger asChild>
          <Button
            aria-describedby={joinIds(valueId, describedBy)}
            aria-invalid={invalid || undefined}
            className={cn(
              "flex-1 justify-start font-normal",
              value === undefined ? "text-muted-foreground" : undefined,
            )}
            disabled={readOnly}
            id={id}
            variant="outline"
          >
            <CalendarIcon aria-hidden="true" />
            <span id={valueId}>
              {value === undefined ? "Pick a date" : formatDate(value) || value}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            autoFocus
            {...(selected === undefined ? {} : { defaultMonth: selected, selected })}
            mode="single"
            onSelect={(date) => {
              onChange(date === undefined ? undefined : dateToCalendarDate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {required || value === undefined || readOnly ? undefined : (
        <Button
          aria-label={`Clear ${label}`}
          onClick={() => onChange(undefined)}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function DateField({
  definition,
  describedBy,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  readOnly,
  value,
}: FieldRendererProps) {
  return (
    <CalendarPicker
      describedBy={describedBy}
      id={id}
      invalid={invalid}
      label={label}
      onBlur={onBlur}
      onChange={onChange}
      readOnly={readOnly}
      required={definition.required}
      value={typeof value === "string" && value !== "" ? value : undefined}
    />
  );
}

function DatetimeField({
  definition,
  describedBy,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  readOnly,
  value,
}: FieldRendererProps) {
  const { date, time } = splitUtcDatetime(value);
  const utcNoteId = useId();
  return (
    <div className="grid gap-1.5">
      <CalendarPicker
        describedBy={describedBy}
        id={id}
        invalid={invalid}
        label={label}
        onBlur={onBlur}
        onChange={(nextDate) =>
          onChange(nextDate === undefined ? undefined : composeUtcDatetime(nextDate, time))
        }
        readOnly={readOnly}
        required={definition.required}
        value={date}
      />
      <div className="flex items-center gap-2">
        <Input
          aria-describedby={utcNoteId}
          aria-invalid={invalid || undefined}
          aria-label={`${label} time (UTC)`}
          className="w-32"
          disabled={readOnly || date === undefined}
          onBlur={onBlur}
          onChange={(event) => {
            if (date !== undefined) onChange(composeUtcDatetime(date, event.currentTarget.value));
          }}
          step={60}
          type="time"
          value={time ?? ""}
        />
        <small className="text-xs font-normal text-muted-foreground" id={utcNoteId}>
          Time is in UTC.
        </small>
      </div>
    </div>
  );
}

function UrlField({
  describedBy,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  placeholder,
  value,
}: FieldRendererProps) {
  const href = openableUrl(value);
  return (
    <div className="flex items-center gap-1">
      <div className="relative flex-1">
        <Link2
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="pl-8"
          id={id}
          inputMode="url"
          onBlur={onBlur}
          onChange={(event) => onChange(event.currentTarget.value || undefined)}
          placeholder={placeholder ?? "https://"}
          type="url"
          value={typeof value === "string" ? value : ""}
        />
      </div>
      {href === undefined ? undefined : (
        <Button asChild size="icon" variant="ghost">
          <a
            aria-label={`Open ${label} in a new tab`}
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      )}
    </div>
  );
}

function RichTextField({
  describedBy,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  placeholder,
  readOnly,
  value,
}: FieldRendererProps) {
  return (
    <RichTextEditor
      {...(describedBy === undefined ? {} : { describedBy })}
      placeholder={placeholder}
      id={id}
      invalid={invalid}
      label={label}
      onBlur={onBlur}
      onChange={onChange}
      readOnly={readOnly}
      value={value}
    />
  );
}

function TextareaField({
  describedBy,
  id,
  invalid,
  onBlur,
  onChange,
  placeholder,
  value,
}: FieldRendererProps) {
  return (
    <Textarea
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      id={id}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
      placeholder={placeholder}
      rows={5}
      value={typeof value === "string" ? value : ""}
    />
  );
}

function TextField({
  describedBy,
  id,
  invalid,
  onBlur,
  onChange,
  placeholder,
  value,
}: FieldRendererProps) {
  return (
    <Input
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      id={id}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
      placeholder={placeholder}
      type="text"
      value={typeof value === "string" ? value : ""}
    />
  );
}

function NumberField({
  definition,
  describedBy,
  id,
  invalid,
  onBlur,
  onChange,
  placeholder,
  value,
}: FieldRendererProps) {
  return (
    <Input
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      id={id}
      placeholder={placeholder}
      inputMode="decimal"
      max={definition.type === "number" ? definition.max : undefined}
      min={definition.type === "number" ? definition.min : undefined}
      onBlur={onBlur}
      onChange={(event) =>
        onChange(event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value))
      }
      type="number"
      value={typeof value === "number" || typeof value === "string" ? value : ""}
    />
  );
}

function UnavailableMediaField() {
  return (
    <p className="m-0 font-normal text-muted-foreground">Media selection is not available here.</p>
  );
}

/** Scalar controls reused by the recursive field renderer. */
export const builtInRenderers: Record<
  Exclude<FieldDefinition["type"], "group" | "list">,
  ComponentType<FieldRendererProps>
> = {
  boolean: BooleanField,
  date: DateField,
  datetime: DatetimeField,
  media: UnavailableMediaField,
  number: NumberField,
  richText: RichTextField,
  select: SelectField,
  text: TextField,
  textarea: TextareaField,
  url: UrlField,
};

/** Field types whose control is not a single labelable element. */
export const groupedFieldTypes: ReadonlySet<FieldDefinition["type"]> = new Set([
  "media",
  "richText",
]);
