import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";

const loaded = vi.hoisted(() => ({ tiptapCore: vi.fn(), tiptapReact: vi.fn(), dnd: vi.fn() }));
vi.mock("@tiptap/core", () => {
  loaded.tiptapCore();
  return {};
});
vi.mock("@tiptap/react", () => {
  loaded.tiptapReact();
  return {};
});
vi.mock("@dnd-kit/core", () => {
  loaded.dnd();
  return {};
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { readonly children: ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("../../../entities/session/index.js", () => ({
  useSession: () => ({ displayName: "Ada", role: "admin", permissions: [] }),
  useSessionRecovery: () => undefined,
  can: () => false,
  roleLabel: () => "Admin",
}));
vi.mock("../../../shared/api/index.js", () => ({
  adminQueryKeys: { models: ["models"] },
  useAdminClient: () => ({ listModels: async () => ({ items: [] }) }),
}));

test("isolated sidebar does not evaluate editor dependencies", async () => {
  const { SidebarNav } = await import("./SidebarNav.js");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SidebarNav onSignOut={() => undefined} signingOut={false} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
  expect(loaded.tiptapCore).not.toHaveBeenCalled();
  expect(loaded.tiptapReact).not.toHaveBeenCalled();
  expect(loaded.dnd).not.toHaveBeenCalled();
  await import("@tiptap/core");
  expect(loaded.tiptapCore).toHaveBeenCalledOnce();
});
