type Role = "admin" | "editor" | "viewer";

const permissions: Readonly<Record<Role, readonly string[]>> = {
  admin: [
    "content:read",
    "content:write",
    "content:publish",
    "media:write",
    "users:manage",
    "settings:manage",
  ],
  editor: ["content:read", "content:write", "media:write"],
  viewer: ["content:read"],
};

/** The path the admin reads its identity and server-derived permissions from. */
export const sessionPath = "/api/v1/admin/session";

/** A session-summary body with the server's default grants for a role. */
export function sessionSummary(input: {
  readonly displayName?: string;
  readonly email?: string;
  readonly id: string;
  readonly role: Role;
}) {
  const email = input.email ?? `${input.role}@lace.test`;
  return {
    permissions: [...permissions[input.role]],
    user: {
      displayName: input.displayName ?? email,
      email,
      id: input.id,
      role: input.role,
    },
  };
}
