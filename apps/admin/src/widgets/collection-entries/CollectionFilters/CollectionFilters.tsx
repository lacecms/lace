import {
  collectionFieldFilterSchema,
  type CollectionFieldFilterDto,
  type ContentModelDto,
  type ListQueryLimits,
} from "@lacecms/contracts";
import * as v from "valibot";
import { useId, useState } from "react";
import { collectionFilterProblem, listQueryBudgetHint } from "../../../entities/content/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const operations = (type: string): readonly string[] => [
  ...(["text", "textarea", "url"].includes(type)
    ? ["contains", "eq"]
    : type === "select"
      ? ["in"]
      : type === "number"
        ? ["eq", "range"]
        : type === "boolean"
          ? ["eq"]
          : ["range"]),
  "isSet",
  "isNotSet",
];
const labels: Record<string, string> = {
  contains: "Contains",
  eq: "Equals",
  in: "Any of",
  range: "Range (inclusive)",
  isSet: "Is set",
  isNotSet: "Is not set",
};

/** One shared condition editor for column affordances and hidden configured fields. */
export function CollectionFilters({
  model,
  limits,
  fieldKey,
  filters,
  onApply,
  onClose,
  onRestoreFocus,
}: {
  readonly model: ContentModelDto;
  readonly limits: ListQueryLimits;
  readonly fieldKey: string;
  readonly filters: readonly CollectionFieldFilterDto[];
  readonly onApply: (filter: CollectionFieldFilterDto) => void;
  readonly onClose: () => void;
  readonly onRestoreFocus: () => void;
}) {
  const [key, setKey] = useState(fieldKey);
  const existing = filters.find((filter) => filter.field === fieldKey);
  const field = model.fields[key]!;
  const [op, setOp] = useState(existing?.op ?? operations(field.type)[0]!);
  const [value, setValue] = useState(
    existing && "value" in existing
      ? String(existing.value)
      : field.type === "boolean"
        ? "false"
        : "",
  );
  const [values, setValues] = useState<string[]>(existing?.op === "in" ? [...existing.values] : []);
  const boundValue = (name: "min" | "max" | "from" | "to") =>
    existing?.op === "range" && name in existing
      ? String(existing[name as keyof typeof existing] ?? "").replace(/Z$/u, "")
      : "";
  const [lower, setLower] = useState(boundValue(field.type === "number" ? "min" : "from"));
  const [upper, setUpper] = useState(boundValue(field.type === "number" ? "max" : "to"));
  const [touched, setTouched] = useState(false);
  const errorId = useId();
  const candidate: Record<string, unknown> = { field: key, op };
  if (op === "eq" || op === "contains")
    candidate.value =
      field.type === "boolean"
        ? value === "true"
        : field.type === "number"
          ? value === ""
            ? null
            : Number(value)
          : value;
  if (op === "in") candidate.values = values;
  if (op === "range") {
    const bound = (text: string) =>
      field.type === "number"
        ? Number(text)
        : field.type === "datetime"
          ? `${text.length === 16 ? `${text}:00` : text}Z`
          : text;
    if (lower !== "") candidate[field.type === "number" ? "min" : "from"] = bound(lower);
    if (upper !== "") candidate[field.type === "number" ? "max" : "to"] = bound(upper);
  }
  const problem = collectionFilterProblem(model, candidate, limits);
  const controlType =
    field.type === "number"
      ? "number"
      : field.type === "datetime"
        ? "datetime-local"
        : field.type === "date"
          ? "date"
          : "text";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Filters</DialogTitle>
          <DialogDescription>
            Combine conditions across fields. Values within Any of match with OR.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!problem) {
              onApply(v.parse(collectionFieldFilterSchema, candidate));
              onClose();
            }
          }}
        >
          <label className="grid gap-1 text-sm">
            Field
            <select
              aria-label="Field"
              className={selectClass}
              value={key}
              onChange={(event) => {
                const next = event.target.value;
                setKey(next);
                setOp(operations(model.fields[next]!.type)[0]!);
                setValue(model.fields[next]!.type === "boolean" ? "false" : "");
                setValues([]);
                setLower("");
                setUpper("");
                setTouched(false);
              }}
            >
              {model.listOptions?.filterableFields?.map((key) => (
                <option key={key} value={key}>
                  {model.fields[key]?.label ?? key}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Operator
            <select
              aria-label="Operator"
              className={selectClass}
              value={op}
              onChange={(event) => {
                setOp(event.target.value);
                setTouched(false);
              }}
            >
              {operations(field.type).map((op) => (
                <option key={op} value={op}>
                  {labels[op]}
                </option>
              ))}
            </select>
          </label>
          {op === "eq" || op === "contains" ? (
            field.type === "boolean" ? (
              <label className="grid gap-1 text-sm">
                Value
                <select
                  aria-label="Value"
                  className={selectClass}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>
            ) : (
              <label className="grid gap-1 text-sm">
                Value
                <Input
                  aria-describedby={touched && problem ? errorId : undefined}
                  aria-invalid={touched && !!problem}
                  type={controlType}
                  step="any"
                  maxLength={op === "contains" ? limits.maxSearchLength : 200}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setTouched(true);
                  }}
                />
              </label>
            )
          ) : undefined}
          {op === "in" && field.type === "select" ? (
            <fieldset className="grid max-h-60 gap-2 overflow-auto">
              <legend className="text-sm">Values</legend>
              {field.options.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.includes(option)}
                    onChange={(event) => {
                      setValues(
                        event.target.checked
                          ? [...values, option]
                          : values.filter((value) => value !== option),
                      );
                      setTouched(true);
                    }}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          ) : undefined}
          {op === "range" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">
                {field.type === "number" ? "Minimum" : "From (UTC)"}
                <Input
                  type={controlType}
                  step="any"
                  value={lower}
                  onChange={(event) => {
                    setLower(event.target.value);
                    setTouched(true);
                  }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                {field.type === "number" ? "Maximum" : "To (UTC)"}
                <Input
                  type={controlType}
                  step="any"
                  value={upper}
                  onChange={(event) => {
                    setUpper(event.target.value);
                    setTouched(true);
                  }}
                />
              </label>
            </div>
          ) : undefined}
          {op === "contains" ? (
            <p className="m-0 text-xs text-muted-foreground">{listQueryBudgetHint(limits)}</p>
          ) : undefined}
          {touched && problem ? (
            <p id={errorId} role="alert" className="m-0 text-sm text-destructive">
              {problem}
            </p>
          ) : undefined}
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button type="submit">Apply filter</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
