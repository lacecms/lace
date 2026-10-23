import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { FormLayout } from "@lacecms/content";
import { REVEAL_CONTROL_EVENT } from "../../../shared/lib/index.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/Tabs/index.js";

/** Counts only problems that matter under the current hidden-block rules. */
export function layoutHasProblems(value: unknown, hiddenBlock = false): boolean {
  if (value === null || typeof value !== "object") return false;
  const error = value as Record<string, unknown>;
  if (typeof error.message === "string" && !(hiddenBlock && error.type === "publication"))
    return true;
  return Object.entries(error).some(
    ([key, child]) => key !== "ref" && layoutHasProblems(child, hiddenBlock),
  );
}

function Panel({
  children,
  selected,
  onReveal,
  value,
  description,
}: {
  readonly children: ReactNode;
  readonly selected: boolean;
  readonly onReveal: () => void;
  readonly value: string;
  readonly description: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  useEffect(() => {
    const panel = ref.current;
    const reveal = () => flushSync(() => revealRef.current());
    panel?.addEventListener(REVEAL_CONTROL_EVENT, reveal);
    return () => panel?.removeEventListener(REVEAL_CONTROL_EVENT, reveal);
  }, []);
  return (
    <TabsContent
      className="min-w-0 data-[state=inactive]:hidden"
      forceMount
      hidden={!selected}
      ref={ref}
      value={value}
    >
      {description === undefined ? null : (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      <div className="grid min-w-0 gap-3">{children}</div>
    </TabsContent>
  );
}

/** Composes existing controls without changing their names, values or identities. */
export function FieldLayout({
  fields,
  layout,
  renderField,
  errors,
  hiddenBlock = false,
  label = "Fields",
  visibleKeys,
}: {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly layout?: FormLayout | undefined;
  readonly renderField: (key: string) => ReactNode;
  readonly errors?: unknown;
  readonly hiddenBlock?: boolean;
  readonly label?: string;
  readonly visibleKeys?: ReadonlySet<string> | undefined;
}) {
  const [selected, setSelected] = useState(layout?.groups[0]?.key ?? "");
  const id = useId();
  const visible = (key: string) => visibleKeys === undefined || visibleKeys.has(key);
  const render = (key: string) =>
    visibleKeys === undefined ? (
      renderField(key)
    ) : (
      <div hidden={!visible(key)} key={key}>
        {renderField(key)}
      </div>
    );
  if (layout === undefined) return <>{Object.keys(fields).map(render)}</>;
  const visibleGroups = layout.groups.filter((group) => group.fields.some(visible));
  const entries = (errors ?? {}) as Record<string, unknown>;
  const problem = (keys: readonly string[]) =>
    keys.some((key) => layoutHasProblems(entries[key], hiddenBlock));
  const placed = layout.groups.flatMap((group) => group.fields);
  const rest = Object.keys(fields).filter((key) => !placed.includes(key));
  const current = visibleGroups.some((group) => group.key === selected)
    ? selected
    : (visibleGroups[0]?.key ?? "");
  return (
    <div className="grid min-w-0 gap-3">
      {layout.mode === "sections" ? (
        layout.groups.map((group) => (
          <section
            aria-labelledby={`${id}-${group.key}`}
            className="grid min-w-0 gap-3"
            key={group.key}
            hidden={!group.fields.some(visible)}
          >
            <h4 className="text-sm font-semibold" id={`${id}-${group.key}`}>
              {group.label}{" "}
              {problem(group.fields) ? (
                <span className="ml-2 text-destructive">Has problems</span>
              ) : null}
            </h4>
            {group.description === undefined ? null : (
              <p className="text-sm text-muted-foreground">{group.description}</p>
            )}
            {group.fields.map(render)}
          </section>
        ))
      ) : (
        <Tabs className="min-w-0" onValueChange={setSelected} value={current}>
          <div className="min-w-0 overflow-x-auto" hidden={visibleGroups.length === 0}>
            <TabsList aria-label={label}>
              {layout.groups.map((group) => (
                <TabsTrigger
                  key={group.key}
                  value={group.key}
                  hidden={!group.fields.some(visible)}
                  onFocus={(event) =>
                    event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" })
                  }
                >
                  {group.label}{" "}
                  {problem(group.fields) ? (
                    <span className="text-destructive">Has problems</span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {layout.groups.map((group) => (
            <Panel
              key={group.key}
              selected={current === group.key}
              onReveal={() => setSelected(group.key)}
              value={group.key}
              description={group.description}
            >
              {group.fields.map(render)}
            </Panel>
          ))}
        </Tabs>
      )}
      {rest.map(render)}
    </div>
  );
}
