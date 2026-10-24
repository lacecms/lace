import { collectFieldInternalLinks, decodeEntryLink, encodeEntryLink } from "@lacecms/content";
import type { ContentModelDto, LinkTargetStatusesDto } from "@lacecms/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import type { DraftEditorValues, FieldRendererProps } from "../../../entities/content/index.js";
import { builtInRenderers } from "../../../entities/content/index.js";
import { errorDescription, useAdminClient } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../../shared/ui/Popover/index.js";

const TargetContext = createContext<{
  readonly statuses?: LinkTargetStatusesDto;
  readonly error?: string;
  readonly refresh: () => void;
}>({ refresh() {} });

/** One descriptor-driven resolver cache for the current editor, including collapsed fields. */
export function LinkAuthoringProvider({
  form,
  model,
  children,
}: {
  readonly form: UseFormReturn<DraftEditorValues, unknown, DraftEditorValues>;
  readonly model: ContentModelDto;
  readonly children: ReactNode;
}) {
  const client = useAdminClient();
  const watched = useWatch<Record<string, unknown>>({ control: form.control as never });
  const values = watched as unknown as Partial<DraftEditorValues>;
  const definitions = new Map(model.blockDefinitions?.map((block) => [block.type, block.fields]));
  const references = [
    ...collectFieldInternalLinks(model.fields, (values.fields ?? {}) as never),
    ...(values.blocks ?? []).flatMap((block) =>
      collectFieldInternalLinks(
        definitions.get(block.type ?? "") ?? {},
        (block.data ?? {}) as never,
      ),
    ),
  ];
  const ids = [...new Set(references.map((item) => item.targetId))].sort();
  const query = useQuery({
    queryKey: ["admin", "link-statuses", ids],
    enabled: ids.length > 0,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const results = [];
      for (let start = 0; start < ids.length; start += 200)
        results.push(await client.resolveLinkTargets(ids.slice(start, start + 200), signal));
      return Object.assign(Object.create(null), ...results) as LinkTargetStatusesDto;
    },
  });
  return (
    <TargetContext.Provider
      value={{
        ...(query.data === undefined ? {} : { statuses: query.data }),
        ...(query.error === null ? {} : { error: errorDescription(query.error) }),
        refresh: () => {
          void query.refetch();
        },
      }}
    >
      {children}
    </TargetContext.Provider>
  );
}

export function OrdinaryUrlField(props: FieldRendererProps) {
  if (props.definition.type === "url" && props.definition.embedProviders !== undefined)
    return <builtInRenderers.url {...props} />;
  return <UrlTargetField {...props} />;
}
function UrlTargetField(props: FieldRendererProps) {
  const { id, label, readOnly, value, onChange, onBlur, invalid, describedBy } = props;
  const client = useAdminClient();
  const targets = useContext(TargetContext);
  const targetId = decodeEntryLink(value);
  const [mode, setMode] = useState<"manual" | "cms">(targetId === undefined ? "manual" : "cms");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [prefix, setPrefix] = useState("");
  useEffect(() => {
    setMode(decodeEntryLink(value) === undefined ? "manual" : "cms");
  }, [value]);
  useEffect(() => {
    const timer = setTimeout(() => setPrefix(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const picker = useInfiniteQuery({
    queryKey: ["admin", "link-targets", prefix],
    enabled: open && !readOnly,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.listLinkTargets(
        {
          search: prefix,
          status: "published",
          limit: 20,
          ...(pageParam === undefined ? {} : { after: pageParam }),
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
  const target = targetId === undefined ? undefined : targets.statuses?.[targetId];
  const manual = (
    <builtInRenderers.url {...props} value={targetId === undefined ? value : undefined} />
  );
  return (
    <div className="grid gap-2">
      <div aria-label={`${label} destination mode`} className="flex gap-1" role="group">
        <Button
          aria-pressed={mode === "manual"}
          disabled={readOnly}
          onClick={() => setMode("manual")}
          size="sm"
          variant="outline"
        >
          Manual URL
        </Button>
        <Button
          aria-pressed={mode === "cms"}
          disabled={readOnly}
          onClick={() => setMode("cms")}
          size="sm"
          variant="outline"
        >
          CMS entry
        </Button>
      </div>
      {mode === "manual" ? (
        <>
          {manual}
          {targetId !== undefined && (
            <p className="m-0 text-xs text-muted-foreground">
              The selected CMS entry is kept until you enter or clear a URL.
            </p>
          )}
        </>
      ) : (
        <>
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) onBlur();
            }}
          >
            <PopoverTrigger asChild>
              <Button
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                disabled={readOnly}
                variant="outline"
              >
                {target !== undefined && "title" in target
                  ? target.title
                  : targetId === undefined
                    ? "Choose CMS entry"
                    : `Destination ${targetId}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="grid w-80 gap-2"
              aria-label={`Choose ${label} destination`}
              role="dialog"
            >
              <Input
                aria-label="Search destinations by title prefix"
                type="search"
                value={search}
                maxLength={100}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
              <div className="grid max-h-64 gap-1 overflow-auto">
                {picker.isPending && <p role="status">Loading destinations…</p>}
                {picker.isError && (
                  <p role="alert">
                    {errorDescription(picker.error)}{" "}
                    <Button
                      onClick={() => {
                        void picker.refetch();
                      }}
                    >
                      Retry search
                    </Button>
                  </p>
                )}
                {picker.isSuccess && picker.data.pages.every((page) => page.items.length === 0) && (
                  <p role="status">No destinations found.</p>
                )}
                {[
                  ...new Map(
                    picker.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
                  ).values(),
                ].map((item) => (
                  <Button
                    className="h-auto justify-start whitespace-normal text-left"
                    key={item.id}
                    variant="ghost"
                    onClick={() => {
                      onChange(encodeEntryLink(item.id));
                      setOpen(false);
                      onBlur();
                    }}
                  >
                    <span>
                      {item.title}
                      <small className="block">
                        {item.modelKey} · {item.state === "published" ? item.path : "Unpublished"}
                      </small>
                    </span>
                  </Button>
                ))}
                {picker.hasNextPage && (
                  <Button
                    disabled={picker.isFetchingNextPage}
                    onClick={() => {
                      void picker.fetchNextPage();
                    }}
                  >
                    More destinations
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {targetId === undefined && value !== undefined && (
            <p className="m-0 text-xs text-muted-foreground">
              The manual URL is kept until you choose an entry or clear it.
            </p>
          )}
        </>
      )}
      {targetId !== undefined && (
        <div className="text-xs" role="status">
          {targets.error ? (
            <>
              {targets.error}{" "}
              <Button onClick={targets.refresh} variant="ghost" size="sm">
                Retry status
              </Button>
            </>
          ) : target === undefined ? (
            "Loading destination status…"
          ) : target.state === "published" ? (
            `${target.modelKey} · ${target.path}`
          ) : target.state === "missing" ? (
            `Missing destination (${targetId}). Replace or clear it.`
          ) : target.state === "non-routable" ? (
            `Destination ${targetId} has no public route. Replace or clear it.`
          ) : (
            `${target.title} · ${target.modelKey} · Unpublished. Replace or clear it.`
          )}
        </div>
      )}
      {value !== undefined && (
        <Button
          disabled={readOnly}
          onClick={() => {
            onChange(undefined);
            onBlur();
          }}
          size="sm"
          variant="ghost"
        >
          Clear {label}
        </Button>
      )}
    </div>
  );
}
