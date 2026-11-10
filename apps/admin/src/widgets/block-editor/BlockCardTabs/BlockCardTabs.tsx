import type { ReactNode } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/Tabs/index.js";

export type BlockTab = "content" | "settings";

function TabProblemMarker({ shown }: { readonly shown: boolean }) {
  return shown ? (
    <>
      <CircleAlertIcon aria-hidden className="size-3.5 text-destructive" />
      <span className="sr-only"> (has problems)</span>
    </>
  ) : undefined;
}

export function BlockCardTabs({
  contentFields,
  contentProblems,
  empty,
  label,
  onTabChange,
  settingsFields,
  settingsProblems,
  tab,
}: {
  readonly contentFields: ReactNode;
  readonly contentProblems: boolean;
  readonly empty: boolean;
  readonly label: string;
  readonly onTabChange?: ((tab: BlockTab) => void) | undefined;
  readonly settingsFields: ReactNode;
  readonly settingsProblems: boolean;
  readonly tab: BlockTab;
}) {
  return (
    <Tabs onValueChange={(next) => onTabChange?.(next as BlockTab)} value={tab}>
      <TabsList aria-label={`${label} block sections`}>
        <TabsTrigger value="content">
          Content
          <TabProblemMarker shown={contentProblems} />
        </TabsTrigger>
        <TabsTrigger value="settings">
          Settings
          <TabProblemMarker shown={settingsProblems} />
        </TabsTrigger>
      </TabsList>
      {/* Both panels stay mounted so rich-text and media controls keep their state.
                They hold focusable controls, so the panels themselves are not tab stops. */}
      <TabsContent
        className="grid gap-3 outline-hidden"
        data-block-tab="content"
        forceMount
        hidden={tab !== "content"}
        tabIndex={-1}
        value="content"
      >
        {contentFields}
        {empty ? (
          <p className="m-0 text-sm text-muted-foreground">This block has no content fields.</p>
        ) : undefined}
      </TabsContent>
      <TabsContent
        className="outline-hidden"
        data-block-tab="settings"
        forceMount
        hidden={tab !== "settings"}
        tabIndex={-1}
        value="settings"
      >
        {settingsFields}
      </TabsContent>
    </Tabs>
  );
}
