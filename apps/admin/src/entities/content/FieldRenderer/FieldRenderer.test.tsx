import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import type { DraftEditorValues } from "../editor-form.js";
import {
  FieldRenderer,
  FieldRendererProvider,
  type FieldDefinition,
  type FieldRendererProps,
} from "./index.js";

function Harness({
  annotation,
  definition,
  error,
  notice,
  placeholder,
  wrap = (children) => children,
}: {
  readonly annotation?: string;
  readonly definition: FieldDefinition;
  readonly error?: string;
  readonly notice?: ReactNode;
  readonly placeholder?: string;
  readonly wrap?: (children: ReactNode) => ReactNode;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  return wrap(
    <>
      <FieldRenderer
        annotation={annotation}
        control={form.control}
        definition={definition}
        error={error}
        fieldKey="heroImage"
        name="fields.heroImage"
        notice={notice}
        placeholder={placeholder}
      />
      <output data-testid="value">{JSON.stringify(form.watch("fields.heroImage") ?? null)}</output>
    </>,
  );
}

test("renders a labelled built-in control described by its help text and error", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      definition={{ description: "Shown on cards.", maxLength: 40, required: true, type: "text" }}
      error="Required."
    />,
  );

  const input = screen.getByRole("textbox", { name: "Hero Image" });
  expect(input).toHaveAttribute("id", "field-fields-heroImage");
  expect(input).toHaveAccessibleDescription(
    "Shown on cards. Required for publication only. Limit: 40 characters. 0 characters Required.",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Required.");
  await user.type(input, "Cover");
  expect(screen.getByTestId("value")).toHaveTextContent('"Cover"');
});

test("uses a registry-provided renderer for media and explains when none is provided", async () => {
  const user = userEvent.setup();
  function MediaRenderer({ label, onChange }: FieldRendererProps) {
    return (
      <button onClick={() => onChange("media-1")} type="button">
        Choose media for {label}
      </button>
    );
  }
  render(
    <Harness
      definition={{ required: false, type: "media" }}
      wrap={(children) => (
        <FieldRendererProvider renderers={{ media: MediaRenderer }}>
          {children}
        </FieldRendererProvider>
      )}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Choose media for Hero Image" }));
  expect(screen.getByTestId("value")).toHaveTextContent('"media-1"');

  document.body.replaceChildren();
  render(<Harness definition={{ required: false, type: "media" }} />);
  expect(screen.getByText("Media selection is not available here.")).toBeInTheDocument();
});

test("a placeholder is shown in text controls and is part of the description", () => {
  render(
    <Harness
      definition={{ description: "Shown on cards.", required: false, type: "text" }}
      placeholder="Uses media alt: Red bicycle"
    />,
  );
  const input = screen.getByRole("textbox", { name: "Hero Image" });
  expect(input).toHaveAttribute("placeholder", "Uses media alt: Red bicycle");
  expect(input).toHaveAccessibleDescription(
    "Shown on cards. 0 characters Uses media alt: Red bicycle",
  );
});

test("textarea controls apply the placeholder too", () => {
  render(<Harness definition={{ required: false, type: "textarea" }} placeholder="Inherited" />);
  expect(screen.getByRole("textbox", { name: "Hero Image" })).toHaveAttribute(
    "placeholder",
    "Inherited",
  );
});

test("a notice describes the control for writers and is hidden when view only", () => {
  const { unmount } = render(
    <Harness definition={{ required: false, type: "text" }} notice={<p>No alt text.</p>} />,
  );
  expect(screen.getByRole("textbox", { name: "Hero Image" })).toHaveAccessibleDescription(
    "0 characters No alt text.",
  );
  unmount();
  render(
    <Harness
      definition={{ required: false, type: "text" }}
      notice={<p>No alt text.</p>}
      wrap={(children) => (
        <FieldRendererProvider readOnly renderers={{}}>
          {children}
        </FieldRendererProvider>
      )}
    />,
  );
  expect(screen.queryByText("No alt text.")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Hero Image" })).toHaveAccessibleDescription(
    "0 characters",
  );
});

test("an annotation is shown to every user and describes the control", () => {
  render(
    <Harness
      annotation="Site name used in search and social titles."
      definition={{ description: "Shown in the header.", required: false, type: "text" }}
      wrap={(children) => (
        <FieldRendererProvider readOnly renderers={{}}>
          {children}
        </FieldRendererProvider>
      )}
    />,
  );
  expect(screen.getByText("Site name used in search and social titles.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Hero Image" })).toHaveAccessibleDescription(
    "Shown in the header. 0 characters Site name used in search and social titles.",
  );
});

test("CE9A inherited prompts override configured generic text and empty prompts suppress fallback", () => {
  const { unmount } = render(
    <Harness
      definition={{ type: "text", required: false, placeholder: "Generic" }}
      placeholder="Uses media alt: Cover"
    />,
  );
  expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Uses media alt: Cover");
  unmount();
  render(<Harness definition={{ type: "url", required: false, placeholder: "" }} />);
  expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "");
});
