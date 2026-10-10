/**
 * Reads the `token` parameter of a URL fragment such as `#token=…`. Account
 * links carry their secret only in the fragment, which browsers never send to
 * a server.
 */
export function readFragmentToken(hash: string): string | undefined {
  const value = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("token");
  return value === null || value.length === 0 ? undefined : value;
}

/**
 * Removes the fragment from the address bar without navigating or adding a
 * history entry, so the secret is not left visible, bookmarked, or shared.
 */
export function removeFragment(target: Pick<Window, "history" | "location"> = window): void {
  if (target.location.hash === "") return;
  const { pathname, search } = target.location;
  target.history.replaceState(target.history.state, "", `${pathname}${search}`);
}
