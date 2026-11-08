import type { InvitationView, LinkIssueResult, InvitationIssueResult } from "@lacecms/application";
import { toIsoTimestamp } from "@lacecms/contracts";

export function invitationDto(value: InvitationView) {
  return {
    createdAt: toIsoTimestamp(value.createdAt),
    email: value.email,
    expiresAt: toIsoTimestamp(value.expiresAt),
    id: value.id,
    invitedBy: value.invitedBy,
    role: value.role,
    state: value.state,
  };
}

export function linkIssueDto(value: LinkIssueResult) {
  return {
    delivery:
      value.delivery.status === "sent"
        ? { status: "sent" as const }
        : { reason: value.delivery.reason, status: "failed" as const },
    ...(value.link === undefined ? {} : { link: value.link }),
  };
}

export function invitationIssueDto(value: InvitationIssueResult) {
  return { ...linkIssueDto(value), invitation: invitationDto(value.invitation) };
}
