import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { EntryEditorActions, type SaveState } from "./EntryEditorActions.js";

const states: readonly [SaveState, string][] = [
  [{ kind: "dirty" }, "Unsaved changes"],
  [{ kind: "failed" }, "Not saved"],
  [{ kind: "saved", revision: 3 }, "Saved revision 3"],
  [{ kind: "saving" }, "Saving…"],
];

test("the indicator names each save state in text and Save is bound to the form", () => {
  for (const [state, text] of states) {
    render(<EntryEditorActions form="entry-draft-form" saveDisabled={false} state={state} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
    const save = screen.getByRole("button", { name: "Save draft" });
    expect(save).toHaveAttribute("form", "entry-draft-form");
    expect(save).toHaveAttribute("type", "submit");
    expect(save).toHaveAttribute("aria-keyshortcuts", "Meta+S Control+S");
    document.body.replaceChildren();
  }
});

test("view-only editors get the indicator without Save", () => {
  render(
    <EntryEditorActions
      form="entry-draft-form"
      publish={<button type="button">Publish</button>}
      saveDisabled
      state={{ kind: "view-only" }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("View only");
  expect(screen.queryByRole("button", { name: /Save/u })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
});
