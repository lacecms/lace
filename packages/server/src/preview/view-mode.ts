import type { PreviewAccessOrigins } from "@lacecms/application";
import { parse } from "tldts";

function knownRegistrableDomain(hostname: string): string | null {
  if (hostname.endsWith(".")) return null;
  const { domain, isIcann, isPrivate } = parse(hostname, { allowPrivateDomains: true });
  return isIcann || isPrivate ? domain : null;
}

/** Same-site cookies require scheme and registrable-domain agreement, including private suffixes. */
export function supportsPreviewFrame({
  adminOrigin,
  previewOrigin,
}: PreviewAccessOrigins): boolean {
  const admin = new URL(adminOrigin);
  const preview = new URL(previewOrigin);
  if (
    admin.protocol !== "https:" ||
    preview.protocol !== "https:" ||
    admin.hostname === preview.hostname
  )
    return false;
  const site = knownRegistrableDomain(admin.hostname);
  return site !== null && site === knownRegistrableDomain(preview.hostname);
}
