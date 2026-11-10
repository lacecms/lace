import type { BlockTab } from "./BlockCardTabs/index.js";

export interface BlockActions {
  readonly activate: (key: string) => void;
  readonly announce: (message: string) => void;
  readonly duplicate: (key: string) => void;
  readonly move: (key: string, offset: number) => void;
  readonly remove: (key: string) => void;
  readonly selectTab: (key: string, tab: BlockTab) => void;
  readonly toggleCollapsed: (key: string) => void;
}
