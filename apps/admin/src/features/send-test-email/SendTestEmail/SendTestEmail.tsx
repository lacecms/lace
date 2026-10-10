import type { EmailFailureReasonDto } from "@lacecms/contracts";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useSessionRecovery } from "../../../entities/session/index.js";
import { errorDescription, technicalDetails, useAdminClient } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

const failureText: Readonly<Record<EmailFailureReasonDto, { title: string; detail: string }>> = {
  invalid_message: {
    title: "The test message could not be addressed",
    detail: "Check that your account has a valid email address.",
  },
  not_configured: {
    title: "Email delivery is not configured",
    detail: "Set LACE_EMAIL_PROVIDER and LACE_EMAIL_FROM on the server, then restart it.",
  },
  rate_limited: {
    title: "The provider's sending limit was reached",
    detail: "Wait for the provider's quota to reset, then try again.",
  },
  rejected: {
    title: "The provider rejected the sender or recipient",
    detail: "Check that the sender address and its domain are verified with your provider.",
  },
  unavailable: {
    title: "The provider could not be reached",
    detail: "Check the email settings and the server logs, then try again.",
  },
};

/** Explains a closed delivery failure without provider error text. */
export function emailFailureText(reason: EmailFailureReasonDto) {
  return failureText[reason];
}

/**
 * Sends the fixed test message to the signed-in administrator. The browser
 * never chooses the recipient: the server addresses the acting account.
 */
export function SendTestEmail({ address }: { readonly address: string }) {
  const client = useAdminClient();
  const send = useMutation({
    mutationFn: client.sendTestEmail,
    onSuccess: (result) => {
      if (result.status === "sent")
        toast.success(`The provider accepted a test message for ${address}.`);
    },
  });
  useSessionRecovery(send.error);
  const failure =
    send.data?.status === "failed" && !send.isPending ? emailFailureText(send.data.reason) : null;
  return (
    <div className="grid gap-2">
      <div>
        <Button disabled={send.isPending} onClick={() => send.mutate()} size="sm" variant="outline">
          <Send aria-hidden="true" />
          {send.isPending ? "Sending…" : "Send test email"}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted-foreground">Sends a test message to {address}.</p>
      {failure === null ? undefined : (
        <div className="grid gap-0.5 text-sm" role="alert">
          <p className="m-0 font-medium text-destructive">{failure.title}</p>
          <p className="m-0 text-muted-foreground">{failure.detail}</p>
        </div>
      )}
      {send.error === null ? undefined : (
        <ErrorState
          description={errorDescription(send.error)}
          technicalDetails={technicalDetails(send.error)}
        />
      )}
    </div>
  );
}
