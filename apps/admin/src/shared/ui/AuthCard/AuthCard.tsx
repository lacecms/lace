import { useId, type ReactNode } from "react";

/**
 * A focused card outside the shell for screens a visitor reaches before or
 * without signing in: the product mark, a heading, a short description, and
 * one task.
 */
export function AuthCard({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description?: string | undefined;
  readonly title: string;
}) {
  const titleId = useId();
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <section
        aria-labelledby={titleId}
        className="grid w-full max-w-sm min-w-0 gap-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8"
      >
        <div className="grid justify-items-center gap-3 text-center">
          <p className="m-0 flex items-center gap-2 text-base font-semibold">
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground"
            >
              L
            </span>
            Lace
          </p>
          <div className="grid gap-1">
            <h1 className="m-0 text-xl font-semibold tracking-tight" id={titleId}>
              {title}
            </h1>
            {description === undefined ? undefined : (
              <p className="m-0 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
