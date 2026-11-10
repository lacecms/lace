import type { SettingsVisibility } from "./types.js";
import { deepFreeze } from "../shared/objects.js";
import type { ChoiceDiagram } from "../fields/definitions.js";
import { field } from "../fields/builders.js";

/** Shared presentation rules for the independent scalar list settings. */
export function listLayoutSettingsVisibility(): SettingsVisibility<
  "layoutMode" | "layoutWrap" | "layoutPreset"
> {
  return deepFreeze({
    layoutWrap: { setting: "layoutMode", values: ["flex-row", "flex-column"] },
    layoutPreset: { setting: "layoutMode", values: ["grid"] },
  });
}

type Rect = readonly [number, number, number, number];

function cells(rects: readonly Rect[]): ChoiceDiagram {
  return { cells: rects.map(([x, y, width, height]) => ({ x, y, width, height })) };
}

/** Shared scalar settings for one explicitly adopted list, in any block. */
export function listLayoutSettings() {
  const columns = (count: number): ChoiceDiagram =>
    cells(
      Array.from({ length: count }, (_, i) => [i * (12 / count), 0, 12 / count - 1, 12] as const),
    );
  return deepFreeze({
    layoutMode: field.select({
      options: ["flex-row", "flex-column", "grid"],
      required: true,
      defaultValue: "grid",
      label: "Arrangement",
      presentation: {
        control: "cards",
        choices: [
          {
            value: "flex-row",
            label: "Horizontal",
            description: "Items flow across rows.",
            diagram: columns(3),
          },
          {
            value: "flex-column",
            label: "Vertical",
            description: "Items flow down columns. Wrapping needs a height set in site CSS.",
            diagram: cells([
              [0, 0, 12, 3],
              [0, 4, 12, 3],
              [0, 8, 12, 3],
            ]),
          },
          {
            value: "grid",
            label: "Grid",
            description: "Items use the selected grid preset.",
            diagram: cells([
              [0, 0, 5, 5],
              [6, 0, 5, 5],
              [0, 6, 5, 5],
              [6, 6, 5, 5],
            ]),
          },
        ],
      },
    }),
    layoutWrap: field.boolean({
      defaultValue: true,
      label: "Wrap items",
      description:
        "Applies to horizontal and vertical flex lists. Vertical wrapping requires a height set in site CSS.",
    }),
    layoutPreset: field.select({
      options: ["auto", "columns-2", "columns-3", "columns-4", "narrow-wide", "wide-narrow"],
      required: true,
      defaultValue: "auto",
      label: "Grid preset",
      description:
        "Applies when Grid is selected. Schematics show composition; your site controls styling.",
      presentation: {
        control: "cards",
        choices: [
          {
            value: "auto",
            label: "Auto",
            description: "As many equal columns as fit.",
            diagram: cells([
              [0, 0, 3, 5],
              [4, 0, 3, 5],
              [8, 0, 3, 5],
              [0, 6, 3, 5],
              [4, 6, 3, 5],
            ]),
          },
          {
            value: "columns-2",
            label: "Two columns",
            description: "Two equal columns from 32rem.",
            diagram: columns(2),
          },
          {
            value: "columns-3",
            label: "Three columns",
            description: "Two from 32rem, three from 48rem.",
            diagram: columns(3),
          },
          {
            value: "columns-4",
            label: "Four columns",
            description: "Two from 32rem, three from 48rem, four from 64rem.",
            diagram: columns(4),
          },
          {
            value: "narrow-wide",
            label: "Narrow + wide",
            description: "Alternating 1:2 columns from 32rem.",
            diagram: cells([
              [0, 0, 3, 12],
              [4, 0, 8, 12],
            ]),
          },
          {
            value: "wide-narrow",
            label: "Wide + narrow",
            description: "Alternating 2:1 columns from 32rem.",
            diagram: cells([
              [0, 0, 8, 12],
              [9, 0, 3, 12],
            ]),
          },
        ],
      },
    }),
  });
}

/**
 * Shared item fields for one explicitly adopted list: spread them into the
 * list's item group. `placement` applies to grid lists only.
 */
export function listLayoutItemFields() {
  return deepFreeze({
    placement: field.select({
      options: ["auto", "full", "start", "end"],
      required: true,
      defaultValue: "auto",
      label: "Placement",
      description:
        "Applies to grid lists. Start, end and full choose the first column, the last column or the whole row.",
      presentation: {
        control: "cards",
        choices: [
          {
            value: "auto",
            label: "Auto",
            description: "Takes the next free cell.",
            diagram: cells([
              [0, 0, 5, 5],
              [6, 0, 5, 5],
            ]),
          },
          {
            value: "full",
            label: "Full row",
            description: "Spans every column of its row.",
            diagram: cells([[0, 0, 12, 5]]),
          },
          {
            value: "start",
            label: "First column",
            description: "Starts a row in the first column.",
            diagram: cells([[0, 0, 5, 5]]),
          },
          {
            value: "end",
            label: "Last column",
            description: "Sits in the last column of its row.",
            diagram: cells([[6, 0, 5, 5]]),
          },
        ],
      },
    }),
  });
}

// The opt-in full-screen original of the `image` and `gallery` blocks.
export const lightboxSetting = field.boolean({
  defaultValue: false,
  description: "Opens the original image full screen when it is selected.",
  label: "Open full screen",
});
